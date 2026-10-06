import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";
import fs from "fs";
import multer from "multer";
import jwt from "jsonwebtoken";
import cors from "cors"; 
import { exec, execFile } from "child_process";

// Load environment variables
dotenv.config();

import {
  initDatabase,
  dbGetProjects,
  dbCreateProject,
  dbUpdateProject,
  dbDeleteProject,
  dbGetAllMetadata,
  dbUpdateMetadata,
  dbGetUsers,
  dbCreateUser,
  dbUpdateUser,
  dbDeleteUser,
  getDbStatus,
  dbGetActualProgress,
  dbUpdateActualProgress,
  dbResetActualProgress,
  dbGetProjectAttachments,
  dbCreateProjectAttachment,
  dbGetAttachmentById,
  dbDeleteAttachment,
  dbGetProjectHistory,
  dbCreateProjectHistory,
  dbGetEmailConfig,
  dbSaveEmailConfig,
  dbGetUploadConfig,
  dbSaveUploadConfig,
  dbGetPasswordPolicy,
  dbSavePasswordPolicy,
  dbResetUserPassword,
  dbRenameInvestor,
  dbRenameAgency,
  dbGetMetadata,
  dbRenameCatalogValue,
  CATALOG_PROJECT_FIELDS,
  dbGetStepProgress,
  dbSaveStepProgress,
  dbResetStepProgressActuals
} from "./server/db";
import {
  composeProject, effectiveProgress, findProcess, materializeLegacyMilestone, milestoneOfStep, stepStatusFields
} from "./server/progressService";
import {
  ProgressSide, ProjectStepProgress, ProgressAttachment,
  applyMilestoneInput, applyMilestonePlan, applyStepPlan, applyStepUpdate,
  catalogMilestones, DONE_STEP_STATUSES, isInvestorStep, isoToDisplay, legacyPhaseOf,
  linkedProcedures, milestoneKey, milestoneMovedStepIds, procedureState, processSteps, skippedStepIds, toIsoDate
} from "./src/lib/stepProgress";
import { hashPassword, generatePolicyCompliantPassword } from "./src/lib/crypto";
import { verifyPassword, hashNewPassword, needsRehash, passwordFingerprint } from "./server/passwords";
import { isProjectInWard } from "./src/lib/wardMatch";
import { computeActivePhase } from "./src/lib/phaseLogic";
import { isDateBefore, parseDateStrict } from "./src/lib/dateCompare";
import { normalizeAgencyName, resolveProjectStepAgency, resolveProjectStep, flattenProcessSteps } from "./src/lib/stepAgency";
import nodemailer from "nodemailer";

// Ensure physical uploads directory exists
const UPLOADS_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Config Multer
// Hard ceiling enforced while streaming (the per-type/size rules configured by Admin are checked afterwards).
// Without it a client could fill the disk before the configured size check ever runs.
const UPLOAD_HARD_LIMIT_MB = Number(process.env.UPLOAD_HARD_LIMIT_MB) || 100;
// defParamCharset utf8: browsers send the file name as UTF-8; multer's latin1 default turned
// Vietnamese names into mojibake ("Báo cáo" → "BÃ¡o cÃ¡o")
const upload = multer({ dest: UPLOADS_DIR, defParamCharset: 'utf8', limits: { fileSize: UPLOAD_HARD_LIMIT_MB * 1024 * 1024, files: 1 } });

// Names saved before the utf8 fix are UTF-8 bytes read as latin1. Repair them for display and for the
// downloaded file name; the file on disk keeps the stored (garbled) name.
function repairUploadedName(name: string): string {
  const value = String(name ?? '');
  if (!/[\u0080-ÿ]/.test(value) || /[^\u0000-ÿ]/.test(value)) return value;
  const decoded = Buffer.from(value, 'latin1').toString('utf8');
  return decoded.includes('�') ? value : decoded;
}

// Path of a stored attachment. Path separators in the name ("quy hoạch 1/500") would point into a
// non-existent sub-folder (or outside uploads/), so they are replaced; names without them keep the
// same file name as before.
function attachmentFilePath(id: number | string, name: string): string {
  const safeName = String(name ?? '').replace(/[\\/]/g, '_');
  return path.join(UPLOADS_DIR, `attachment_${id}_${safeName}`);
}

