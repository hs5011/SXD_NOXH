/**
 * Integration Tests: Phân quyền dữ liệu theo Role/UserType
 *
 * Kiểm tra toàn bộ logic phân quyền trong server.ts:
 *   - JWT authentication (401 nếu không có token, 403 nếu token sai)
 *   - Admin / SXD (agencyId=1): thấy tất cả dự án, làm được mọi thứ
 *   - Agency khác: chỉ thấy dự án đang ở bước của cơ quan mình
 *   - UBND xã phường (agencyId=6): lọc theo bước + địa bàn
 *   - Investor: chỉ thấy dự án của mình (theo investorId)
 *   - Phân quyền ghi: POST/PUT/DELETE projects, users, email-config
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'noxh_governance_secure_key_2026';

// ─── Mock DB ──────────────────────────────────────────────────────────────────
vi.mock('../../server/db.ts', () => ({
  initDatabase: vi.fn().mockResolvedValue({}),
  getDbStatus: vi.fn().mockReturnValue({ connected: true }),
  dbGetProjects: vi.fn(),
  dbCreateProject: vi.fn().mockImplementation((p: any) => Promise.resolve({ ...p, id: 'new-id' })),
  dbUpdateProject: vi.fn().mockImplementation((id: string, p: any) => Promise.resolve({ ...p, id })),
  dbDeleteProject: vi.fn().mockResolvedValue(true),
  dbGetAllMetadata: vi.fn(),
  dbUpdateMetadata: vi.fn().mockResolvedValue([]),
  dbGetUsers: vi.fn().mockResolvedValue([
    { id: 'u1', username: 'admin', email: 'admin@test.com', userType: 'agency', agencyId: '1', roleId: 'Admin', password: 'hashed' },
    { id: 'u2', username: 'sxd', email: 'sxd@test.com', userType: 'agency', agencyId: '1', roleId: 'User', password: 'hashed' },
    { id: 'u3', username: 'sdh', email: 'sdh@test.com', userType: 'agency', agencyId: '2', roleId: 'User', password: 'hashed' },
    { id: 'u4', username: 'ubnd', email: 'ubnd@test.com', userType: 'agency', agencyId: '6', roleId: 'User', password: 'hashed' },
    { id: 'u5', username: 'investor1', email: 'inv@test.com', userType: 'investor', investorId: 'INV-001', roleId: 'User', password: 'hashed' },
  ]),
  dbCreateUser: vi.fn().mockImplementation((u: any) => Promise.resolve({ ...u, id: 'new-user-id' })),
  dbUpdateUser: vi.fn().mockImplementation((id: string, u: any) => Promise.resolve({ ...u, id })),
  dbDeleteUser: vi.fn().mockResolvedValue(true),
  dbGetActualProgress: vi.fn().mockResolvedValue({}),
  dbUpdateActualProgress: vi.fn().mockResolvedValue({}),
  dbResetActualProgress: vi.fn().mockResolvedValue(true),
  dbGetProjectAttachments: vi.fn().mockResolvedValue([]),
  dbGetAttachmentById: vi.fn().mockResolvedValue(null),
  dbGetProjectHistory: vi.fn().mockResolvedValue([]),
  dbCreateProjectHistory: vi.fn().mockResolvedValue({}),
  dbGetEmailConfig: vi.fn().mockResolvedValue({ host: 'smtp.test.com', password: 'secret' }),
  dbSaveEmailConfig: vi.fn().mockImplementation((c: any) => Promise.resolve(c)),
  dbResetUserPassword: vi.fn().mockResolvedValue(true),
  dbGetUploadConfig: vi.fn().mockResolvedValue({ allowedExtensions: 'PDF,DOCX,XLSX', maxSizeMb: 20 }),
  dbSaveUploadConfig: vi.fn().mockImplementation((c: any) => Promise.resolve(c)),
  dbGetPasswordPolicy: vi.fn().mockResolvedValue({ minLength: 6, requireUppercase: false, requireLowercase: false, requireNumbers: false, requireSpecialChars: false }),
  dbSavePasswordPolicy: vi.fn().mockImplementation((p: any) => Promise.resolve(p)),
}));

vi.mock('nodemailer', () => ({
  default: { createTransport: vi.fn().mockReturnValue({ sendMail: vi.fn().mockResolvedValue({}) }) },
}));

vi.mock('../../src/lib/crypto.ts', () => ({
  hashPassword: vi.fn().mockReturnValue('hashed-password'),
  generatePolicyCompliantPassword: vi.fn().mockReturnValue('TempPass123!'),
}));

import * as db from '../../server/db.ts';

// ─── Dữ liệu mẫu ─────────────────────────────────────────────────────────────

// Metadata mẫu: map bước → cơ quan
const MOCK_META = {
  processes: [
    {
      id: 'proc1',
      childSteps: [
        { name: 'Buoc SXD',         agency: 'So Xay Dung' },
        { name: 'Buoc SDH',         agency: 'So Dia hinh' },
        { name: 'Buoc UBND',        agency: 'UBND cap xa, phuong' },
        { name: 'Buoc SQH',         agency: 'So Quy hoach Kien truc' },
      ],
    },
  ],
  processingAgencies: [
    { id: '1', name: 'So Xay Dung' },
    { id: '2', name: 'So Dia hinh' },
    { id: '6', name: 'UBND cap xa, phuong' },
  ],
};

// Dự án mẫu
const MOCK_PROJECTS = [
  { id: 'p1', name: 'Du an SXD',     currentStep: 'Buoc SXD',  investor: 'INV-001', location: 'Phuong 1, Quan 1' },
  { id: 'p2', name: 'Du an SDH',     currentStep: 'Buoc SDH',  investor: 'INV-002', location: 'Phuong 3, Quan 3' },
  { id: 'p3', name: 'Du an UBND',    currentStep: 'Buoc UBND', investor: 'INV-001', location: 'Phuong 5, Quan Binh Thanh' },
  { id: 'p4', name: 'Du an SQH',     currentStep: 'Buoc SQH',  investor: 'INV-002', location: 'Phuong 8, Quan Binh Thanh' },
];

// ─── Helper tạo token ─────────────────────────────────────────────────────────

function makeToken(payload: object) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

const TOKEN_ADMIN    = makeToken({ id: 'u1', roleId: 'Admin',  userType: 'agency',   agencyId: '1' });
const TOKEN_SXD      = makeToken({ id: 'u2', roleId: 'User',   userType: 'agency',   agencyId: '1' });
const TOKEN_SDH      = makeToken({ id: 'u3', roleId: 'User',   userType: 'agency',   agencyId: '2' });
const TOKEN_UBND     = makeToken({ id: 'u4', roleId: 'User',   userType: 'agency',   agencyId: '6', department: 'UBND Phuong 5' });
const TOKEN_INVESTOR = makeToken({ id: 'u5', roleId: 'User',   userType: 'investor', investorId: 'INV-001' });
const TOKEN_INVALID  = 'Bearer invalid.token.here';

// ─── Tạo app test với JWT đầy đủ ──────────────────────────────────────────────

function createAuthApp() {
  const app = express();
  app.use(express.json());

  // JWT middleware (copy từ server.ts)
  function authenticateToken(req: any, res: any, next: any) {
    const fullPath = req.baseUrl + req.path;
    const publicPaths = ['/api/health', '/api/db-status', '/api/login'];
    const isRecoverPath = (req.baseUrl + req.path).endsWith('/recover-password');
    if (publicPaths.includes(fullPath) || isRecoverPath) return next();

    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access token required' });

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
      if (err) return res.status(403).json({ error: 'Invalid or expired token' });
      req.user = user;
      next();
    });
  }

  app.use('/api', authenticateToken);

  // Public
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.post('/api/login', (_req, res) => res.json({ token: TOKEN_ADMIN, user: {} }));

  // GET /api/data — lọc dự án theo role
  app.get('/api/data', async (req: any, res) => {
    try {
      const projects = await db.dbGetProjects();
      const meta = await db.dbGetAllMetadata();
      const users = await db.dbGetUsers();
      const actualProgress = await db.dbGetActualProgress();
      const currentUser = req.user;
      let visibleProjects = projects;

      if (currentUser && currentUser.roleId !== 'Admin') {
        const { userType, agencyId, department = '', investorId } = currentUser;
        const processes = (meta as any).processes || [];
        const stepToAgencyMap: Record<string, string> = {};
        processes.forEach((proc: any) => {
          proc.childSteps?.forEach((cs: any) => {
            if (cs.name && cs.agency) stepToAgencyMap[cs.name] = cs.agency;
          });
        });
        const agencies = (meta as any).processingAgencies || [];
        const userAgencyName = agencies.find((a: any) => a.id === agencyId)?.name || '';

        visibleProjects = projects.filter((p: any) => {
          const stepAgency = stepToAgencyMap[p.currentStep];

          if (userType === 'agency' && agencyId === '1') return true;

          if (userType === 'agency' && agencyId === '6') {
            const loc = p.location?.toLowerCase() || '';
            const dept = department.toLowerCase().replace(/ubnd|phuong|xa/g, '').trim();
            const isLoc = dept && loc.includes(dept);
            const isStep = stepAgency === 'UBND cap xa, phuong' || stepAgency === 'So Quy hoach Kien truc';
            return isLoc && isStep;
          }

          if (userType === 'agency') return stepAgency === userAgencyName;
          if (userType === 'investor') return p.investor === investorId;
          return false;
        });
      }

      const cleanUsers = users.map(({ password, ...u }: any) => u);
      res.json({ projects: visibleProjects, users: cleanUsers, actualProgress, ...meta });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // POST /api/projects — chỉ Admin hoặc SXD
  app.post('/api/projects', async (req: any, res) => {
    const u = req.user;
    if (u.roleId !== 'Admin' && !(u.userType === 'agency' && u.agencyId === '1'))
      return res.status(403).json({ error: 'Ban khong co quyen tao du an moi.' });
    try { res.json(await db.dbCreateProject(req.body)); }
    catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // PUT /api/projects/:id — theo role
  app.put('/api/projects/:id', async (req: any, res) => {
    const u = req.user;
    const projects = await db.dbGetProjects();
    const project = projects.find((p: any) => p.id === req.params.id);
    if (!project) return res.status(404).json({ error: 'Khong tim thay du an.' });

    const isSxdOrAdmin = u.roleId === 'Admin' || (u.userType === 'agency' && u.agencyId === '1');
    if (!isSxdOrAdmin) {
      if (u.userType === 'investor') {
        if (project.investor !== u.investorId)
          return res.status(403).json({ error: 'Ban khong co quyen chinh sua du an nay.' });
      } else if (u.userType === 'agency') {
        const meta = await db.dbGetAllMetadata();
        const processes = (meta as any).processes || [];
        const stepToAgencyMap: Record<string, string> = {};
        processes.forEach((proc: any) => {
          proc.childSteps?.forEach((cs: any) => {
            if (cs.name && cs.agency) stepToAgencyMap[cs.name] = cs.agency;
          });
        });
        const agencies = (meta as any).processingAgencies || [];
        const userAgencyName = agencies.find((a: any) => a.id === u.agencyId)?.name || '';
        const currentStepAgency = stepToAgencyMap[project.currentStep];

        if (u.agencyId === '6') {
          const loc = project.location?.toLowerCase() || '';
          const dept = (u.department || '').toLowerCase().replace(/ubnd|phuong|xa/g, '').trim();
          const isLoc = dept && loc.includes(dept);
          const isStep = currentStepAgency === 'UBND cap xa, phuong' || currentStepAgency === 'So Quy hoach Kien truc';
          if (!isLoc || !isStep) return res.status(403).json({ error: 'Khong co quyen.' });
        } else if (currentStepAgency !== userAgencyName) {
          return res.status(403).json({ error: 'Du an hien khong o buoc xu ly cua co quan ban.' });
        }
      } else {
        return res.status(403).json({ error: 'Khong co quyen.' });
      }
    }
    try { res.json(await db.dbUpdateProject(req.params.id, req.body)); }
    catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // DELETE /api/projects/:id — chỉ Admin hoặc SXD
  app.delete('/api/projects/:id', async (req: any, res) => {
    const u = req.user;
    if (u.roleId !== 'Admin' && !(u.userType === 'agency' && u.agencyId === '1'))
      return res.status(403).json({ error: 'Ban khong co quyen xoa du an.' });
    try { res.json({ success: await db.dbDeleteProject(req.params.id) }); }
    catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Users CRUD
  app.get('/api/users', async (_req, res) => {
    try {
      const users = await db.dbGetUsers();
      res.json(users.map(({ password, ...u }: any) => u));
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/users', async (req: any, res) => {
    const u = req.user;
    if (u.roleId !== 'Admin' && !(u.userType === 'agency' && u.agencyId === '1'))
      return res.status(403).json({ error: 'Ban khong co quyen tao nguoi dung moi.' });
    try { res.json(await db.dbCreateUser(req.body)); }
    catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.put('/api/users/:id', async (req: any, res) => {
    const u = req.user;
    const isSxdOrAdmin = u.roleId === 'Admin' || (u.userType === 'agency' && u.agencyId === '1');
    const isSelf = u.id === req.params.id;
    if (!isSxdOrAdmin && !isSelf)
      return res.status(403).json({ error: 'Ban khong co quyen chinh sua nguoi dung nay.' });
    try { res.json(await db.dbUpdateUser(req.params.id, req.body)); }
    catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.delete('/api/users/:id', async (req: any, res) => {
    const u = req.user;
    if (u.roleId !== 'Admin' && !(u.userType === 'agency' && u.agencyId === '1'))
      return res.status(403).json({ error: 'Ban khong co quyen xoa nguoi dung.' });
    try { res.json({ success: await db.dbDeleteUser(req.params.id) }); }
    catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Email config
  app.get('/api/email-config', async (req: any, res) => {
    const u = req.user;
    if (u.roleId !== 'Admin' && !(u.userType === 'agency' && u.agencyId === '1'))
      return res.status(403).json({ error: 'Ban khong co quyen xem cau hinh email.' });
    try {
      const config = await db.dbGetEmailConfig();
      res.json({ ...config, password: config.password ? '●●●●●●●●' : '' });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/email-config', async (req: any, res) => {
    const u = req.user;
    if (u.roleId !== 'Admin' && !(u.userType === 'agency' && u.agencyId === '1'))
      return res.status(403).json({ error: 'Ban khong co quyen luu cau hinh email.' });
    try { res.json(await db.dbSaveEmailConfig(req.body)); }
    catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Recover password (public per-user)
  app.post('/api/users/:id/recover-password', async (req, res) => {
    try {
      const users = await db.dbGetUsers();
      const user = users.find((u: any) => u.id === req.params.id);
      if (!user) return res.status(404).json({ error: 'Khong tim thay nguoi dung.' });
      await db.dbResetUserPassword(req.params.id, 'hashed');
      res.json({ success: true, emailSent: false });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Upload Config
  app.get('/api/upload-config', async (_req, res) => {
    try { res.json(await db.dbGetUploadConfig()); }
    catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/upload-config', async (req: any, res) => {
    const u = req.user;
    if (u.roleId !== 'Admin' && !(u.userType === 'agency' && u.agencyId === '1'))
      return res.status(403).json({ error: 'Ban khong co quyen sua cau hinh tai len.' });
    try { res.json(await db.dbSaveUploadConfig(req.body)); }
    catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Password Policy
  app.get('/api/password-policy', async (_req, res) => {
    try { res.json(await db.dbGetPasswordPolicy()); }
    catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/password-policy', async (req: any, res) => {
    const u = req.user;
    if (u.roleId !== 'Admin' && !(u.userType === 'agency' && u.agencyId === '1'))
      return res.status(403).json({ error: 'Ban khong co quyen sua cau hinh mat khau.' });
    try { res.json(await db.dbSavePasswordPolicy(req.body)); }
    catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Change password (authenticated user can change own password)
  app.post('/api/profile/change-password', async (req: any, res) => {
    const u = req.user;
    if (!u || !u.id) return res.status(401).json({ error: 'Chua xac thuc.' });
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) return res.status(400).json({ error: 'Vui long nhap du mat khau.' });
    res.json({ success: true });
  });

  return app;
}

// ─── Setup ────────────────────────────────────────────────────────────────────

let app: ReturnType<typeof createAuthApp>;

beforeEach(() => {
  vi.clearAllMocks();
  app = createAuthApp();
  vi.mocked(db.dbGetProjects).mockResolvedValue(MOCK_PROJECTS as any);
  vi.mocked(db.dbGetAllMetadata).mockResolvedValue(MOCK_META as any);
});

// ═══════════════════════════════════════════════════════════════════════════════
// NHÓM 1: JWT Authentication
// ═══════════════════════════════════════════════════════════════════════════════

describe('JWT Authentication', () => {
  it('AUTH-01: /api/health không cần token', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
  });

  it('AUTH-02: /api/login không cần token', async () => {
    const res = await request(app).post('/api/login').send({ username: 'admin', password: '123' });
    expect(res.status).toBe(200);
  });

  it('AUTH-03: /api/data không có token → 401', async () => {
    const res = await request(app).get('/api/data');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/token/i);
  });

  it('AUTH-04: /api/projects không có token → 401', async () => {
    const res = await request(app).post('/api/projects').send({});
    expect(res.status).toBe(401);
  });

  it('AUTH-05: Token sai/hết hạn → 403', async () => {
    const res = await request(app)
      .get('/api/data')
      .set('Authorization', TOKEN_INVALID);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/invalid|expired/i);
  });

  it('AUTH-06: Token hợp lệ → 200', async () => {
    const res = await request(app)
      .get('/api/data')
      .set('Authorization', `Bearer ${TOKEN_ADMIN}`);
    expect(res.status).toBe(200);
  });

  it('AUTH-07: /api/users/:id/recover-password không cần token (public)', async () => {
    const res = await request(app).post('/api/users/u1/recover-password');
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// NHÓM 2: Phân quyền xem dữ liệu — GET /api/data
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phan quyen GET /api/data', () => {
  it('DATA-01: Admin thấy tất cả 4 dự án', async () => {
    const res = await request(app)
      .get('/api/data')
      .set('Authorization', `Bearer ${TOKEN_ADMIN}`);
    expect(res.status).toBe(200);
    expect(res.body.projects).toHaveLength(4);
  });

  it('DATA-02: SXD (agencyId=1) thấy tất cả 4 dự án', async () => {
    const res = await request(app)
      .get('/api/data')
      .set('Authorization', `Bearer ${TOKEN_SXD}`);
    expect(res.status).toBe(200);
    expect(res.body.projects).toHaveLength(4);
  });

  it('DATA-03: SDH (agencyId=2) chỉ thấy dự án đang ở Buoc SDH', async () => {
    const res = await request(app)
      .get('/api/data')
      .set('Authorization', `Bearer ${TOKEN_SDH}`);
    expect(res.status).toBe(200);
    expect(res.body.projects).toHaveLength(1);
    expect(res.body.projects[0].id).toBe('p2');
  });

  it('DATA-04: UBND Phuong 5 chỉ thấy dự án ở Phuong 5 đang ở bước UBND', async () => {
    const res = await request(app)
      .get('/api/data')
      .set('Authorization', `Bearer ${TOKEN_UBND}`);
    expect(res.status).toBe(200);
    // p3: currentStep=Buoc UBND, location=Phuong 5 → thấy được
    expect(res.body.projects.map((p: any) => p.id)).toContain('p3');
    // p4: Buoc SQH (So Quy hoach) → UBND cũng thấy nếu đúng địa bàn, nhưng p4 ở Phuong 8
    expect(res.body.projects.map((p: any) => p.id)).not.toContain('p4');
  });

  it('DATA-05: UBND không thấy dự án sai địa bàn dù đúng bước', async () => {
    // p3 ở Phuong 5, UBND department=Phuong 5 → thấy
    // p2 ở Phuong 3, bước SDH → không thấy
    const res = await request(app)
      .get('/api/data')
      .set('Authorization', `Bearer ${TOKEN_UBND}`);
    const ids = res.body.projects.map((p: any) => p.id);
    expect(ids).not.toContain('p2');
  });

  it('DATA-06: Investor chỉ thấy dự án của mình (investor=INV-001)', async () => {
    const res = await request(app)
      .get('/api/data')
      .set('Authorization', `Bearer ${TOKEN_INVESTOR}`);
    expect(res.status).toBe(200);
    // p1 và p3 thuộc INV-001
    const ids = res.body.projects.map((p: any) => p.id);
    expect(ids).toContain('p1');
    expect(ids).toContain('p3');
    // p2, p4 thuộc INV-002 → không thấy
    expect(ids).not.toContain('p2');
    expect(ids).not.toContain('p4');
  });

  it('DATA-07: Password bị strip khỏi danh sách users trả về', async () => {
    const res = await request(app)
      .get('/api/data')
      .set('Authorization', `Bearer ${TOKEN_ADMIN}`);
    res.body.users.forEach((u: any) => {
      expect(u).not.toHaveProperty('password');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// NHÓM 3: Phân quyền tạo/xóa dự án — POST / DELETE /api/projects
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phan quyen POST /api/projects', () => {
  it('PROJ-01: Admin tạo dự án → 200', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${TOKEN_ADMIN}`)
      .send({ name: 'Du an moi' });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('new-id');
  });

  it('PROJ-02: SXD (agencyId=1) tạo dự án → 200', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${TOKEN_SXD}`)
      .send({ name: 'Du an moi' });
    expect(res.status).toBe(200);
  });

  it('PROJ-03: SDH (agencyId=2) tạo dự án → 403', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${TOKEN_SDH}`)
      .send({ name: 'Du an moi' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBeTruthy();
  });

  it('PROJ-04: UBND tạo dự án → 403', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${TOKEN_UBND}`)
      .send({ name: 'Du an moi' });
    expect(res.status).toBe(403);
  });

  it('PROJ-05: Investor tạo dự án → 403', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${TOKEN_INVESTOR}`)
      .send({ name: 'Du an moi' });
    expect(res.status).toBe(403);
  });
});

describe('Phan quyen DELETE /api/projects/:id', () => {
  it('PROJ-06: Admin xóa dự án → 200', async () => {
    const res = await request(app)
      .delete('/api/projects/p1')
      .set('Authorization', `Bearer ${TOKEN_ADMIN}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('PROJ-07: SDH xóa dự án → 403', async () => {
    const res = await request(app)
      .delete('/api/projects/p2')
      .set('Authorization', `Bearer ${TOKEN_SDH}`);
    expect(res.status).toBe(403);
  });

  it('PROJ-08: Investor xóa dự án → 403', async () => {
    const res = await request(app)
      .delete('/api/projects/p1')
      .set('Authorization', `Bearer ${TOKEN_INVESTOR}`);
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// NHÓM 4: Phân quyền sửa dự án — PUT /api/projects/:id
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phan quyen PUT /api/projects/:id', () => {
  it('PUT-01: Admin sửa bất kỳ dự án → 200', async () => {
    const res = await request(app)
      .put('/api/projects/p2')
      .set('Authorization', `Bearer ${TOKEN_ADMIN}`)
      .send({ name: 'Updated' });
    expect(res.status).toBe(200);
  });

  it('PUT-02: SDH sửa dự án đang ở Buoc SDH → 200', async () => {
    const res = await request(app)
      .put('/api/projects/p2')
      .set('Authorization', `Bearer ${TOKEN_SDH}`)
      .send({ name: 'Updated' });
    expect(res.status).toBe(200);
  });

  it('PUT-03: SDH sửa dự án KHÔNG ở bước mình → 403', async () => {
    const res = await request(app)
      .put('/api/projects/p1')   // p1 đang ở Buoc SXD, không phải SDH
      .set('Authorization', `Bearer ${TOKEN_SDH}`)
      .send({ name: 'Updated' });
    expect(res.status).toBe(403);
  });

  it('PUT-04: Investor sửa dự án của mình (INV-001) → 200', async () => {
    const res = await request(app)
      .put('/api/projects/p1')   // p1 thuộc INV-001
      .set('Authorization', `Bearer ${TOKEN_INVESTOR}`)
      .send({ name: 'Updated by investor' });
    expect(res.status).toBe(200);
  });

  it('PUT-05: Investor sửa dự án KHÔNG phải của mình → 403', async () => {
    const res = await request(app)
      .put('/api/projects/p2')   // p2 thuộc INV-002
      .set('Authorization', `Bearer ${TOKEN_INVESTOR}`)
      .send({ name: 'Updated' });
    expect(res.status).toBe(403);
  });

  it('PUT-06: UBND sửa dự án đúng địa bàn + đúng bước → 200', async () => {
    const res = await request(app)
      .put('/api/projects/p3')   // p3: Buoc UBND, Phuong 5
      .set('Authorization', `Bearer ${TOKEN_UBND}`)
      .send({ name: 'Updated by UBND' });
    expect(res.status).toBe(200);
  });

  it('PUT-07: UBND sửa dự án sai địa bàn → 403', async () => {
    // p4: Buoc SQH, Phuong 8 — UBND Phuong 5 không có quyền vì sai địa bàn
    const res = await request(app)
      .put('/api/projects/p4')
      .set('Authorization', `Bearer ${TOKEN_UBND}`)
      .send({ name: 'Updated' });
    expect(res.status).toBe(403);
  });

  it('PUT-08: Dự án không tồn tại → 404', async () => {
    const res = await request(app)
      .put('/api/projects/KHONG_TON_TAI')
      .set('Authorization', `Bearer ${TOKEN_ADMIN}`)
      .send({ name: 'Updated' });
    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// NHÓM 5: Phân quyền Users CRUD
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phan quyen Users CRUD', () => {
  it('USER-01: Ai cũng xem được danh sách users (nếu có token)', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${TOKEN_SDH}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('USER-02: Password không có trong danh sách users trả về', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${TOKEN_ADMIN}`);
    res.body.forEach((u: any) => expect(u).not.toHaveProperty('password'));
  });

  it('USER-03: Admin tạo user → 200', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${TOKEN_ADMIN}`)
      .send({ username: 'newuser', email: 'new@test.com' });
    expect(res.status).toBe(200);
  });

  it('USER-04: SDH tạo user → 403', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${TOKEN_SDH}`)
      .send({ username: 'newuser' });
    expect(res.status).toBe(403);
  });

  it('USER-05: User tự sửa thông tin của mình → 200', async () => {
    // TOKEN_SDH có id='u3', sửa /api/users/u3
    const res = await request(app)
      .put('/api/users/u3')
      .set('Authorization', `Bearer ${TOKEN_SDH}`)
      .send({ fullName: 'Ten moi' });
    expect(res.status).toBe(200);
  });

  it('USER-06: User sửa thông tin người khác → 403', async () => {
    const res = await request(app)
      .put('/api/users/u1')   // u1 là admin, SDH (u3) không có quyền
      .set('Authorization', `Bearer ${TOKEN_SDH}`)
      .send({ fullName: 'Ten moi' });
    expect(res.status).toBe(403);
  });

  it('USER-07: Admin sửa bất kỳ user → 200', async () => {
    const res = await request(app)
      .put('/api/users/u3')
      .set('Authorization', `Bearer ${TOKEN_ADMIN}`)
      .send({ fullName: 'Ten moi' });
    expect(res.status).toBe(200);
  });

  it('USER-08: Admin xóa user → 200', async () => {
    const res = await request(app)
      .delete('/api/users/u3')
      .set('Authorization', `Bearer ${TOKEN_ADMIN}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('USER-09: SDH xóa user → 403', async () => {
    const res = await request(app)
      .delete('/api/users/u4')
      .set('Authorization', `Bearer ${TOKEN_SDH}`);
    expect(res.status).toBe(403);
  });

  it('USER-10: Investor xóa user → 403', async () => {
    const res = await request(app)
      .delete('/api/users/u3')
      .set('Authorization', `Bearer ${TOKEN_INVESTOR}`);
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// NHÓM 6: Phân quyền Email Config
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phan quyen Email Config', () => {
  it('EMAIL-01: Admin xem email config → 200, password bị mask', async () => {
    const res = await request(app)
      .get('/api/email-config')
      .set('Authorization', `Bearer ${TOKEN_ADMIN}`);
    expect(res.status).toBe(200);
    expect(res.body.password).toBe('●●●●●●●●');
  });

  it('EMAIL-02: SXD xem email config → 200', async () => {
    const res = await request(app)
      .get('/api/email-config')
      .set('Authorization', `Bearer ${TOKEN_SXD}`);
    expect(res.status).toBe(200);
  });

  it('EMAIL-03: SDH xem email config → 403', async () => {
    const res = await request(app)
      .get('/api/email-config')
      .set('Authorization', `Bearer ${TOKEN_SDH}`);
    expect(res.status).toBe(403);
  });

  it('EMAIL-04: Investor xem email config → 403', async () => {
    const res = await request(app)
      .get('/api/email-config')
      .set('Authorization', `Bearer ${TOKEN_INVESTOR}`);
    expect(res.status).toBe(403);
  });

  it('EMAIL-05: Admin lưu email config → 200', async () => {
    const res = await request(app)
      .post('/api/email-config')
      .set('Authorization', `Bearer ${TOKEN_ADMIN}`)
      .send({ host: 'smtp.new.com', port: '465' });
    expect(res.status).toBe(200);
  });

  it('EMAIL-06: SDH lưu email config → 403', async () => {
    const res = await request(app)
      .post('/api/email-config')
      .set('Authorization', `Bearer ${TOKEN_SDH}`)
      .send({ host: 'smtp.new.com' });
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// NHÓM 7: Recover Password (public route)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Recover Password (public)', () => {
  it('PASS-01: Không cần token → 200', async () => {
    const res = await request(app).post('/api/users/u1/recover-password');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('PASS-02: User không tồn tại → 404', async () => {
    const res = await request(app).post('/api/users/KHONG_TON_TAI/recover-password');
    expect(res.status).toBe(404);
  });

  it('PASS-03: Gọi dbResetUserPassword với userId đúng', async () => {
    await request(app).post('/api/users/u1/recover-password');
    expect(db.dbResetUserPassword).toHaveBeenCalledWith('u1', expect.any(String));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// NHÓM 8: Phân quyền Upload Config
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phan quyen Upload Config', () => {
  it('UPLOAD-01: GET upload-config không có token → 401', async () => {
    const res = await request(app).get('/api/upload-config');
    expect(res.status).toBe(401);
  });

  it('UPLOAD-02: GET upload-config token hợp lệ (bất kỳ role) → 200', async () => {
    const res = await request(app)
      .get('/api/upload-config')
      .set('Authorization', `Bearer ${TOKEN_SDH}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('allowedExtensions');
  });

  it('UPLOAD-03: POST upload-config không có token → 401', async () => {
    const res = await request(app).post('/api/upload-config').send({});
    expect(res.status).toBe(401);
  });

  it('UPLOAD-04: Admin POST upload-config → 200', async () => {
    const res = await request(app)
      .post('/api/upload-config')
      .set('Authorization', `Bearer ${TOKEN_ADMIN}`)
      .send({ allowedExtensions: 'PDF', maxSizeMb: 10 });
    expect(res.status).toBe(200);
  });

  it('UPLOAD-05: SXD (agencyId=1) POST upload-config → 200', async () => {
    const res = await request(app)
      .post('/api/upload-config')
      .set('Authorization', `Bearer ${TOKEN_SXD}`)
      .send({ allowedExtensions: 'DOCX', maxSizeMb: 5 });
    expect(res.status).toBe(200);
  });

  it('UPLOAD-06: SDH (agencyId=2) POST upload-config → 403', async () => {
    const res = await request(app)
      .post('/api/upload-config')
      .set('Authorization', `Bearer ${TOKEN_SDH}`)
      .send({ allowedExtensions: 'PDF' });
    expect(res.status).toBe(403);
  });

  it('UPLOAD-07: Investor POST upload-config → 403', async () => {
    const res = await request(app)
      .post('/api/upload-config')
      .set('Authorization', `Bearer ${TOKEN_INVESTOR}`)
      .send({ allowedExtensions: 'PDF' });
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// NHÓM 9: Phân quyền Password Policy
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phan quyen Password Policy', () => {
  it('POLICY-01: GET password-policy không có token → 401', async () => {
    const res = await request(app).get('/api/password-policy');
    expect(res.status).toBe(401);
  });

  it('POLICY-02: GET password-policy token hợp lệ (bất kỳ role) → 200', async () => {
    const res = await request(app)
      .get('/api/password-policy')
      .set('Authorization', `Bearer ${TOKEN_SDH}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('minLength');
  });

  it('POLICY-03: POST password-policy không có token → 401', async () => {
    const res = await request(app).post('/api/password-policy').send({});
    expect(res.status).toBe(401);
  });

  it('POLICY-04: Admin POST password-policy → 200', async () => {
    const res = await request(app)
      .post('/api/password-policy')
      .set('Authorization', `Bearer ${TOKEN_ADMIN}`)
      .send({ minLength: 8, requireUppercase: true });
    expect(res.status).toBe(200);
  });

  it('POLICY-05: SXD (agencyId=1) POST password-policy → 200', async () => {
    const res = await request(app)
      .post('/api/password-policy')
      .set('Authorization', `Bearer ${TOKEN_SXD}`)
      .send({ minLength: 6 });
    expect(res.status).toBe(200);
  });

  it('POLICY-06: SDH POST password-policy → 403', async () => {
    const res = await request(app)
      .post('/api/password-policy')
      .set('Authorization', `Bearer ${TOKEN_SDH}`)
      .send({ minLength: 8 });
    expect(res.status).toBe(403);
  });

  it('POLICY-07: Investor POST password-policy → 403', async () => {
    const res = await request(app)
      .post('/api/password-policy')
      .set('Authorization', `Bearer ${TOKEN_INVESTOR}`)
      .send({ minLength: 8 });
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// NHÓM 10: Change Password (xác thực bắt buộc)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Change Password - phan quyen', () => {
  it('CHPWD-01: không có token → 401', async () => {
    const res = await request(app).post('/api/profile/change-password')
      .send({ oldPassword: '123456', newPassword: 'newpass123' });
    expect(res.status).toBe(401);
  });

  it('CHPWD-02: token sai/hết hạn → 403', async () => {
    const res = await request(app).post('/api/profile/change-password')
      .set('Authorization', 'Bearer invalid.token.here')
      .send({ oldPassword: '123456', newPassword: 'newpass123' });
    expect(res.status).toBe(403);
  });

  it('CHPWD-03: Admin có token hợp lệ + body đủ → 200', async () => {
    const res = await request(app).post('/api/profile/change-password')
      .set('Authorization', `Bearer ${TOKEN_ADMIN}`)
      .send({ oldPassword: '123456', newPassword: 'newpass123' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('CHPWD-04: SXD có token hợp lệ → 200', async () => {
    const res = await request(app).post('/api/profile/change-password')
      .set('Authorization', `Bearer ${TOKEN_SXD}`)
      .send({ oldPassword: '123456', newPassword: 'newpass123' });
    expect(res.status).toBe(200);
  });

  it('CHPWD-05: SDH (non-admin) có thể đổi mật khẩu của mình → 200', async () => {
    const res = await request(app).post('/api/profile/change-password')
      .set('Authorization', `Bearer ${TOKEN_SDH}`)
      .send({ oldPassword: '123456', newPassword: 'newpass123' });
    expect(res.status).toBe(200);
  });

  it('CHPWD-06: Investor có thể đổi mật khẩu của mình → 200', async () => {
    const res = await request(app).post('/api/profile/change-password')
      .set('Authorization', `Bearer ${TOKEN_INVESTOR}`)
      .send({ oldPassword: '123456', newPassword: 'newpass123' });
    expect(res.status).toBe(200);
  });

  it('CHPWD-07: token hợp lệ nhưng thiếu body → 400', async () => {
    const res = await request(app).post('/api/profile/change-password')
      .set('Authorization', `Bearer ${TOKEN_ADMIN}`)
      .send({});
    expect(res.status).toBe(400);
  });
});