async function startServer() {
  // Initialize PostgreSQL database with fallback
  await initDatabase();

  const app = express();
  // Overridable (Dockerfile/PM2 set PORT); several instances can then run side by side
  const PORT = Number(process.env.PORT) || 3000;
  app.use(cors());   
  app.use(express.json());

  // JWT configuration
  // No fallback: a missing or publicly known secret would let anyone mint an Admin token
  const JWT_SECRET = (process.env.JWT_SECRET || "").trim();
  const KNOWN_PUBLIC_SECRETS = ["noxh_governance_secure_key_2026"];
  if (!JWT_SECRET || KNOWN_PUBLIC_SECRETS.includes(JWT_SECRET)) {
    console.error(
      "❌ JWT_SECRET chưa được cấu hình hoặc đang dùng giá trị mặc định công khai. Server dừng khởi động.\n" +
      "   Tạo secret mới: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"\n" +
      "   rồi đặt JWT_SECRET=<giá trị> trong file .env"
    );
    process.exit(1);
  }
  if (JWT_SECRET.length < 32) {
    console.warn("⚠️ JWT_SECRET ngắn hơn 32 ký tự. Nên thay bằng secret ngẫu nhiên dài hơn (xem .env.example).");
  }

  const GENERIC_SERVER_ERROR = "Hệ thống đang gặp sự cố, vui lòng thử lại sau hoặc liên hệ quản trị viên.";
  function sendError(res: any, err: any) {
    const status = err?.statusCode || 500;
    if (status >= 500) {
      console.error("❌ Server error:", err);
      return res.status(status).json({ error: GENERIC_SERVER_ERROR });
    }
    return res.status(status).json({ error: err?.message || GENERIC_SERVER_ERROR });
  }

  // Self-editable profile text: keep the current value when omitted; null/non-string becomes "" (never null)
  function profileText(value: any, current: any): string {
    if (value === undefined) return typeof current === "string" ? current : "";
    return typeof value === "string" ? value.trim() : "";
  }

  // Role helpers: Admin = system administrator; SXD (agency '1') manages users/catalogs but cannot touch Admin accounts
  function isAdminUser(u: any): boolean {
    return String(u?.roleId || '').toLowerCase() === 'admin';
  }
  function isSxdOrAdminUser(u: any): boolean {
    return isAdminUser(u) || (u?.userType === 'agency' && u?.agencyId === '1');
  }
  // ─── Project scope ────────────────────────────────────────────────────────────────────────
  // One rule decides which projects an account may see; every project-level route (list, history,
  // attachments, actual progress, edits) applies it, so nothing outside the account's scope leaks.
  type AccessContext = { processes: any[]; agencies: any[]; actualProgress: Record<string, any> };

  function buildAccessContext(meta: any, actualProgress: Record<string, any>): AccessContext {
    return { processes: meta?.processes || [], agencies: meta?.processingAgencies || [], actualProgress: actualProgress || {} };
  }

  async function loadAccessContext(): Promise<AccessContext> {
    const state = await loadProgressState();
    return buildAccessContext(state.meta, state.derivedActual);
  }

  // Every project composed from its step progress (server/progressService), with the milestone view and
  // the milestone values in the former actual-progress shape (still read by the dashboards)
  async function loadProgressState() {
    const [projects, meta, legacyActual, rows] = await Promise.all([
      dbGetProjects(), dbGetAllMetadata(), dbGetActualProgress(), dbGetStepProgress()
    ]);
    const composed = projects.map((p: any) => ({ raw: p, rows: rows[p.id], ...composeProject(p, meta, legacyActual?.[p.id] || {}, rows[p.id]) }));
    const derivedActual: Record<string, any> = {};
    composed.forEach(c => { derivedActual[c.project.id] = c.legacyActual; });
    return { meta, legacyActual: legacyActual || {}, composed, derivedActual };
  }

  // Agency of the project's current step (resolved by step id inside its own process: step names
  // repeat across agencies) and of its active phase (same phase rule as the dashboards)
  // The current step decides. The active phase (milestone dates / Gantt "TT") is only a fallback for a
  // project whose step cannot be resolved: the two are recorded separately, and marking a milestone done
  // in the Gantt must not hand a project still at an SXD step to SQHKT or the ward.
  function projectAgencies(p: any, ctx: AccessContext) {
    const stepAgency = resolveProjectStepAgency(p, ctx.processes);
    return {
      stepAgency,
      activeAgency: stepAgency ? '' : normalizeAgencyName(computeActivePhase(p, ctx.actualProgress[p.id]).activeAgency)
    };
  }

  // Steps a ward (UBND cấp xã, phường) works on: its own and the SQHKT planning step in its ward
  const WARD_WORK_AGENCIES = ['UBND cấp xã, phường', 'Sở Quy hoạch Kiến trúc'];
  function isAtWardStep(p: any, ctx: AccessContext): boolean {
    const { stepAgency, activeAgency } = projectAgencies(p, ctx);
    return WARD_WORK_AGENCIES.includes(stepAgency) || WARD_WORK_AGENCIES.includes(activeAgency);
  }

  function canViewProject(user: any, p: any, ctx: AccessContext): boolean {
    if (!user || !p) return false;
    if (isSxdOrAdminUser(user)) return true;

    if (user.userType === 'investor') {
      return p.investor === user.investorId;
    }
    if (user.userType !== 'agency') return false;

    // UBND cấp xã, phường: follows every project located in its own ward, at any stage
    if (user.agencyId === '6') {
      return isProjectInWard(p.location, user.department || '');
    }

    const { stepAgency, activeAgency } = projectAgencies(p, ctx);

    // Other agencies: projects at their step or in their active phase
    const userAgencyName = normalizeAgencyName(ctx.agencies.find((a: any) => a.id === user.agencyId)?.name);
    let isMatch = !!userAgencyName && (stepAgency === userAgencyName || activeAgency === userAgencyName);
    if (!isMatch) {
      const uLower = userAgencyName.toLowerCase();
      const sAgency = (stepAgency || '').toLowerCase();
      const aAgency = (activeAgency || '').toLowerCase();
      // Stored currentAgency only matters when the step itself is unknown (same rule as above)
      const curAgency = stepAgency ? '' : (p.currentAgency || '').toLowerCase();
      const anyIncludes = (...words: string[]) => [sAgency, aAgency, curAgency].some(v => words.some(w => v.includes(w)));
      if (uLower.includes('quy hoạch') || uLower.includes('kiến trúc') || user.agencyId === '2') {
        isMatch = anyIncludes('quy hoạch', 'kiến trúc');
      } else if (uLower.includes('tài nguyên') || uLower.includes('môi trường') || uLower.includes('nnmt') || user.agencyId === '3') {
        isMatch = anyIncludes('tài nguyên', 'môi trường');
      } else if (uLower.includes('tài chính') || user.agencyId === '5') {
        isMatch = anyIncludes('tài chính');
      }
    }
    return isMatch;
  }

  // Updating a project (general info, plan, progress, history, attachments). Same scope as viewing,
  // except a ward: it sees every project of its ward but works only on those at a ward / SQHKT step.
  // Create/delete stay SXD/Admin.
  function canEditProject(user: any, p: any, ctx: AccessContext): boolean {
    if (!canViewProject(user, p, ctx)) return false;
    if (user?.userType === 'agency' && user?.agencyId === '6' && !isSxdOrAdminUser(user)) {
      return isAtWardStep(p, ctx);
    }
    return true;
  }

  // Loads the project and checks the account's scope; sends 404/403 and returns null when refused
  async function requireProjectAccess(req: any, res: any, projectId: string, mode: 'view' | 'edit'): Promise<any | null> {
    const state = await loadProgressState();
    const project = state.composed.find(c => String(c.project.id) === String(projectId))?.project;
    if (!project) {
      res.status(404).json({ error: "Không tìm thấy dự án." });
      return null;
    }
    const ctx = buildAccessContext(state.meta, state.derivedActual);
    const allowed = mode === 'view' ? canViewProject(req.user, project, ctx) : canEditProject(req.user, project, ctx);
    if (!allowed) {
      res.status(403).json({
        error: mode === 'view'
          ? "Bạn không có quyền xem dự án này."
          : "Bạn không có quyền cập nhật dự án này (ngoài địa bàn hoặc ngoài bước phân công)."
      });
      return null;
    }
    return project;
  }

  // Account as seen by `viewer`: never the password; email/phone/avatar of OTHER accounts only for
  // SXD/Admin (user management). Everyone else keeps names/roles (follower list, display names).
  function publicUserView(user: any, viewer: any): any {
    const { password, ...rest } = user || {};
    if (isSxdOrAdminUser(viewer) || (viewer?.id && viewer.id === rest.id)) return rest;
    const { email, phone, avatar, ...limited } = rest;
    return limited;
  }

  // Decode and verify JWT
  function authenticateToken(req: any, res: any, next: any) {
    const fullPath = req.baseUrl + req.path;
    const publicPaths = [
      "/api/health",
      "/api/db-status",
      "/api/login"
    ];

    if (publicPaths.includes(fullPath) || fullPath.startsWith('/uploads')) {
      return next();
    }

    const authHeader = Array.isArray(req.headers.authorization) ? req.headers.authorization[0] : (req.headers.authorization || req.headers.Authorization);
    let token;
    if (typeof authHeader === 'string') {
        const parts = authHeader.split(' ');
        token = parts.length > 1 ? parts[1] : parts[0];
    }


    if (!token) {
      return res.status(401).json({ error: "Bạn cần đăng nhập để sử dụng chức năng này.", code: "AUTH_REQUIRED" });
    }

    jwt.verify(token, JWT_SECRET, async (err: any, tokenUser: any) => {
      const invalidSession = () => res.status(403).json({ error: "Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.", code: "TOKEN_INVALID" });
      if (err) {
        return invalidSession();
      }

      // Revocation: the account must still exist and (for tokens carrying a fingerprint) still have the
      // password the token was issued for. Role/agency are read fresh so admin changes apply immediately.
      let user = tokenUser;
      try {
        const live = (await dbGetUsers()).find((u: any) => u.id === tokenUser.id);
        if (!live) {
          return invalidSession();
        }
        if (tokenUser.pwf && tokenUser.pwf !== passwordFingerprint(live.password || "")) {
          return invalidSession();
        }
        user = {
          ...tokenUser,
          roleId: live.roleId,
          userType: live.userType,
          agencyId: live.agencyId,
          investorId: live.investorId,
          department: live.department,
          mustChangePassword: !!live.mustChangePassword
        };
      } catch (lookupErr) {
        console.error("Auth: could not load account for token check", lookupErr);
        return sendError(res, lookupErr);
      }
      req.user = user;

      // Tài khoản đang dùng mật khẩu tạm: chỉ được đổi mật khẩu (và sửa hồ sơ) cho tới khi đăng nhập lại bằng mật khẩu mới.
      // Thông báo cố ý không chứa "token" để client không coi là hết phiên.
      if (user.mustChangePassword && !MUST_CHANGE_PASSWORD_ALLOWED.includes(fullPath)) {
        return res.status(403).json({
          error: "Bạn cần đổi mật khẩu tạm thời trước khi sử dụng hệ thống.",
          code: "MUST_CHANGE_PASSWORD"
        });
      }
      next();
    });
  }
  const MUST_CHANGE_PASSWORD_ALLOWED = ["/api/profile/change-password", "/api/users/me"];

  // Protect all API routes dynamically
  app.use("/api", authenticateToken);

  // --- API Routes ---
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // DB Status endpoint
  app.get("/api/db-status", async (req, res) => {
    const force = req.query.retry === "true" || req.query.force === "true";
    await initDatabase(force);
    res.json(getDbStatus());
  });

  // Brute-force protection: after LOGIN_MAX_FAILURES wrong passwords within the window,
  // that IP + username is locked for LOGIN_LOCK_MS. In-memory (resets on restart), per process.
  const LOGIN_MAX_FAILURES = 5;
  const LOGIN_WINDOW_MS = 15 * 60 * 1000;
  const LOGIN_LOCK_MS = 15 * 60 * 1000;
  const loginFailures = new Map<string, { count: number; first: number; lockedUntil: number }>();
  function loginLockRemaining(key: string): number {
    const e = loginFailures.get(key);
    return e && e.lockedUntil > Date.now() ? e.lockedUntil - Date.now() : 0;
  }
  function recordLoginFailure(key: string) {
    const now = Date.now();
    let e = loginFailures.get(key);
    if (!e || now - e.first > LOGIN_WINDOW_MS) e = { count: 0, first: now, lockedUntil: 0 };
    e.count++;
    if (e.count >= LOGIN_MAX_FAILURES) e.lockedUntil = now + LOGIN_LOCK_MS;
    loginFailures.set(key, e);
  }
  function clearLoginFailures(key: string) {
    loginFailures.delete(key);
  }

  // Login Authentication Endpoint
  app.post("/api/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: "Vui lòng nhập tên đăng nhập và mật khẩu" });
      }

      const throttleKey = `${req.ip}|${String(username).trim().toLowerCase()}`;
      const lockedForMs = loginLockRemaining(throttleKey);
      if (lockedForMs > 0) {
        return res.status(429).json({
          error: `Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau ${Math.ceil(lockedForMs / 60000)} phút.`,
          code: "LOGIN_LOCKED"
        });
      }

      const users = await dbGetUsers();
      let user = users.find((u: any) => {
        const uUsername = u.username || u.email?.split('@')[0] || '';
        if (uUsername.toLowerCase() !== String(username).trim().toLowerCase()) return false;
        return verifyPassword(String(password), u.password || '');
      });

      if (!user) {
        recordLoginFailure(throttleKey);
        return res.status(401).json({ error: "Tên đăng nhập hoặc mật khẩu không đúng" });
      }
      clearLoginFailures(throttleKey);

      // Upgrade a legacy hash once PASSWORD_HASH=scrypt is enabled (see server/passwords.ts)
      if (needsRehash(user.password || '')) {
        const upgraded = hashNewPassword(String(password));
        if (await dbResetUserPassword(user.id, upgraded, !!user.mustChangePassword)) {
          user = { ...user, password: upgraded };
        }
      }

      // Generate secure token
      const token = jwt.sign(
        {
          id: user.id,
          username: user.username,
          roleId: user.roleId,
          userType: user.userType,
          agencyId: user.agencyId,
          department: user.department,
          investorId: user.investorId,
          fullName: user.fullName,
          email: user.email,
          mustChangePassword: !!user.mustChangePassword,
          // Fingerprint of the stored password: changing the password invalidates this token
          pwf: passwordFingerprint(user.password || '')
        },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      // Strip password for safety
      const { password: userPass, ...cleanUser } = user;

      res.json({
        token,
        user: cleanUser
      });
    } catch (err: any) {
      console.error("Login API error: ", err);
      sendError(res, err);
    }
  });

  // Load all projects and metadata with dynamic authorization filtering
  app.get("/api/data", async (req, res) => {
    try {
      const status = getDbStatus();
      if (!status.connected) {
         // Soft-retry database connection on initial reload/retrieval
        await initDatabase(false);
      }
      const users = await dbGetUsers();
      const { meta, composed, derivedActual } = await loadProgressState();

      // Server-side project isolation: same rule as every project-level route (canViewProject)
      const currentUser = (req as any).user;
      const ctx = buildAccessContext(meta, derivedActual);
      const visible = composed.filter(c => canViewProject(currentUser, c.project, ctx));
      const visibleProjects = visible
        .map(c => c.project)
        .map((p: any) => Array.isArray(p.files)
          ? { ...p, files: p.files.map((f: any) => ({ ...f, name: repairUploadedName(f.name) })) }
          : p);
      // Progress only for the projects this account may see: milestone view (Gantt) and the same values in
      // the former actual-progress shape (dashboards)
      const visibleProgress = Object.fromEntries(visible.map(c => [String(c.project.id), c.legacyActual]));
      const milestoneProgress = Object.fromEntries(visible.map(c => [String(c.project.id), c.milestones]));

      // Strip passwords; contact details of other accounts only go to SXD/Admin (user management)
      const cleanUsers = users.map((u: any) => publicUserView(u, currentUser));

      res.json({
        ...meta,
        projects: visibleProjects,
        users: cleanUsers,
        actualProgress: visibleProgress,
        milestoneProgress
      });
    } catch (err: any) {
      console.error("API error loading data: ", err);
      sendError(res, err);
    }
  });

  // Project code must be present (400) and unique, case-insensitive and trimmed (409).
  // Returns the rejection, or null when the code is acceptable.
  function projectCodeError(code: any, projects: any[], excludeId?: string): { status: number; error: string } | null {
    const normalized = String(code ?? '').trim().toLowerCase();
    if (!normalized) return { status: 400, error: "Mã dự án không được để trống." };
    const clash = projects.find((p: any) => p.id !== excludeId && String(p.code ?? '').trim().toLowerCase() === normalized);
    return clash ? { status: 409, error: `Mã dự án "${String(code).trim()}" đã được dùng cho dự án khác. Vui lòng nhập mã khác.` } : null;
  }

    // Completion date (endDate) must not precede the start date when both are real dates
  function projectSpanError(body: any): string | null {
    return body?.startDate && body?.endDate && isDateBefore(body.endDate, body.startDate)
      ? "Ngày hoàn thành phải sau hoặc bằng ngày bắt đầu."
      : null;
  }

  // Date fields stored as text. A value must be empty, "X" (not applicable) or a real date
  // (dd/mm/yyyy or yyyy-mm-dd). On update only changed values are checked (legacy rows stay editable).
  const PROJECT_DATE_FIELDS: { key: string; label: string }[] = [
    { key: 'startDate', label: 'Ngày bắt đầu' },
    { key: 'endDate', label: 'Ngày hoàn thành' },
    { key: 'deadline', label: 'Hạn hoàn thành' },
    ...['chutruong', 'qh1500', 'qdgiaodat', 'pccc', 'htkt_dtm', 'baocaonckt', 'gpxaydung'].flatMap(k => [
      { key: `${k}_cdt_date`, label: 'Ngày kế hoạch' },
      { key: `${k}_nn_date`, label: 'Ngày kế hoạch' }
    ])
  ];
  function projectDateError(body: any, stored?: any): string | null {
    for (const f of PROJECT_DATE_FIELDS) {
      const v = body?.[f.key];
      if (v === undefined || v === null) continue;
      const text = String(v).trim();
      if (text === '' || text.toUpperCase() === 'X') continue;
      if (stored && String(stored[f.key] ?? '').trim() === text) continue;
      if (!parseDateStrict(text)) return `${f.label} "${text}" không phải ngày hợp lệ (định dạng dd/mm/yyyy).`;
    }
    return null;
  }
  function projectNameError(body: any, isCreate: boolean): string | null {
    if (!isCreate && body?.name === undefined) return null;
    return String(body?.name ?? '').trim() ? null : "Tên dự án không được để trống.";
  }

  // General information only Sở Xây dựng / Admin may change. Other editors (investor, agency or ward at
  // its step) update progress, plan and scale; changing these would move the project to another
  // investor/ward/process or rename it.
  const SXD_ONLY_PROJECT_FIELDS: { key: string; label: string }[] = [
    { key: 'code', label: 'Mã dự án' },
    { key: 'name', label: 'Tên dự án' },
    { key: 'investor', label: 'Chủ đầu tư' },
    { key: 'location', label: 'Địa điểm' },
    { key: 'processId', label: 'Quy trình thực hiện' },
    { key: 'projectGroup', label: 'Nhóm dự án' },
    { key: 'projectCategory', label: 'Phân loại dự án' },
    { key: 'buildingGrade', label: 'Cấp công trình' },
    { key: 'fundingSource', label: 'Nguồn vốn' },
    { key: 'isKeyProject', label: 'Dự án trọng điểm' },
    { key: 'isPublicInvestment', label: 'Dự án đầu tư công' }
  ];
  function sameProjectValue(a: any, b: any): boolean {
    if (typeof a === 'boolean' || typeof b === 'boolean') return !!a === !!b;
    return String(a ?? '').trim() === String(b ?? '').trim();
  }

  // ─── Progress per step / milestone (src/lib/stepProgress.ts, server/progressService.ts) ───────────
  const FORMER_PLAN_KEYS = ['chutruong', 'qh1500', 'qdgiaodat', 'pccc', 'htkt_dtm', 'baocaonckt', 'gpxaydung']
    .flatMap(k => [`${k}_cdt_date`, `${k}_nn_date`]);
  const SIDES: ProgressSide[] = ['cdt', 'nn'];
  const sideLabel = (side: ProgressSide) => side === 'cdt' ? 'CĐT' : 'CQNN';
  const actorName = (u: any) => u?.fullName || u?.username || 'Người dùng hệ thống';

  // Plan dates sent with a project update: a step plan (project.milestones[stepId].investor / .agency)
  // goes to that step; a milestone plan (former columns *_cdt_date / *_nn_date, "Chỉnh sửa mốc") goes to
  // the first step (CĐT) or the step with the latest CQNN plan, unless steps of that milestone were
  // edited in the same request (the step level then wins)
  async function applyPlanChanges(raw: any, body: any, u: any) {
    const state = await loadProgressState();
    const meta = state.meta;
    const current = state.composed.find(c => String(c.raw.id) === String(raw.id));
    const process = findProcess(meta, raw);
    const before = effectiveProgress(raw, process, current?.rows);
    let next: ProjectStepProgress = before;
    const user = actorName(u);
    const materialized = new Set<string>();
    const materialize = (name: string) => {
      if (materialized.has(name)) return;
      materialized.add(name);
      next = materializeLegacyMilestone(process, meta.projectStages, next, raw, state.legacyActual[raw.id] || {}, name, user);
    };

    const editedAtStepLevel = new Set<string>();
    const sentPlans = body?.milestones && typeof body.milestones === 'object' ? body.milestones : {};
    processSteps(process).forEach(step => {
      const sent = sentPlans[step.id];
      if (!sent || typeof sent !== 'object') return;
      SIDES.forEach(side => {
        const value = side === 'cdt' ? sent.investor : sent.agency;
        if (value === undefined) return;
        const iso = toIsoDate(value);
        if (iso === (before[step.id]?.[side]?.planDate || '')) return;
        const ms = milestoneOfStep(process, meta.projectStages, step.id);
        if (ms) { materialize(ms); editedAtStepLevel.add(ms); }
        next = applyStepPlan(next, step.id, side, iso, user);
      });
    });

    // Date typed on a procedure row linked to a milestone (Kế hoạch / Khởi tạo dự án): a milestone plan.
    // Compared with what the project held for that row, so an untouched row is not re-applied.
    const catalog = catalogMilestones(meta.projectStages);
    (process?.parentSteps || []).forEach((ps: any) => {
      const sent = sentPlans[ps.id];
      if (!sent || typeof sent !== 'object' || !ps.milestoneName) return;
      const m = catalog.find(x => linkedProcedures(process, x.name).includes(ps));
      if (!m || editedAtStepLevel.has(m.name)) return;
      const stored = raw.milestones?.[ps.id] || {};
      SIDES.forEach(side => {
        const key = side === 'cdt' ? 'investor' : 'agency';
        const iso = toIsoDate(sent[key]);
        if (!iso || iso === toIsoDate(stored[key])) return;
        materialize(m.name);
        next = applyMilestonePlan(process, next, m.name, side, iso, user);
        editedAtStepLevel.add(m.name);
      });
    });

    // "Chỉnh sửa mốc" (Cập nhật kế hoạch dự án): milestonePlans[name] = { cdt, nn }, by catalog name.
    // "Đã xong" (X) stays a former column value and only exists for the milestones those columns know.
    const sentMilestonePlans = body?.milestonePlans && typeof body.milestonePlans === 'object' ? body.milestonePlans : {};
    catalog.forEach(m => {
      const sent = sentMilestonePlans[m.name];
      if (!sent || typeof sent !== 'object' || editedAtStepLevel.has(m.name)) return;
      const phase = legacyPhaseOf(m.name);
      SIDES.forEach(side => {
        if (sent[side] === undefined) return;
        const value = String(sent[side] ?? '').trim();
        const shown = (current?.milestones[m.name] as any)?.[side === 'cdt' ? 'cdtPlan' : 'nnPlan'] || '';
        if (phase) body[`${phase.planKey}_${side}_date`] = value.toUpperCase() === 'X' ? 'X' : '';
        if (value.toUpperCase() === 'X') return;
        const iso = toIsoDate(value);
        if (iso === shown || (!iso && (shown === '' || shown === 'X'))) return;
        materialize(m.name);
        next = applyMilestonePlan(process, next, m.name, side, iso, user);
      });
      editedAtStepLevel.add(m.name);
    });

    catalog.forEach(m => {
      const phase = legacyPhaseOf(m.name);
      if (!phase || editedAtStepLevel.has(m.name)) return;
      SIDES.forEach(side => {
        const sent = body?.[`${phase.planKey}_${side}_date`];
        if (sent === undefined || String(sent).trim().toUpperCase() === 'X') return;
        const iso = toIsoDate(sent);
        const shown = (current?.milestones[m.name] as any)?.[side === 'cdt' ? 'cdtPlan' : 'nnPlan'] || '';
        if (iso === shown || (!iso && (shown === '' || shown === 'X'))) return;
        materialize(m.name);
        next = applyMilestonePlan(process, next, m.name, side, iso, user);
      });
    });

    await dbSaveStepProgress(String(raw.id), before, next);
    return { process, progress: next };
  }

  // "Chỉnh sửa mốc" (milestonePlans { name: { cdt, nn } }): the plan of the milestones is set by Sở Xây
  // dựng; every name must be in the catalog, every value a date, "X" or empty, and the CQNN plan cannot
  // come before the CĐT plan. Returns [status, message] when refused.
  async function milestonePlansError(plans: any, u: any): Promise<[number, string] | null> {
    if (plans === undefined || plans === null) return null;
    if (typeof plans !== 'object' || Array.isArray(plans)) return [400, "Kế hoạch mốc không hợp lệ."];
    const names = Object.keys(plans);
    if (names.length === 0) return null;
    if (!isSxdOrAdminUser(u)) return [403, "Chỉ Sở Xây dựng được cập nhật kế hoạch mốc của dự án."];
    const catalog = catalogMilestones(await dbGetMetadata('projectStages'));
    for (const name of names) {
      if (!catalog.some(m => m.name === name)) return [400, `Mốc "${name}" không có trong danh mục mốc tiến độ.`];
      const sent = plans[name] || {};
      const iso: Record<string, string> = {};
      for (const side of SIDES) {
        const value = String(sent[side] ?? '').trim();
        if (!value || value.toUpperCase() === 'X') continue;
        iso[side] = toIsoDate(value);
        if (!iso[side]) return [400, `Mốc "${name}": ngày kế hoạch ${sideLabel(side)} "${value}" không hợp lệ (định dạng dd/mm/yyyy).`];
      }
      if (iso.cdt && iso.nn && iso.nn < iso.cdt) {
        return [400, `Mốc "${name}": kế hoạch CQNN (${isoToDisplay(iso.nn)}) không được trước kế hoạch CĐT (${isoToDisplay(iso.cdt)}).`];
      }
    }
    return null;
  }

  // Agency name without the department in brackets ("Sở Xây dựng (Phòng PTĐT)" → "Sở Xây dựng")
  const baseAgency = (name: any) => normalizeAgencyName(String(name ?? '').replace(/\s*\(.*\)\s*$/, ''));

  // Who records a side of a step:
  //   cdt → the project's investor; nn → the agency handling the step (the investor for a "Chủ đầu tư"
  //   step; a ward also its SQHKT planning step, see WARD_WORK_AGENCIES). SXD / Admin record everything.
  function canWriteStepSide(u: any, project: any, step: any, side: ProgressSide, ctx: AccessContext): boolean {
    if (isSxdOrAdminUser(u)) return true;
    if (!canEditProject(u, project, ctx)) return false;
    const isOwnInvestor = u?.userType === 'investor' && project?.investor === u?.investorId;
    if (side === 'cdt') return isOwnInvestor;
    if (!step) return false;
    if (isInvestorStep(step)) return isOwnInvestor;
    if (u?.userType !== 'agency') return false;
    const stepAgency = baseAgency(step.agency);
    if (u.agencyId === '6') return WARD_WORK_AGENCIES.includes(stepAgency);
    const own = baseAgency(ctx.agencies.find((a: any) => a.id === u.agencyId)?.name);
    return !!own && own === stepAgency;
  }

  // CQNN date of a milestone: the agency holding the open step of its procedure (when finished, the one
  // that finished it). A milestone not linked to any procedure of the process: SXD / Admin only.
  function milestoneNnStep(process: any, milestone: string, progress: ProjectStepProgress) {
    const states = linkedProcedures(process, milestone).map((ps: any) => procedureState(ps, progress));
    if (states.length === 0) return null;
    const open = states.find(s => !s.done);
    if (open) return open.openSteps[0] || null;
    const last = states[states.length - 1];
    return last.steps.find(s => s.id === last.exitStepId) || last.steps[last.steps.length - 1] || null;
  }

  // "Today" in Việt Nam whatever the server's time zone (a UTC container would refuse today's date
  // between 00:00 and 07:00)
  const todayIso = () => toIsoDate(new Date().toLocaleDateString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const NOTE_MAX_LENGTH = 2000;
  const noteError = (note: any) => {
    if (typeof note === 'string' && note.trim().length > NOTE_MAX_LENGTH) {
      throw badRequest(`Nội dung / ghi chú tối đa ${NOTE_MAX_LENGTH} ký tự.`);
    }
  };
  const badRequest = (message: string) => Object.assign(new Error(message), { statusCode: 400 });
  const forbidden = (message: string) => Object.assign(new Error(message), { statusCode: 403 });

  const cleanAttachments = (list: any): ProgressAttachment[] | undefined =>
    Array.isArray(list)
      ? list.filter((a: any) => a && a.id !== undefined && a.name).map((a: any) => ({
          id: String(a.id), name: String(a.name), ...(a.size ? { size: String(a.size) } : {}), ...(a.type || a.fileType ? { type: String(a.type || a.fileType) } : {})
        }))
      : undefined;

  // Loads the project for a progress write, applies `change` to its step progress, saves the changed
  // entries, refreshes the current step / status of the row and records the history line
  async function writeProgress(req: any, change: (ctx: {
    project: any; raw: any; process: any; meta: any; progress: ProjectStepProgress; accessCtx: AccessContext; user: any;
    materialize: (milestone: string, p: ProjectStepProgress) => ProjectStepProgress;
  }) => { progress: ProjectStepProgress; history: string; newStatus?: string }) {
    const state = await loadProgressState();
    const entry = state.composed.find(c => String(c.project.id) === String(req.params.id));
    if (!entry) throw Object.assign(new Error("Không tìm thấy dự án."), { statusCode: 404 });
    const u = req.user;
    const accessCtx = buildAccessContext(state.meta, state.derivedActual);
    if (!canViewProject(u, entry.project, accessCtx)) throw forbidden("Bạn không có quyền cập nhật dự án này.");
    const process = findProcess(state.meta, entry.raw);
    if (!process) throw badRequest("Dự án chưa có quy trình thực hiện.");
    const before = effectiveProgress(entry.raw, process, entry.rows);
    const legacy = state.legacyActual[entry.raw.id] || {};
    const materialize = (milestone: string, p: ProjectStepProgress) =>
      materializeLegacyMilestone(process, state.meta.projectStages, p, entry.raw, legacy, milestone, actorName(u));

    const result = change({ project: entry.project, raw: entry.raw, process, meta: state.meta, progress: before, accessCtx, user: u, materialize });
    await dbSaveStepProgress(String(entry.raw.id), before, result.progress);

    const fields = stepStatusFields(process, result.progress);
    if (fields) await dbUpdateProject(String(entry.raw.id), { ...entry.raw, ...fields });
    await dbCreateProjectHistory(String(entry.raw.id), actorName(u), 'update_status', result.history, entry.project.status, result.newStatus || fields?.status);

    const after = await dbGetStepProgress(String(entry.raw.id));
    const raw = (await dbGetProjects()).find((p: any) => String(p.id) === String(entry.raw.id)) || entry.raw;
    const composed = composeProject(raw, state.meta, legacy, after[String(entry.raw.id)]);
    return { project: composed.project, milestones: composed.milestones, actualProgress: composed.legacyActual };
  }

  // ① One step, one side (Danh sách dự án → Cập nhật)
  app.post("/api/projects/:id/progress/step", async (req, res) => {
    try {
      const b = req.body || {};
      const side: ProgressSide = b.side === 'cdt' ? 'cdt' : 'nn';
      const result = await writeProgress(req, ({ project, process, meta, progress, accessCtx, user, materialize }) => {
        const steps = processSteps(process);
        const step = steps.find(s => s.id === String(b.stepId ?? ''));
        if (!step) throw badRequest("Bước không thuộc quy trình của dự án.");
        if (!canWriteStepSide(user, project, step, side, accessCtx)) {
          throw forbidden(side === 'cdt'
            ? "Chỉ chủ đầu tư của dự án (hoặc Sở Xây dựng) được cập nhật tiến độ của chủ đầu tư."
            : `Chỉ ${step.agency || 'cơ quan xử lý'} (hoặc Sở Xây dựng) được cập nhật tiến độ bước này.`);
        }
        const status = side === 'nn' ? String(b.status ?? '').trim() : undefined;
        if (side === 'nn' && !(meta.stepStatuses || []).includes(status)) throw badRequest("Trạng thái bước không hợp lệ.");
        const closes = side === 'nn' && DONE_STEP_STATUSES.includes(status!);
        const date = toIsoDate(b.date);
        if (b.date && !date) throw badRequest(`Ngày "${b.date}" không hợp lệ (định dạng dd/mm/yyyy).`);
        if (side === 'nn' && !date) throw badRequest("Vui lòng nhập ngày hoàn thành.");
        if ((closes || side === 'cdt') && date && date > todayIso()) throw badRequest("Ngày thực tế không được sau ngày hôm nay.");
        const cdtDate = progress[step.id]?.cdt?.actualDate;
        if (closes && cdtDate && date < cdtDate) {
          throw badRequest(`Ngày hoàn thành của cơ quan (${isoToDisplay(date)}) không được trước ngày chủ đầu tư nộp hồ sơ (${isoToDisplay(cdtDate)}).`);
        }
        const nnDate = progress[step.id]?.nn?.actualDate;
        if (side === 'cdt' && date && nnDate && nnDate < date) {
          throw badRequest(`Ngày chủ đầu tư nộp (${isoToDisplay(date)}) không được sau ngày cơ quan hoàn thành bước (${isoToDisplay(nnDate)}).`);
        }

        noteError(b.note);
        // The file reaches this step when a step that handed it over closed: it cannot finish before that
        if (closes && date) {
          const handover = Object.entries(progress).find(([key, s]) =>
            key !== step.id && s?.nn?.actualDate && s.nn.actualDate > date && (s.nn.nextStepIds || []).includes(step.id));
          if (handover) {
            const from = steps.find(s => s.id === handover[0])?.name || handover[0];
            throw badRequest(`Ngày hoàn thành (${isoToDisplay(date)}) không được trước ngày bước trước [${from}] chuyển hồ sơ sang (${isoToDisplay(handover[1].nn!.actualDate!)}).`);
          }
        }

        const nextStepIds: string[] = closes && Array.isArray(b.nextStepIds) ? b.nextStepIds.map(String) : [];
        const unknown = nextStepIds.find(id => !steps.some(s => s.id === id));
        if (unknown) throw badRequest("Bước tiếp theo không thuộc quy trình của dự án.");
        if (nextStepIds.includes(step.id)) throw badRequest("Bước tiếp theo không được là chính bước đang cập nhật.");
        if (closes && nextStepIds.length === 0) {
          const skipped = skippedStepIds(process, progress);
          const idx = steps.findIndex(s => s.id === step.id);
          const later = steps.slice(idx + 1).some(s => s.id !== step.id && !progress[s.id]?.nn?.actualDate && !skipped.has(s.id));
          if (later) throw badRequest('Bước này đã kết thúc: vui lòng chọn "Bước tiếp theo" để chuyển hồ sơ cho cơ quan xử lý tiếp.');
        }

        let p = progress;
        const touched = new Set<string>();
        [step.id, ...nextStepIds].forEach(id => {
          const ms = milestoneOfStep(process, meta.projectStages, id);
          if (ms && !touched.has(ms)) { touched.add(ms); p = materialize(ms, p); }
        });
        p = applyStepUpdate(process, p, {
          stepId: step.id, side, status, date, note: typeof b.note === 'string' ? b.note.trim() : undefined,
          attachments: cleanAttachments(b.attachments), nextStepIds, user: actorName(user)
        });

        const nextNames = nextStepIds.map(id => steps.find(s => s.id === id)?.name).filter(Boolean);
        const history = side === 'cdt'
          ? `Cập nhật tiến độ CĐT ở bước [${step.name}]: ${date ? `ngày nộp hồ sơ ${isoToDisplay(date)}` : 'xóa ngày nộp hồ sơ'}.${b.note ? ' Nội dung: ' + String(b.note).trim() : ''}`
          : `Cập nhật tiến độ ở bước [${step.name}]: Trạng thái hiện tại chuyển thành "${status}". ${closes ? 'Ngày hoàn thành thực tế' : 'Ngày hoàn thành dự kiến'}: ${isoToDisplay(date)}.`
            + (b.note ? ' Nội dung cập nhật: ' + String(b.note).trim() + '.' : '')
            + (nextNames.length ? ` Bước tiếp theo: ${nextNames.join(', ')}.` : '')
            + (Array.isArray(b.attachments) && b.attachments.length ? ` Đính kèm ${b.attachments.length} tài liệu.` : '');
        return { progress: p, history, newStatus: status };
      });
      res.json(result);
    } catch (err: any) {
      sendError(res, err);
    }
  });

  // ② Milestone dates (Sơ đồ Gantt → chi tiết → "+ nhập TT"), written onto the steps of the milestone.
  // Body: { changes: [{ milestone, side, date, note, attachments }] } (or one change at top level)
  async function writeMilestoneChanges(req: any, changes: any[]) {
    return writeProgress(req, ({ project, process, meta, progress, accessCtx, user, materialize }) => {
      const catalog = catalogMilestones(meta.projectStages);
      let p = progress;
      const lines: string[] = [];
      for (const c of changes) {
        const milestone = catalog.find(m => m.name === String(c?.milestone ?? ''));
        if (!milestone) throw badRequest(`Mốc "${c?.milestone}" không có trong danh mục mốc tiến độ.`);
        const side: ProgressSide = c.side === 'cdt' ? 'cdt' : 'nn';
        const date = toIsoDate(c.date);
        if (c.date && !date) throw badRequest(`Ngày "${c.date}" không hợp lệ (định dạng dd/mm/yyyy).`);
        if (date && date > todayIso()) throw badRequest("Ngày thực tế không được sau ngày hôm nay.");

        const linked = linkedProcedures(process, milestone.name).length > 0;
        const allowed = isSxdOrAdminUser(user) || (side === 'cdt'
          ? canWriteStepSide(user, project, null, 'cdt', accessCtx)
          : linked && canWriteStepSide(user, project, milestoneNnStep(process, milestone.name, p), 'nn', accessCtx));
        if (!allowed) {
          throw forbidden(side === 'cdt'
            ? "Chỉ chủ đầu tư của dự án (hoặc Sở Xây dựng) được nhập tiến độ của chủ đầu tư."
            : `Chỉ cơ quan đang xử lý thủ tục của mốc "${milestone.name}" (hoặc Sở Xây dựng) được nhập tiến độ cơ quan.`);
        }
        noteError(c.note);
        p = materialize(milestone.name, p);
        // The CQNN date closes the open steps (or moves the step that ended the procedure): it cannot come
        // before a step of the procedure that stays closed as it is
        if (side === 'nn' && date && linked) {
          linkedProcedures(process, milestone.name).forEach((ps: any) => {
            const st = procedureState(ps, p);
            const moved = new Set(milestoneMovedStepIds(st, p));
            const kept = st.steps.filter(s => !moved.has(s.id) && p[s.id]?.nn?.actualDate && p[s.id]!.nn!.actualDate! > date);
            if (kept.length > 0) {
              const last = kept.reduce((a, s) => (p[s.id]!.nn!.actualDate! > p[a.id]!.nn!.actualDate! ? s : a));
              throw badRequest(`Mốc "${milestone.name}": ngày cơ quan hoàn thành (${isoToDisplay(date)}) không được trước ngày bước [${last.name}] đã hoàn thành (${isoToDisplay(p[last.id]!.nn!.actualDate!)}).`);
            }
          });
        }
        p = applyMilestoneInput(process, p, {
          milestone: milestone.name, side, date, note: typeof c.note === 'string' ? c.note.trim() : undefined,
          attachments: cleanAttachments(c.attachments), user: actorName(user)
        });
        lines.push(`${sideLabel(side)}: ${date ? isoToDisplay(date) : 'xóa ngày'}${c.note ? ` (${String(c.note).trim()})` : ''}`);
      }
      // CQNN finishing before the investor submitted is not possible
      const names = [...new Set(changes.map(c => String(c.milestone)))];
      const view = composeProject({ ...project, milestones: {}, implementationPlan: {} }, meta, {}, p).milestones;
      names.forEach(n => {
        const m = view[n];
        if (m?.cdtActual && m?.nnActual && m.nnActual < m.cdtActual) {
          throw badRequest(`Mốc "${n}": ngày cơ quan hoàn thành (${isoToDisplay(m.nnActual)}) không được trước ngày chủ đầu tư nộp (${isoToDisplay(m.cdtActual)}).`);
        }
      });
      return { progress: p, history: `Cập nhật tiến độ mốc [${names.join(', ')}]: ${lines.join(' | ')}` };
    });
  }

  app.post("/api/projects/:id/progress/milestone", async (req, res) => {
    try {
      const b = req.body || {};
      const changes = Array.isArray(b.changes) ? b.changes : [b];
      if (changes.length === 0) return res.status(400).json({ error: "Không có thay đổi tiến độ." });
      res.json(await writeMilestoneChanges(req, changes));
    } catch (err: any) {
      sendError(res, err);
    }
  });

  // Projects CRUD
  app.post("/api/projects", async (req, res) => {
    try {
      const u = (req as any).user;
      const isSxdOrAdmin = u.roleId === 'Admin' || (u.userType === 'agency' && u.agencyId === '1');
      if (!isSxdOrAdmin) {
        return res.status(403).json({ error: "Bạn không có quyền tạo dự án mới." });
      }
      const codeError = projectCodeError(req.body?.code, await dbGetProjects());
      if (codeError) {
        return res.status(codeError.status).json({ error: codeError.error });
      }
            const spanError = projectSpanError(req.body);
      if (spanError) {
        return res.status(400).json({ error: spanError });
      }
      const fieldError = projectNameError(req.body, true) || projectDateError(req.body);
      if (fieldError) {
        return res.status(400).json({ error: fieldError });
      }
      // The server assigns the id: a client-chosen id could collide with an existing project
      const { id: _clientId, ...createBody } = req.body;
      const project = await dbCreateProject({ ...createBody, code: String(req.body.code).trim() });
      res.json(project);
    } catch (err: any) {
      sendError(res, err);
    }
  });

  app.put("/api/projects/:id", async (req, res) => {
    try {
      const dbProjects = await dbGetProjects();
      const project = dbProjects.find((p: any) => p.id === req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Không tìm thấy dự án." });
      }

      // Same scope as viewing it (canEditProject): owner investor, or the agency/ward at its step
      const u = (req as any).user;
      if (!canEditProject(u, project, await loadAccessContext())) {
        return res.status(403).json({ error: "Bạn không có quyền cập nhật dự án này (ngoài địa bàn hoặc ngoài bước phân công)." });
      }

      let body = req.body || {};
      if (!isSxdOrAdminUser(u)) {
        const changed = SXD_ONLY_PROJECT_FIELDS.filter(f => body[f.key] !== undefined && !sameProjectValue(body[f.key], project[f.key]));
        if (changed.length > 0) {
          return res.status(403).json({ error: `Chỉ Sở Xây dựng mới được thay đổi: ${changed.map(f => f.label).join(', ')}.` });
        }
        // Omitted fields keep the stored value (dbUpdateProject writes every column)
        body = { ...body };
        SXD_ONLY_PROJECT_FIELDS.forEach(f => { body[f.key] = project[f.key]; });
      }

      // A body without `code` keeps the stored code (dbUpdateProject writes every column)
      // Only a changed code is checked, so legacy rows are never blocked from progress updates
      const nextCode = body.code === undefined ? project.code : body.code;
      const codeChanged = String(nextCode ?? '').trim() !== String(project.code ?? '').trim();
      const codeError = codeChanged ? projectCodeError(nextCode, dbProjects, project.id) : null;
      if (codeError) {
        return res.status(codeError.status).json({ error: codeError.error });
      }
      // Checked only when a date changes, so legacy rows stay editable
      const datesChanged = (body.startDate ?? project.startDate) !== project.startDate
        || (body.endDate ?? project.endDate) !== project.endDate;
      const spanError = datesChanged
        ? projectSpanError({ startDate: body.startDate ?? project.startDate, endDate: body.endDate ?? project.endDate })
        : null;
            if (spanError) {
        return res.status(400).json({ error: spanError });
      }
      const fieldError = projectNameError(body, false) || projectDateError(body, project);
      if (fieldError) {
        return res.status(400).json({ error: fieldError });
      }
      const planError = await milestonePlansError(body?.milestonePlans, u);
      if (planError) {
        return res.status(planError[0]).json({ error: planError[1] });
      }
      // The project's id comes from the URL only
      const { id: _bodyId, ...updateBody } = body;

      // Plans go to the step progress; the former plan / progress fields of the row keep their stored
      // value (they are only read where no step holds data yet) and the step fields come from the server
      const { process, progress } = await applyPlanChanges(project, updateBody, u);
      delete updateBody.milestonePlans; // applied to the steps above
      updateBody.milestones = project.milestones || {};
      updateBody.implementationPlan = project.implementationPlan || project.extra?.implementationPlan || {};
      FORMER_PLAN_KEYS.forEach(key => {
        const sent = updateBody[key];
        const isX = String(sent ?? '').trim().toUpperCase() === 'X';
        const wasX = String(project[key] ?? '').trim().toUpperCase() === 'X';
        // "Đã xong" (X) on a milestone is kept as a former value; anything else lives on the steps
        if (sent === undefined || !(isX || wasX)) updateBody[key] = project[key];
      });
      // A project with no step data at all keeps the step it was given (same rule as composeProject)
      const statusFields = Object.keys(progress).length > 0 ? stepStatusFields(process, progress) : null;
      const updated = await dbUpdateProject(req.params.id, { ...updateBody, ...(statusFields || {}), code: String(nextCode).trim() });
      res.json(updated);
    } catch (err: any) {
      sendError(res, err);
    }
  });

  app.delete("/api/projects/:id", async (req, res) => {
    try {
      const u = (req as any).user;
      const isSxdOrAdmin = u.roleId === 'Admin' || (u.userType === 'agency' && u.agencyId === '1');
      if (!isSxdOrAdmin) {
        return res.status(403).json({ error: "Bạn không có quyền xóa dự án." });
      }
      const success = await dbDeleteProject(req.params.id);
      res.json({ success });
    } catch (err: any) {
      sendError(res, err);
    }
  });

  // Project Extra Details: Attachments
  app.get("/api/projects/:id/attachments", async (req, res) => {
    try {
      if (!(await requireProjectAccess(req, res, req.params.id, 'view'))) return;
      const list = await dbGetProjectAttachments(req.params.id);
      res.json((list || []).map((a: any) => ({ ...a, name: repairUploadedName(a.name) })));
    } catch (err: any) {
      sendError(res, err);
    }
  });

  // Files are served only through GET /api/attachments/:id/download (signed-in, project scope checked).
  // The former public /uploads route exposed every file to anyone who knew its name, and put the
  // original (Vietnamese) file name in the URL, which IIS / HTTP.sys rejected with "400 Invalid URL".

  app.post("/api/projects/:id/attachments/upload", upload.single("file"), async (req, res) => {
    try {
            if (!req.file) {
        return res.status(400).json({ error: "Chưa chọn tệp để tải lên." });
      }
      if (req.file.size === 0) {
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: `Tệp "${req.file.originalname}" rỗng (0 byte), không thể tải lên.` });
      }
      if (!(await requireProjectAccess(req, res, req.params.id, 'edit'))) {
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return;
      }
      const projectId = req.params.id;
      const originalName = req.file.originalname;
      const sizeInBytes = req.file.size;
      const sizeStr = sizeInBytes > 1024 * 1024 
        ? `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB` 
        : `${(sizeInBytes / 1024).toFixed(0)} KB`;
      const extension = originalName.split('.').pop()?.toUpperCase() || "FILE";

      // Fetch and validate against config
      const uploadConfig = await dbGetUploadConfig();
      const allowedExts = (uploadConfig.allowedExtensions || "")
        .split(",")
        .map((s: string) => s.trim().replace(/^\./, "").toUpperCase())
        .filter(Boolean);
      const maxSizeInBytes = (uploadConfig.maxSizeMb || 20) * 1024 * 1024;

      if (allowedExts.length > 0 && !allowedExts.includes(extension)) {
        if (req.file && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        return res.status(400).json({ error: `Định dạng tệp .${extension} không được phép tải lên! Các định dạng được cấu hình cho phép: ${uploadConfig.allowedExtensions}` });
      }

      if (sizeInBytes > maxSizeInBytes) {
        if (req.file && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        return res.status(400).json({ error: `Dung lượng tệp vượt quá cấu hình tối đa cho phép (${uploadConfig.maxSizeMb} MB).` });
      }

      // Insert metadata into database
      const doc = await dbCreateProjectAttachment(projectId, originalName, sizeStr, extension);

      // Rename temp file to: attachment_{id}_{originalname}
      const tempPath = req.file.path;
      const finalPath = attachmentFilePath(doc.id, originalName);

      fs.renameSync(tempPath, finalPath);

      res.json(doc);
    } catch (err: any) {
      console.error("Error processing attachment upload:", err);
      // Do not leave the temporary upload behind when saving fails
      if (req.file && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
      }
      sendError(res, err);
    }
  });

  app.get("/api/attachments/:id/download", async (req, res) => {
    try {
      const attachmentId = parseInt(req.params.id);
      if (isNaN(attachmentId)) {
        return res.status(400).json({ error: "Mã tệp đính kèm không hợp lệ." });
      }

      const attachment = await dbGetAttachmentById(attachmentId);
      if (!attachment) {
        return res.status(404).json({ error: "Không tìm thấy tệp đính kèm." });
      }
      if (!(await requireProjectAccess(req, res, attachment.projectId, 'view'))) return;

      const originalName = attachment.name;
      const filePath = attachmentFilePath(attachmentId, originalName);

      // No placeholder file: a text file named .pdf/.docx/.xlsx downloads fine but cannot be opened.
      // Records without a stored file (demo seed data, files lost on the server) report it instead.
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: `Tệp "${repairUploadedName(originalName)}" không còn trên máy chủ (dữ liệu mẫu hoặc tệp đã bị xóa). Vui lòng tải lên lại.` });
      }
      return res.download(filePath, repairUploadedName(originalName));
    } catch (err: any) {
      console.error("Error downloading attachment:", err);
      sendError(res, err);
    }
  });

  app.delete("/api/attachments/:id", async (req, res) => {
    console.log("Hit DELETE /api/attachments/:id with id:", req.params.id);
    try {
      const attachmentId = parseInt(req.params.id);
      if (isNaN(attachmentId)) {
        return res.status(400).json({ error: "Mã tệp đính kèm không hợp lệ." });
      }

      const attachment = await dbGetAttachmentById(attachmentId);
      if (!attachment) {
        return res.status(404).json({ error: "Không tìm thấy tệp đính kèm." });
      }
      if (!(await requireProjectAccess(req, res, attachment.projectId, 'edit'))) return;

      const filePath = attachmentFilePath(attachmentId, attachment.name);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      await dbDeleteAttachment(attachmentId);

      res.json({ success: true });
    } catch (err: any) {
      console.error("Error deleting attachment:", err);
      sendError(res, err);
    }
  });

  // Project Extra Details: History Logs
  app.get("/api/projects/:id/history", async (req, res) => {
    try {
      if (!(await requireProjectAccess(req, res, req.params.id, 'view'))) return;
      const logs = await dbGetProjectHistory(req.params.id);
      res.json(logs);
    } catch (err: any) {
      sendError(res, err);
    }
  });

  app.post("/api/projects/:id/history", async (req, res) => {
    try {
      if (!(await requireProjectAccess(req, res, req.params.id, 'edit'))) return;
      const { actionType, description, oldStatus, newStatus } = req.body;
      // The author is the signed-in account, never a name supplied by the client
      const u = (req as any).user;
      const userName = u?.fullName || u?.username || 'Người dùng hệ thống';
      const log = await dbCreateProjectHistory(req.params.id, userName, actionType, description, oldStatus, newStatus);
      res.json(log);
    } catch (err: any) {
      sendError(res, err);
    }
  });

  // Project Actual Progress APIs
  // Milestone values in the former shape { chutruong: { cdtDate, nnDate, ... }, ... }, computed from the steps
  app.get("/api/actual-progress", async (req, res) => {
    try {
      const u = (req as any).user;
      const { meta, composed, derivedActual } = await loadProgressState();
      const ctx = buildAccessContext(meta, derivedActual);
      res.json(Object.fromEntries(composed
        .filter(c => canViewProject(u, c.project, ctx))
        .map(c => [String(c.project.id), c.legacyActual])));
    } catch (err: any) {
      sendError(res, err);
    }
  });

  // Former write of the milestone dates (older clients, offline queue): each changed date becomes a
  // milestone change, written onto the steps like "+ nhập TT"
  app.put("/api/actual-progress/:projectId", async (req, res) => {
    try {
      const { meta, composed } = await loadProgressState();
      const entry = composed.find(c => String(c.project.id) === String(req.params.projectId));
      if (!entry) return res.status(404).json({ error: "Không tìm thấy dự án." });
      const sent = req.body && typeof req.body === 'object' ? req.body : {};
      const changes: any[] = [];
      catalogMilestones(meta.projectStages).forEach(m => {
        const phase = legacyPhaseOf(m.name);
        const value = phase ? sent[phase.id] : undefined;
        if (!value || typeof value !== 'object') return;
        const shown = entry.milestones[m.name];
        SIDES.forEach(side => {
          const date = toIsoDate(value[side === 'cdt' ? 'cdtDate' : 'nnDate']);
          const note = String(value[side === 'cdt' ? 'cdtNote' : 'nnNote'] ?? '');
          const shownDate = side === 'cdt' ? shown?.cdtActual : shown?.nnActual;
          const shownNote = side === 'cdt' ? shown?.cdtNote : shown?.nnNote;
          if (date === (shownDate || '') && note === (shownNote || '')) return;
          changes.push({ milestone: m.name, side, date, note, attachments: value[side === 'cdt' ? 'cdtAttachments' : 'nnAttachments'] });
        });
      });
      (req.params as any).id = req.params.projectId;
      if (changes.length === 0) return res.json(entry.legacyActual);
      const result = await writeMilestoneChanges(req, changes);
      res.json(result.actualProgress);
    } catch (err: any) {
      sendError(res, err);
    }
  });

  app.post("/api/actual-progress/reset", async (req, res) => {
    try {
      const u = (req as any).user;
      if (!u || u.roleId !== 'Admin') {
        return res.status(403).json({ error: "Chỉ quản trị viên hệ thống (Admin) mới có quyền đặt lại dữ liệu tiến độ thực tế." });
      }
      const success = await dbResetActualProgress();
      await dbResetStepProgressActuals();
      res.json({ success });
    } catch (err: any) {
      sendError(res, err);
    }
  });

  const catalogKey = (v: any) => String(v ?? '').normalize('NFC').trim().toLowerCase();

  // Rename checks shared by every catalog: both names present, and the new name not already another
  // value of the list (a rename onto an existing value would silently merge the two).
  // Returns [status, message] when refused, or null.
  function catalogRenameError(currentValues: any[], oldName: any, newName: any): [number, string] | null {
    if (!String(oldName ?? '').trim() || !String(newName ?? '').trim()) {
      return [400, "Tên cũ và tên mới không được để trống."];
    }
    if (catalogKey(oldName) === catalogKey(newName)) return null;
    const clash = currentValues.find(v => catalogKey(v) === catalogKey(newName));
    return clash !== undefined
      ? [409, `"${String(newName).trim()}" đã có trong danh mục. Vui lòng chọn tên khác.`]
      : null;
  }

  // First value appearing twice in a catalog list (plain strings, or objects by name / ward)
  function duplicateCatalogValue(list: any[]): string | null {
    const seen = new Set<string>();
    for (const item of list) {
      const label = typeof item === 'string' ? item : (item?.name ?? item?.ward);
      if (label === undefined || label === null) continue;
      const k = catalogKey(label);
      if (!k) continue;
      if (seen.has(k)) return String(label).trim();
      seen.add(k);
    }
    return null;
  }

  // Rename investor with cascading project and user updates
  app.post("/api/metadata/investors/rename", async (req, res) => {
    try {
      const u = (req as any).user;
      const isSxdOrAdmin = u?.roleId === 'Admin' || (u?.userType === 'agency' && u?.agencyId === '1');
      if (!isSxdOrAdmin) {
        return res.status(403).json({ error: "Bạn không có quyền đổi tên chủ đầu tư." });
      }
      const { oldName, newName } = req.body || {};
      const renameError = catalogRenameError(await dbGetMetadata('investors'), oldName, newName);
      if (renameError) {
        return res.status(renameError[0]).json({ error: renameError[1] });
      }
      await dbRenameInvestor(oldName, newName);
      res.json({ success: true, oldName, newName });
    } catch (err: any) {
      sendError(res, err);
    }
  });

  // Rename agency with cascading project and process updates
  app.post("/api/metadata/agencies/rename", async (req, res) => {
    try {
      const u = (req as any).user;
      const isSxdOrAdmin = u?.roleId === 'Admin' || (u?.userType === 'agency' && u?.agencyId === '1');
      if (!isSxdOrAdmin) {
        return res.status(403).json({ error: "Bạn không có quyền đổi tên cơ quan." });
      }
      const { oldName, newName, agencyId } = req.body || {};
      const otherAgencies = (await dbGetMetadata('processingAgencies')).filter((a: any) => String(a?.id) !== String(agencyId));
      const renameError = catalogRenameError(otherAgencies.map((a: any) => a?.name), oldName, newName);
      if (renameError) {
        return res.status(renameError[0]).json({ error: renameError[1] });
      }
      await dbRenameAgency(oldName, newName, agencyId);
      res.json({ success: true, oldName, newName, agencyId });
    } catch (err: any) {
      sendError(res, err);
    }
  });

  // Rename a project stage together with the procedures (process parentSteps.stage) and the projects
  // (project.stage) that reference it by name; a plain PUT would leave them pointing at the old name
  app.post("/api/metadata/projectStages/rename", async (req, res) => {
    try {
      if (!isSxdOrAdminUser((req as any).user)) {
        return res.status(403).json({ error: "Bạn không có quyền cập nhật danh mục hệ thống." });
      }
      const oldName = String(req.body?.oldName ?? '').trim();
      const newName = String(req.body?.newName ?? '').trim();
      const stages = await dbGetMetadata('projectStages');
      const stageName = (s: any) => String((typeof s === 'string' ? s : s?.name) ?? '').trim();
      const renameError = catalogRenameError(stages.map(stageName), oldName, newName);
      if (renameError) {
        return res.status(renameError[0]).json({ error: renameError[1] });
      }
      const processes = await dbGetMetadata('processes');
      const renamedProcesses = processes.map((proc: any) => ({
        ...proc,
        parentSteps: (proc?.parentSteps || []).map((ps: any) =>
          String(ps?.stage ?? '').trim() === oldName ? { ...ps, stage: newName } : ps)
      }));
      await dbUpdateMetadata('processes', renamedProcesses);
      await dbUpdateMetadata('projectStages', stages.map((s: any) =>
        stageName(s) === oldName ? (typeof s === 'string' ? newName : { ...s, name: newName }) : s));
      for (const p of await dbGetProjects()) {
        if (String(p.stage ?? '').trim() === oldName) await dbUpdateProject(p.id, { ...p, stage: newName });
      }
      res.json({ success: true, oldName, newName });
    } catch (err: any) {
      sendError(res, err);
    }
  });

  // Rename a value of a plain-text catalog (nhóm, phân loại, cấp công trình, nguồn vốn) together
  // with every project that uses it. Investors and agencies have their own rename routes above.
  app.post("/api/metadata/:key/rename", async (req, res) => {
    try {
      if (!isSxdOrAdminUser((req as any).user)) {
        return res.status(403).json({ error: "Bạn không có quyền cập nhật danh mục hệ thống." });
      }
      if (!CATALOG_PROJECT_FIELDS[req.params.key]) {
        return res.status(400).json({ error: "Danh mục này không hỗ trợ đổi tên." });
      }
      const { oldName, newName } = req.body || {};
      const renameError = catalogRenameError(await dbGetMetadata(req.params.key), oldName, newName);
      if (renameError) {
        return res.status(renameError[0]).json({ error: renameError[1] });
      }
      await dbRenameCatalogValue(req.params.key, oldName, newName);
      res.json({ success: true, oldName, newName });
    } catch (err: any) {
      sendError(res, err);
    }
  });

  // Values removed from a catalog that projects (or investor accounts) still reference.
  // Returns an error message for the first one, or null when the removal is safe.
  async function catalogRemovalError(key: string, newList: any): Promise<string | null> {
    if (key === 'processingAgencies' || key === 'processes') {
      return structureRemovalError(key, newList);
    }
    if (key === 'stepStatuses') return stepStatusRemovalError(newList);
    if (key === 'roles') return roleRemovalError(newList);
    if (key === 'projectStages') return (await stageRemovalError(newList)) || milestoneRemovalError(newList);
    const cfg = key === 'investors'
      ? { field: 'investor', label: 'Chủ đầu tư' }
      : CATALOG_PROJECT_FIELDS[key];
    if (!cfg || !Array.isArray(newList)) return null;
    const norm = (v: any) => String(v ?? '').trim();
    const kept = new Set(newList.map(norm));
    const removed = (await dbGetMetadata(key)).map(norm).filter((v: string) => v && !kept.has(v));
    if (removed.length === 0) return null;

    const projects = await dbGetProjects();
    const users = key === 'investors' ? await dbGetUsers() : [];
    for (const value of removed) {
      const projectCount = projects.filter((p: any) => norm(p[cfg.field]) === value).length;
      const userCount = users.filter((u: any) => norm(u.investorId) === value).length;
      if (projectCount > 0 || userCount > 0) {
        const usage = [
          projectCount > 0 ? `${projectCount} dự án` : '',
          userCount > 0 ? `${userCount} tài khoản` : ''
        ].filter(Boolean).join(' và ');
        return `Không thể xóa "${value}" khỏi danh mục ${cfg.label}: đang được ${usage} sử dụng. Hãy chuyển sang giá trị khác trước khi xóa.`;
      }
    }
    return null;
  }

  // Step statuses the progress logic depends on (HousingUpdateView: a step closes on "Hoàn thành" or
  // "Đã phê duyệt"; a new update starts at "Đang xử lý"). Removing or renaming them would leave steps
  // that can never be closed.
  const REQUIRED_STEP_STATUSES = ['Đang xử lý', 'Đã phê duyệt', 'Hoàn thành'];
  function stepStatusRemovalError(newList: any): string | null {
    if (!Array.isArray(newList)) return null;
    const kept = new Set(newList.map((v: any) => String(v ?? '').trim()));
    const missing = REQUIRED_STEP_STATUSES.filter(s => !kept.has(s));
    return missing.length > 0
      ? `Không thể xóa hoặc đổi tên trạng thái "${missing.join('", "')}": hệ thống dùng trạng thái này để xác định bước đang xử lý / đã kết thúc.`
      : null;
  }

  // A role still held by accounts cannot be removed; "Admin" must always exist
  async function roleRemovalError(newList: any): Promise<string | null> {
    if (!Array.isArray(newList)) return null;
    const norm = (v: any) => String(v ?? '').trim();
    const kept = new Set(newList.map(norm));
    if (![...kept].some(r => r.toLowerCase() === 'admin')) {
      return 'Không thể xóa vai trò "Admin": đây là vai trò quản trị hệ thống.';
    }
    const removed = (await dbGetMetadata('roles')).map(norm).filter((r: string) => r && !kept.has(r));
    if (removed.length === 0) return null;
    const users = await dbGetUsers();
    for (const role of removed) {
      const count = users.filter((u: any) => norm(u.roleId) === role).length;
      if (count > 0) {
        return `Không thể xóa vai trò "${role}": đang được ${count} tài khoản sử dụng. Hãy chuyển các tài khoản sang vai trò khác trước khi xóa.`;
      }
    }
    return null;
  }

  // A stage referenced by procedures of a process cannot disappear (the procedures would drop out of
  // the plan and Gantt). Renaming goes through POST /api/metadata/projectStages/rename instead.
  async function stageRemovalError(newList: any): Promise<string | null> {
    if (!Array.isArray(newList)) return null;
    const stageName = (s: any) => String((typeof s === 'string' ? s : s?.name) ?? '').trim();
    const kept = new Set(newList.map(stageName));
    const removed = (await dbGetMetadata('projectStages')).map(stageName).filter((s: string) => s && !kept.has(s));
    if (removed.length === 0) return null;
    const processes = await dbGetMetadata('processes');
    for (const stage of removed) {
      const count = processes.reduce((n: number, proc: any) =>
        n + (proc?.parentSteps || []).filter((ps: any) => String(ps?.stage ?? '').trim() === stage).length, 0);
      if (count > 0) {
        return `Không thể xóa giai đoạn "${stage}": đang được ${count} thủ tục trong cấu hình quy trình sử dụng. Hãy chuyển các thủ tục sang giai đoạn khác trước khi xóa.`;
      }
    }
    return null;
  }

  // A milestone removed from the catalog while a procedure links to it ("Mốc Milestone liên kết") or a
  // project holds progress entered on it would drop that progress out of the Gantt
  async function milestoneRemovalError(newList: any): Promise<string | null> {
    if (!Array.isArray(newList)) return null;
    const kept = new Set(catalogMilestones(newList).map(m => m.name.trim().toLowerCase()));
    const removed = catalogMilestones(await dbGetMetadata('projectStages'))
      .filter(m => !kept.has(m.name.trim().toLowerCase()));
    if (removed.length === 0) return null;
    const processes = await dbGetMetadata('processes');
    const progressByProject = await dbGetStepProgress();
    for (const m of removed) {
      const linked = processes.flatMap((proc: any) => linkedProcedures(proc, m.name));
      if (linked.length > 0) {
        return `Không thể xóa mốc "${m.name}": đang được ${linked.length} thủ tục liên kết trong cấu hình quy trình ("Mốc Milestone liên kết"). Hãy bỏ liên kết trước khi xóa.`;
      }
      const key = milestoneKey(m.name);
      const used = Object.values(progressByProject).filter(progress =>
        Object.values(progress[key] || {}).some((e: any) => e && (e.planDate || e.actualDate || e.note)));
      if (used.length > 0) {
        return `Không thể xóa mốc "${m.name}": đã có tiến độ được nhập cho mốc này ở ${used.length} dự án.`;
      }
    }
    return null;
  }

  // A child step (or its whole procedure) removed from a process that stays: refused while a project
  // of that process is at that step, otherwise the project would point at a step that no longer exists
  async function removedCurrentStepError(storedProcesses: any[], newList: any[]): Promise<string | null> {
    const removedSteps = new Map<string, Set<string>>();
    for (const proc of newList) {
      const old = storedProcesses.find((p: any) => String(p?.id) === String(proc?.id));
      if (!old) continue;
      const keptStepIds = new Set(flattenProcessSteps(proc).map(s => s.id));
      const gone = flattenProcessSteps(old).filter(s => !keptStepIds.has(s.id)).map(s => s.id);
      if (gone.length > 0) removedSteps.set(String(proc.id), new Set(gone));
    }
    if (removedSteps.size === 0) return null;
    const projects = await dbGetProjects();
    for (const p of projects) {
      const gone = removedSteps.get(String(p.processId ?? ''));
      if (!gone) continue;
      const step = resolveProjectStep(p, storedProcesses);
      if (step && gone.has(step.id)) {
        return `Không thể xóa bước "${step.name}": dự án "${p.code || p.name}" đang ở bước này. Hãy chuyển dự án sang bước khác trước khi xóa.`;
      }
    }
    return null;
  }

  // Agencies and processes are objects identified by id. Removing one that accounts, process steps or
  // projects still use would orphan them (users without an agency, projects without a process).
  async function structureRemovalError(key: string, newList: any): Promise<string | null> {
    if (!Array.isArray(newList)) return null;
    const keptIds = new Set(newList.map((x: any) => String(x?.id ?? '')));
    const stored = await dbGetMetadata(key);
    const removed = stored.filter((x: any) => x && !keptIds.has(String(x.id ?? '')));
    if (key === 'processes') {
      const stepError = await removedCurrentStepError(stored, newList);
      if (stepError) return stepError;
    }
    if (removed.length === 0) return null;

    if (key === 'processingAgencies') {
      const users = await dbGetUsers();
      // Steps of the processes being saved alongside, else the stored ones
      const processes = await dbGetMetadata('processes');
      for (const agency of removed) {
        const agencyName = normalizeAgencyName(agency.name);
        const userCount = users.filter((u: any) => u.userType === 'agency' && String(u.agencyId) === String(agency.id)).length;
        let stepCount = 0;
        processes.forEach((proc: any) => (proc?.parentSteps || []).forEach((ps: any) => (ps?.childSteps || []).forEach((cs: any) => {
          if (agencyName && normalizeAgencyName(cs?.agency) === agencyName) stepCount++;
        })));
        if (userCount > 0 || stepCount > 0) {
          const usage = [userCount > 0 ? `${userCount} tài khoản` : '', stepCount > 0 ? `${stepCount} bước quy trình` : ''].filter(Boolean).join(' và ');
          return `Không thể xóa cơ quan "${agency.name}": đang được ${usage} sử dụng. Hãy chuyển sang cơ quan khác trước khi xóa.`;
        }
      }
      return null;
    }

    const projects = await dbGetProjects();
    for (const proc of removed) {
      const projectCount = projects.filter((p: any) => String(p.processId ?? '') === String(proc.id)).length;
      if (projectCount > 0) {
        return `Không thể xóa quy trình "${proc.name}": đang được ${projectCount} dự án áp dụng. Hãy chuyển các dự án sang quy trình khác trước khi xóa.`;
      }
    }
    return null;
  }

  // Metadata update
  app.put("/api/metadata/:key", async (req, res) => {
    try {
      if (!isSxdOrAdminUser((req as any).user)) {
        return res.status(403).json({ error: "Bạn không có quyền cập nhật danh mục hệ thống." });
      }
      if (req.params.key === "users") {
        return res.status(400).json({ error: "Không hỗ trợ cập nhật danh sách người dùng qua metadata. Vui lòng dùng /api/users." });
      }
      if (Array.isArray(req.body)) {
        const duplicate = duplicateCatalogValue(req.body);
        if (duplicate) {
          return res.status(409).json({ error: `"${duplicate}" bị trùng trong danh mục. Mỗi giá trị chỉ được xuất hiện một lần.` });
        }
      }
      const removalError = await catalogRemovalError(req.params.key, req.body);
      if (removalError) {
        return res.status(409).json({ error: removalError });
      }
      const list = await dbUpdateMetadata(req.params.key, req.body);
      res.json(list);
    } catch (err: any) {
      sendError(res, err);
    }
  });

  // Account fields, same rules as the forms (UserManagement / ProfileModal). For an update only the
  // fields sent with a new value are checked; the type/agency rules use the account as it will be saved.
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const PHONE_RE = /^[0-9+]{10,12}$/;
  async function accountFieldsError(body: any, existing?: any): Promise<string | null> {
    // On update a field counts only when it is sent with a new value (legacy values stay editable)
    const changed = (k: string) => body?.[k] !== undefined && String(body[k] ?? '').trim() !== String(existing?.[k] ?? '').trim();
    const has = (k: string) => !existing || changed(k);
    const text = (k: string) => String(body?.[k] ?? '').trim();
    if (has('fullName') && !text('fullName')) return "Họ và tên không được để trống.";
    if (has('username') && !text('username')) return "Tên đăng nhập không được để trống.";
    if (has('email') && !EMAIL_RE.test(text('email'))) return "Email không hợp lệ.";
    if (has('phone') && text('phone') && !PHONE_RE.test(text('phone'))) return "Số điện thoại không hợp lệ (10-12 chữ số).";
    if (!existing || changed('roleId')) {
      if (!text('roleId')) return "Vui lòng chọn vai trò cho tài khoản.";
    }
    const merged = { ...(existing || {}), ...(body || {}) };
    const typeChanged = !existing || ['userType', 'agencyId', 'investorId', 'department'].some(changed);
    if (typeChanged) {
      if (merged.userType !== 'agency' && merged.userType !== 'investor') return "Loại tài khoản không hợp lệ.";
      if (merged.userType === 'agency') {
        const agencies = await dbGetMetadata('processingAgencies');
        if (!agencies.some((a: any) => String(a?.id) === String(merged.agencyId))) return "Vui lòng chọn Cơ quan xử lý cho tài khoản này.";
        if (String(merged.agencyId) === '6' && !String(merged.department ?? '').trim()) {
          return "Tài khoản UBND cấp xã, phường phải chọn phường/xã phụ trách.";
        }
      } else if (!String(merged.investorId ?? '').trim()) {
        return "Vui lòng chọn Chủ đầu tư cho tài khoản này.";
      }
    }
    return null;
  }

  // Users CRUD
  app.get("/api/users", async (req, res) => {
    try {
      const viewer = (req as any).user;
      if (!isSxdOrAdminUser(viewer)) {
        return res.status(403).json({ error: "Bạn không có quyền xem danh sách tài khoản." });
      }
      const users = await dbGetUsers();
      const cleanUsers = users.map((u: any) => publicUserView(u, viewer));
      res.json(cleanUsers);
    } catch (err: any) {
      sendError(res, err);
    }
  });

  app.post("/api/users", async (req, res) => {
    try {
      const u = (req as any).user;
      const isSxdOrAdmin = u.roleId === 'Admin' || (u.userType === 'agency' && u.agencyId === '1');
      if (!isSxdOrAdmin) {
        return res.status(403).json({ error: "Bạn không có quyền tạo người dùng mới." });
      }
            if (isAdminUser(req.body) && !isAdminUser(u)) {
        return res.status(403).json({ error: "Chỉ Quản trị viên (Admin) mới được tạo tài khoản Admin." });
      }
      const accountError = await accountFieldsError(req.body);
      if (accountError) {
        return res.status(400).json({ error: accountError });
      }
      const { id: _clientId, ...newUser } = req.body;
      const user = await dbCreateUser(newUser);
      const { password, ...cleanUser } = user;
      res.json(cleanUser);
    } catch (err: any) {
      sendError(res, err);
    }
  });

  app.put("/api/users/me", async (req, res) => {
    try {
      const u = (req as any).user;
      if (!u || !u.id) {
        return res.status(401).json({ error: "Bạn cần đăng nhập để sử dụng chức năng này.", code: "AUTH_REQUIRED" });
      }
      const usersList = await dbGetUsers();
      const targetUser = usersList.find(item => item.id === u.id);
      if (!targetUser) {
        return res.status(404).json({ error: "Không tìm thấy người dùng" });
      }
            const payload = {
        fullName: profileText(req.body.fullName, targetUser.fullName),
        email: profileText(req.body.email, targetUser.email),
        phone: profileText(req.body.phone, targetUser.phone),
        avatar: profileText(req.body.avatar, targetUser.avatar),
      };
      const profileError = await accountFieldsError(
        { fullName: req.body.fullName === undefined ? undefined : payload.fullName,
          email: req.body.email === undefined ? undefined : payload.email,
          phone: req.body.phone === undefined ? undefined : payload.phone },
        targetUser
      );
      if (profileError) {
        return res.status(400).json({ error: profileError });
      }
      // Uniqueness is checked here: non-SXD clients no longer receive other accounts' contacts
      const others = usersList.filter((item: any) => item.id !== u.id);
      const newEmail = String(payload.email || '').trim().toLowerCase();
      if (newEmail && others.some((item: any) => String(item.email || '').trim().toLowerCase() === newEmail)) {
        return res.status(409).json({ error: "Email này đã được sử dụng bởi tài khoản khác." });
      }
      const newPhone = String(payload.phone || '').trim();
      if (newPhone && others.some((item: any) => String(item.phone || '').trim() === newPhone)) {
        return res.status(409).json({ error: "Số điện thoại này đã được sử dụng bởi tài khoản khác." });
      }
      const updated = await dbUpdateUser(u.id, payload);
      const { password, ...cleanUser } = updated;
      res.json(cleanUser);
    } catch (err: any) {
      sendError(res, err);
    }
  });

  app.put("/api/users/:id", async (req, res) => {
    try {
      const u = (req as any).user;
      const isSxdOrAdmin = u.roleId === 'Admin' || (u.userType === 'agency' && u.agencyId === '1');
      const isSelf = u.id === req.params.id;
      if (!isSxdOrAdmin && !isSelf) {
        return res.status(403).json({ error: "Bạn không có quyền chỉnh sửa người dùng này." });
      }

      const usersList = await dbGetUsers();
      const targetUser = usersList.find(item => item.id === req.params.id);
      if (!targetUser) {
        return res.status(404).json({ error: "Không tìm thấy người dùng" });
      }

      const isTargetAdmin = targetUser.roleId === 'Admin' || targetUser.roleId?.toLowerCase() === 'admin';
      if (isTargetAdmin && isSelf && req.body.roleId && req.body.roleId !== targetUser.roleId && req.body.roleId !== 'Admin') {
        return res.status(400).json({ error: "Không thể tự hạ quyền Quản trị viên (Admin) của chính mình!" });
      }

      let payload: any = {};
      if (!isSxdOrAdmin && isSelf) {
        payload = {
          fullName: profileText(req.body.fullName, targetUser.fullName),
          email: profileText(req.body.email, targetUser.email),
          phone: profileText(req.body.phone, targetUser.phone),
          avatar: profileText(req.body.avatar, targetUser.avatar),
        };
      } else {
        // SXD (non-Admin) may manage ordinary accounts but never Admin accounts or the Admin role
        if (!isAdminUser(u)) {
          if (isTargetAdmin) {
            return res.status(403).json({ error: "Chỉ Quản trị viên (Admin) mới được chỉnh sửa tài khoản Admin." });
          }
          if (isAdminUser(req.body)) {
            return res.status(403).json({ error: "Chỉ Quản trị viên (Admin) mới được cấp quyền Admin." });
          }
        }
                payload = { ...req.body };
        delete payload.password;
        delete payload.id;
        delete payload.mustChangePassword;
      }

      const accountError = await accountFieldsError(payload, targetUser);
      if (accountError) {
        return res.status(400).json({ error: accountError });
      }

      const user = await dbUpdateUser(req.params.id, payload);
      const { password, ...cleanUser } = user;
      res.json(cleanUser);
    } catch (err: any) {
      sendError(res, err);
    }
  });

  app.delete("/api/users/:id", async (req, res) => {
    try {
      const u = (req as any).user;
      const isSxdOrAdmin = u.roleId === 'Admin' || (u.userType === 'agency' && u.agencyId === '1');
      if (!isSxdOrAdmin) {
        return res.status(403).json({ error: "Bạn không có quyền xóa người dùng." });
      }
      if (u.id === req.params.id) {
        return res.status(400).json({ error: "Không thể tự xóa tài khoản của chính mình." });
      }
      const target = (await dbGetUsers()).find((item: any) => item.id === req.params.id);
      if (target && isAdminUser(target) && !isAdminUser(u)) {
        return res.status(403).json({ error: "Chỉ Quản trị viên (Admin) mới được xóa tài khoản Admin." });
      }
      const success = await dbDeleteUser(req.params.id);
      res.json({ success });
    } catch (err: any) {
      sendError(res, err);
    }
  });

  // Email SMTP config APIs
  app.get("/api/email-config", async (req, res) => {
    try {
      const u = (req as any).user;
      const isSxdOrAdmin = u.roleId === 'Admin' || (u.userType === 'agency' && u.agencyId === '1');
      if (!isSxdOrAdmin) {
        return res.status(403).json({ error: "Bạn không có quyền xem cấu hình email." });
      }
      const config = await dbGetEmailConfig();
      const displayConfig = { ...config, password: config.password ? "●●●●●●●●" : "" };
      res.json(displayConfig);
    } catch (err: any) {
      sendError(res, err);
    }
  });

  app.post("/api/email-config", async (req, res) => {
    try {
      const u = (req as any).user;
      const isSxdOrAdmin = u.roleId === 'Admin' || (u.userType === 'agency' && u.agencyId === '1');
      if (!isSxdOrAdmin) {
        return res.status(403).json({ error: "Bạn không có quyền lưu cấu hình email." });
      }
      const config = req.body;
      const currentConfig = await dbGetEmailConfig();
      if (config.password === "●●●●●●●●") {
        config.password = currentConfig.password;
      }
      const saved = await dbSaveEmailConfig(config);
      res.json(saved);
    } catch (err: any) {
      sendError(res, err);
    }
  });

  // File Upload config APIs
  app.get("/api/upload-config", async (req, res) => {
    try {
      const config = await dbGetUploadConfig();
      res.json(config);
    } catch (err: any) {
      sendError(res, err);
    }
  });

  app.post("/api/upload-config", async (req, res) => {
    try {
      const u = (req as any).user;
      const isSxdOrAdmin = u.roleId === 'Admin' || (u.userType === 'agency' && u.agencyId === '1');
      if (!isSxdOrAdmin) {
        return res.status(403).json({ error: "Bạn không có quyền sửa cấu hình tải lên." });
      }
      const maxSizeMb = Number(req.body?.maxSizeMb);
      if (!Number.isInteger(maxSizeMb) || maxSizeMb < 1 || maxSizeMb > UPLOAD_HARD_LIMIT_MB) {
        return res.status(400).json({ error: `Dung lượng tối đa phải là số nguyên từ 1 đến ${UPLOAD_HARD_LIMIT_MB} MB.` });
      }
      const extensions = String(req.body?.allowedExtensions ?? '')
        .split(',')
        .map((e: string) => e.trim().replace(/^\./, '').toUpperCase())
        .filter(Boolean);
      if (extensions.length === 0) {
        return res.status(400).json({ error: "Cần khai báo ít nhất một định dạng tệp được phép tải lên." });
      }
      const badExtension = extensions.find((e: string) => !/^[A-Z0-9]{1,10}$/.test(e));
      if (badExtension) {
        return res.status(400).json({ error: `Định dạng "${badExtension}" không hợp lệ (chỉ gồm chữ và số, ví dụ: PDF, DOCX).` });
      }
      const config = { ...req.body, maxSizeMb, allowedExtensions: Array.from(new Set(extensions)).join(',') };
      const saved = await dbSaveUploadConfig(config);
      res.json(saved);
    } catch (err: any) {
      sendError(res, err);
    }
  });

  // Password policy config APIs
  app.get("/api/password-policy", async (req, res) => {
    try {
      const config = await dbGetPasswordPolicy();
      res.json(config);
    } catch (err: any) {
      sendError(res, err);
    }
  });

  app.post("/api/password-policy", async (req, res) => {
    try {
      const u = (req as any).user;
      const isSxdOrAdmin = u.roleId === 'Admin' || (u.userType === 'agency' && u.agencyId === '1');
      if (!isSxdOrAdmin) {
        return res.status(403).json({ error: "Bạn không có quyền sửa cấu hình mật khẩu." });
      }
      // Same range as the form (UserManagement): shorter passwords are too weak, longer ones unusable
      const minLength = Number(req.body?.minLength);
      if (!Number.isInteger(minLength) || minLength < 4 || minLength > 32) {
        return res.status(400).json({ error: "Độ dài mật khẩu tối thiểu phải là số nguyên từ 4 đến 32 ký tự." });
      }
      const config = {
        ...req.body,
        minLength,
        requireUppercase: !!req.body?.requireUppercase,
        requireLowercase: !!req.body?.requireLowercase,
        requireNumbers: !!req.body?.requireNumbers,
        requireSpecialChars: !!req.body?.requireSpecialChars
      };
      const saved = await dbSavePasswordPolicy(config);
      res.json(saved);
    } catch (err: any) {
      sendError(res, err);
    }
  });

  // PM2 status endpoint
  // PM2 inputs are passed to a process runner, so they are whitelisted strictly
  const PM2_NAME_RE = /^[A-Za-z0-9_.-]{1,64}$/;
  function isValidPort(p: string): boolean {
    return /^\d{1,5}$/.test(p) && Number(p) >= 1 && Number(p) <= 65535;
  }
  // execFile (no shell) on Linux/macOS; Windows needs the shell for pm2.cmd, args are already whitelisted
  function runPm2(args: string[], port: string, cb: (error: any, stdout: string, stderr: string) => void) {
    const opts = { timeout: 10000, env: { ...process.env, PORT: port } };
    if (process.platform === "win32") {
      exec(["pm2", ...args].join(" "), opts, (e, so, se) => cb(e, String(so), String(se)));
    } else {
      execFile("pm2", args, opts, (e, so, se) => cb(e, String(so), String(se)));
    }
  }

  app.get("/api/pm2/status", async (req, res) => {
    try {
      if (!isAdminUser((req as any).user)) {
        return res.status(403).json({ error: "Chỉ Quản trị viên (Admin) mới được xem trạng thái PM2." });
      }

      const processName = (req.query.processName as string || "noxh-app").trim();
      const port = (req.query.port as string || "3000").trim();
      if (!PM2_NAME_RE.test(processName) || !isValidPort(port)) {
        return res.status(400).json({ error: "Tên tiến trình hoặc cổng không hợp lệ." });
      }

      exec("pm2 jlist", { timeout: 15000, maxBuffer: 20 * 1024 * 1024 }, (error, stdout) => {
        if (error) {
          // Only a missing pm2 binary means "PM2 not installed". A slow/failed call must not be reported
          // as "no PM2" – an Admin could then restart what they believe is a standalone server.
          const notInstalled = (error as any).code === 127 || /not recognized|not found|ENOENT/i.test(String(error.message));
          if (!notInstalled) {
            console.error("[PM2 status] pm2 jlist failed:", error.message);
            return res.status(503).json({
              error: "Không lấy được trạng thái PM2 (lệnh pm2 phản hồi chậm hoặc bị lỗi). Vui lòng thử lại sau.",
              pm2Available: null
            });
          }
          return res.json({
            running: true,
            processName,
            port,
            status: "online",
            pid: process.pid,
            pm2Available: false,
            uptime: Math.floor(process.uptime()),
            restarts: 0,
            memory: Math.round(process.memoryUsage().rss / 1024 / 1024),
            cpu: 0,
            execMode: "standalone",
            nodeVersion: process.version,
            message: `Ứng dụng đang chạy bình thường trên port ${port} (Sẵn sàng gửi lệnh PM2 tới server production).`,
            processes: [{ name: processName, status: "online", pid: process.pid }]
          });
        }

        try {
          const processes = JSON.parse(stdout);
          const targetProc = Array.isArray(processes)
            ? processes.find((p: any) => p.name === processName) || processes[0]
            : null;

          if (targetProc) {
            return res.json({
              running: targetProc.pm2_env?.status === "online",
              processName: targetProc.name || processName,
              port,
              status: targetProc.pm2_env?.status || "unknown",
              pid: targetProc.pid || 0,
              pm2Available: true,
              uptime: targetProc.pm2_env?.pm_uptime ? Math.floor((Date.now() - targetProc.pm2_env.pm_uptime) / 1000) : 0,
              restarts: targetProc.pm2_env?.restart_time || 0,
              memory: targetProc.monit?.memory ? Math.round(targetProc.monit.memory / 1024 / 1024) : 0,
              cpu: targetProc.monit?.cpu || 0,
              execMode: targetProc.pm2_env?.exec_mode || "fork_mode",
              nodeVersion: targetProc.pm2_env?.node_version || process.version,
              message: `Đang kết nối bình thường tới PM2 Process Manager (${processName})`,
              processes: processes.map((p: any) => ({
                name: p.name,
                status: p.pm2_env?.status,
                pid: p.pid,
                cpu: p.monit?.cpu,
                memory: p.monit?.memory ? Math.round(p.monit.memory / 1024 / 1024) : 0,
                restarts: p.pm2_env?.restart_time
              }))
            });
          } else {
            return res.json({
              running: false,
              processName,
              port,
              status: "stopped",
              pm2Available: true,
              message: `PM2 đang hoạt động nhưng chưa tìm thấy tiến trình '${processName}'.`,
              processes: processes.map((p: any) => ({ name: p.name, status: p.pm2_env?.status }))
            });
          }
        } catch (parseErr) {
          return res.json({
            running: true,
            processName,
            port,
            status: "online",
            pid: process.pid,
            pm2Available: true,
            message: stdout,
            processes: []
          });
        }
      });
    } catch (err: any) {
      sendError(res, err);
    }
  });

  // PM2 action endpoint
  app.post("/api/pm2/action", async (req, res) => {
    try {
      if (!isAdminUser((req as any).user)) {
        return res.status(403).json({ error: "Chỉ Quản trị viên (Admin) mới được thực hiện thao tác PM2." });
      }

      const { action = "restart", processName = "noxh-app", port = "3000" } = req.body;
      const safeProcessName = String(processName || "noxh-app").trim();
      const safePort = String(port || "3000").trim();
      if (!PM2_NAME_RE.test(safeProcessName)) {
        return res.status(400).json({ error: "Tên tiến trình chỉ được chứa chữ, số, dấu chấm, gạch ngang, gạch dưới (tối đa 64 ký tự)." });
      }
      if (!isValidPort(safePort)) {
        return res.status(400).json({ error: "Cổng (port) phải là số từ 1 đến 65535." });
      }

      // Each attempt is an argument list (no shell); "start" falls back like the old `a || b || c` chain
      let attempts: string[][];
      if (action === "restart") {
        attempts = [["restart", safeProcessName]];
      } else if (action === "start") {
        attempts = [["start", safeProcessName], ["start", "ecosystem.config.js"], ["restart", safeProcessName]];
      } else if (action === "stop") {
        attempts = [["stop", safeProcessName]];
      } else if (action === "reload") {
        attempts = [["reload", safeProcessName]];
      } else {
        return res.status(400).json({ error: "Thao tác không hợp lệ." });
      }
      const cmd = attempts.map(a => `PORT=${safePort} pm2 ${a.join(" ")}`).join(" || ");

      // Send success response to browser first so connection finishes cleanly
      res.json({
        success: true,
        cmd,
        stdout: `[PM2 Manager] Đã phát lệnh '${cmd}' thành công. Tiến trình '${safeProcessName}' (Port ${safePort}) đang được khởi động lại trên máy chủ.`,
        stderr: "",
        message: `Đã phát lệnh '${cmd}' thành công!`
      });

      // Execute command asynchronously after 200ms
      const runAttempt = (i: number, cb: (error: any, stdout: string, stderr: string) => void) => {
        runPm2(attempts[i], safePort, (error, stdout, stderr) => {
          if (error && i + 1 < attempts.length) return runAttempt(i + 1, cb);
          cb(error, stdout, stderr);
        });
      };
      setTimeout(() => {
        runAttempt(0, (error, stdout, stderr) => {
          if (error) {
            console.log(`[PM2 Exec Note]: ${error.message}`);
            // If PM2 is not installed or failed, and action is restart/reload/start, trigger graceful process exit so server supervisor auto-restarts with updated code
            if (action === "restart" || action === "reload" || action === "start") {
              console.log("[PM2 Manager] PM2 not present or failed, triggering graceful process exit for supervisor auto-restart...");
              setTimeout(() => {
                process.exit(0);
              }, 300);
            }
          } else {
            console.log(`[PM2 Exec Output]: ${stdout || stderr}`);
          }
        });
      }, 200);

    } catch (err: any) {
      sendError(res, err);
    }
  });

  app.post("/api/users/:id/recover-password", async (req, res) => {
    try {
      const currentUser = (req as any).user;
      const isSxdOrAdmin = currentUser && (
        currentUser.roleId === 'Admin' ||
        currentUser.roleId?.toLowerCase() === 'admin' ||
        (currentUser.userType === 'agency' && currentUser.agencyId === '1')
      );
      if (!isSxdOrAdmin) {
        return res.status(403).json({ error: "Chỉ quản trị viên hệ thống (Admin) hoặc Sở Xây dựng mới có quyền đặt lại mật khẩu cho tài khoản người dùng." });
      }

      const userId = req.params.id;
      if (currentUser.id === userId) {
        return res.status(400).json({ error: "Không được tự đặt lại mật khẩu cho chính mình qua tính năng này. Vui lòng sử dụng tính năng 'Đổi mật khẩu' cá nhân." });
      }

      const users = await dbGetUsers();
      const user = users.find((u: any) => u.id === userId);
      if (!user) {
        return res.status(404).json({ error: "Không tìm thấy tài khoản người dùng." });
      }

      if (isAdminUser(user) && !isAdminUser(currentUser)) {
        return res.status(403).json({ error: "Chỉ Quản trị viên (Admin) mới được đặt lại mật khẩu tài khoản Admin." });
      }

      if (!user.email) {
        return res.status(400).json({ error: "Người dùng không có địa chỉ email để gửi." });
      }

      // Generate highly secure temporary password satisfying the active password policy
      const policyConfig = await dbGetPasswordPolicy();
      const tempPassword = generatePolicyCompliantPassword(policyConfig);
      const hashed = hashNewPassword(tempPassword);

      // Save password (hashed) and set must_change_password to true
      const dbSuccess = await dbResetUserPassword(userId, hashed, true);
      if (!dbSuccess) {
        return res.status(500).json({ error: "Không thể cập nhật mật khẩu trong cơ sở dữ liệu." });
      }

      // Read email settings & dispatch
      const emailConfig = await dbGetEmailConfig();
      let emailSent = false;
      let emailError = "";

      if (emailConfig && emailConfig.host && emailConfig.username && emailConfig.password) {
        try {
          const transporter = nodemailer.createTransport({
            host: emailConfig.host,
            port: Number(emailConfig.port) || 587,
            secure: !!emailConfig.secure,
            auth: {
              user: emailConfig.username,
              pass: emailConfig.password
            },
            tls: {
              // Verify the mail server certificate; set SMTP_ALLOW_SELF_SIGNED=true only for an internal
              // SMTP server with a self-signed certificate
              rejectUnauthorized: (process.env.SMTP_ALLOW_SELF_SIGNED || "").toLowerCase() !== "true"
            }
          });

          await transporter.sendMail({
            from: `"${emailConfig.fromName}" <${emailConfig.fromEmail}>`,
            to: user.email,
            subject: "[Hệ thống Quản lý] Yêu cầu khôi phục mật khẩu mới",
            text: `Xin chào ${user.fullName || user.username},\n\nMật khẩu tài khoản của bạn đã được khôi phục thành công.\n\nMật khẩu mới: ${tempPassword}\n\nVui lòng đăng nhập và tiến hành đổi mật khẩu ngay để đảm bảo an toàn.\n\nTrân trọng,\n${emailConfig.fromName}`,
            html: `
              <div style="font-family: Arial, sans-serif; padding: 25px; color: #1e293b; line-height: 1.6; max-width: 600px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
                <h2 style="color: #2563eb; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; margin-top: 0;">Khôi phục mật khẩu thành công</h2>
                <p>Xin chào <strong>${user.fullName || user.username}</strong>,</p>
                <p>Chúng tôi nhận được yêu cầu cài lại mật khẩu cho quý đối tác tác nghiệp trên hệ thống.</p>
                <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; padding: 20px; border-radius: 8px; margin: 24px 0; text-align: center;">
                  <span style="font-size: 13px; color: #64748b; display: block; margin-bottom: 8px; font-weight: 500; letter-spacing: 0.5px;">MẬT KHẨU TẠM THỜI MỚI</span>
                  <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #0284c7; font-family: 'Courier New', Courier, monospace;">${tempPassword}</span>
                </div>
                <p style="color: #ef4444; font-size: 13px; font-weight: 500; margin-top: 15px;">
                  * Khuyến cáo bảo mật: Quý vị hãy lập tức đăng nhập bằng mật khẩu tạm này và thực hiện cập nhật lại mật khẩu cá nhân mới để tối ưu bảo mật.
                </p>
                <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 24px 0;" />
                <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-bottom: 0;">
                  Thư này được gửi tự động bởi Hệ Thống Quản Lý Dự Án. Vui lòng miễn trả lời trực tiếp.
                </p>
              </div>
            `
          });
          emailSent = true;
        } catch (mailErr: any) {
          console.error("Nodemailer failed to send email: ", mailErr);
          emailError = mailErr.message || "Lỗi SMTP hoặc kết nối máy chủ";
        }
      } else {
        emailError = "SMTP chưa được cấu hình hoàn chỉnh.";
      }

      res.json({
        success: true,
        tempPassword: emailSent ? null : tempPassword,
        emailSent,
        emailError: emailSent ? null : emailError,
        email: user.email
      });
    } catch (err: any) {
      sendError(res, err);
    }
  });

  app.post("/api/profile/change-password", async (req, res) => {
    try {
      const u = (req as any).user;
      if (!u || !u.id) {
        return res.status(401).json({ error: "Bạn cần đăng nhập để sử dụng chức năng này.", code: "AUTH_REQUIRED" });
      }

      const { oldPassword } = req.body;
      // Validate exactly what gets stored (the hash is computed on the trimmed value)
      const newPassword = typeof req.body.newPassword === "string" ? req.body.newPassword.trim() : "";
      if (!oldPassword || !newPassword) {
        return res.status(400).json({ error: "Vui lòng nhập đầy đủ mật khẩu cũ và mới." });
      }

      const users = await dbGetUsers();
      const user = users.find((item: any) => item.id === u.id);
      if (!user) {
        return res.status(404).json({ error: "Không tìm thấy thông tin tài khoản." });
      }

      // 1. Verify old password
      if (!verifyPassword(String(oldPassword), user.password || '')) {
        return res.status(400).json({ error: "Mật khẩu cũ không chính xác. Vui lòng kiểm tra lại!" });
      }

            if (verifyPassword(newPassword, user.password || '')) {
        return res.status(400).json({ error: "Mật khẩu mới phải khác mật khẩu hiện tại." });
      }

      // 2. Validate new password against policy
      const policy = await dbGetPasswordPolicy();
      const minLength = policy.minLength || 6;
      if (newPassword.length < minLength) {
        return res.status(400).json({ error: `Mật khẩu mới phải có ít nhất ${minLength} ký tự.` });
      }
      if (policy.requireUppercase && !/[A-Z]/.test(newPassword)) {
        return res.status(400).json({ error: "Mật khẩu mới phải chứa ít nhất một chữ cái in hoa (A-Z)." });
      }
      if (policy.requireLowercase && !/[a-z]/.test(newPassword)) {
        return res.status(400).json({ error: "Mật khẩu mới phải chứa ít nhất một chữ cái thường (a-z)." });
      }
      if (policy.requireNumbers && !/[0-9]/.test(newPassword)) {
        return res.status(400).json({ error: "Mật khẩu mới phải chứa ít nhất một chữ số (0-9)." });
      }
      if (policy.requireSpecialChars && !/[!@#$%&*]/.test(newPassword)) {
        return res.status(400).json({ error: "Mật khẩu mới phải chứa ít nhất một ký tự đặc biệt (ví dụ: ! @ # $ % & *)." });
      }

      // 3. Save new password (hashed) and clear must_change_password flag
      const hashedNew = hashNewPassword(newPassword);
      const dbSuccess = await dbResetUserPassword(u.id, hashedNew, false);
      if (!dbSuccess) {
        return res.status(500).json({ error: "Không thể lưu mật khẩu mới." });
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error("Change password error: ", err);
      sendError(res, err);
    }
  });

  // --- Vite Middleware ---
  // Errors raised by middleware (malformed JSON, oversized body, upload limits…) → Vietnamese JSON, not Express's HTML page
  app.use("/api", (err: any, req: any, res: any, next: any) => {
    if (err?.type === "entity.parse.failed") {
      return res.status(400).json({ error: "Dữ liệu gửi lên không đúng định dạng JSON." });
    }
    if (err?.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: `Tệp vượt quá dung lượng tối đa hệ thống cho phép (${UPLOAD_HARD_LIMIT_MB} MB).` });
    }
    if (err?.code === "LIMIT_FILE_COUNT" || err?.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({ error: "Mỗi lần chỉ được tải lên một tệp." });
    }
    if (err?.type === "entity.too.large") {
      return res.status(413).json({ error: "Dữ liệu gửi lên vượt quá dung lượng cho phép." });
    }
    sendError(res, err);
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

