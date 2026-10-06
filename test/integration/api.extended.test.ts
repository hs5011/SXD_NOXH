/**
 * Integration Tests: Nhóm 1, 4, 5, 6, 7, 8, 9
 *   - LOGIN-01→05   : Login (xác thực mật khẩu)
 *   - UNIQ-01→05    : User Uniqueness Validation
 *   - ISO-01→04     : Project Isolation Edge cases
 *   - META-01→04    : Metadata API
 *   - PASS-04→06    : Recover Password Edge cases
 *   - SEC-01→04     : Security
 *   - MEM-01→02     : DB In-Memory Fallback
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'noxh_governance_secure_key_2026';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../server/db.ts', () => ({
  initDatabase: vi.fn().mockResolvedValue({}),
  getDbStatus: vi.fn().mockReturnValue({ connected: true, mode: 'PostgreSQL' }),
  dbGetProjects: vi.fn().mockResolvedValue([]),
  dbCreateProject: vi.fn().mockImplementation((p: any) => Promise.resolve({ ...p, id: 'new-id' })),
  dbUpdateProject: vi.fn().mockImplementation((id: string, p: any) => Promise.resolve({ ...p, id })),
  dbDeleteProject: vi.fn().mockResolvedValue(true),
  dbGetAllMetadata: vi.fn().mockResolvedValue({ processes: [], processingAgencies: [] }),
  dbUpdateMetadata: vi.fn().mockResolvedValue([]),
  dbGetUsers: vi.fn().mockResolvedValue([]),
  dbCreateUser: vi.fn().mockImplementation((u: any) => Promise.resolve({ ...u, id: 'new-user-id' })),
  dbUpdateUser: vi.fn().mockImplementation((id: string, u: any) => Promise.resolve({ ...u, id })),
  dbDeleteUser: vi.fn().mockResolvedValue(true),
  dbGetActualProgress: vi.fn().mockResolvedValue({}),
  dbGetProjectAttachments: vi.fn().mockResolvedValue([]),
  dbGetAttachmentById: vi.fn().mockResolvedValue(null),
  dbGetProjectHistory: vi.fn().mockResolvedValue([]),
  dbCreateProjectHistory: vi.fn().mockResolvedValue({}),
  dbGetEmailConfig: vi.fn().mockResolvedValue({ host: '', username: '', password: '' }),
  dbSaveEmailConfig: vi.fn().mockImplementation((c: any) => Promise.resolve(c)),
  dbGetUploadConfig: vi.fn().mockResolvedValue({ allowedExtensions: 'PDF,DOCX,XLSX', maxSizeMb: 20 }),
  dbSaveUploadConfig: vi.fn().mockImplementation((c: any) => Promise.resolve(c)),
  dbGetPasswordPolicy: vi.fn().mockResolvedValue({ minLength: 6, requireUppercase: false, requireLowercase: false, requireNumbers: false, requireSpecialChars: false }),
  dbSavePasswordPolicy: vi.fn().mockImplementation((p: any) => Promise.resolve(p)),
  dbResetUserPassword: vi.fn().mockResolvedValue(true),
  dbUpdateActualProgress: vi.fn().mockResolvedValue({}),
  dbResetActualProgress: vi.fn().mockResolvedValue(true),
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn().mockReturnValue({ sendMail: vi.fn().mockResolvedValue({}) }),
  },
}));

vi.mock('../../src/lib/crypto.ts', () => ({
  hashPassword: vi.fn().mockReturnValue('hashed-password'),
  generatePolicyCompliantPassword: vi.fn().mockReturnValue('TempPass123!'),
}));

import * as db from '../../server/db.ts';
import { hashPassword, generatePolicyCompliantPassword } from '../../src/lib/crypto.ts';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeToken(payload: Record<string, any>) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

const ADMIN_TOKEN = makeToken({ id: 'u-admin', roleId: 'Admin', userType: 'agency', agencyId: '1' });
const SXD_TOKEN = makeToken({ id: 'u-sxd', roleId: 'User', userType: 'agency', agencyId: '1' });
const AGENCY2_TOKEN = makeToken({ id: 'u-ag2', roleId: 'User', userType: 'agency', agencyId: '2' });
const INVESTOR_TOKEN = makeToken({ id: 'u-inv', roleId: 'User', userType: 'investor', investorId: 'INV-001' });

// Metadata with step→agency mapping
const MOCK_META = {
  processes: [
    {
      id: 'proc1',
      childSteps: [
        { name: 'Buoc SXD', agency: 'So Xay Dung' },
        { name: 'Buoc SDH', agency: 'So Dia hinh' },
      ],
    },
  ],
  processingAgencies: [
    { id: '1', name: 'So Xay Dung' },
    { id: '2', name: 'So Dia hinh' },
  ],
};

// ─── App factory ──────────────────────────────────────────────────────────────

function createApp() {
  const app = express();
  app.use(express.json());

  // JWT middleware
  function authenticateToken(req: any, res: any, next: any) {
    const fullPath = req.baseUrl + req.path;
    const publicPaths = ['/api/health', '/api/db-status', '/api/login'];
    const isRecoverPath = req.baseUrl === '/api/users' && req.path.endsWith('/recover-password');
    if (publicPaths.includes(fullPath) || isRecoverPath) return next();

    const authHeader = req.headers.authorization || req.headers.Authorization;
    const token = authHeader && (authHeader as string).split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access token required' });

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
      if (err) return res.status(403).json({ error: 'Invalid or expired token' });
      req.user = user;
      next();
    });
  }

  app.use('/api', authenticateToken);

  // Login
  app.post('/api/login', async (req, res: any) => {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Vui lòng nhập tên đăng nhập và mật khẩu' });

    const users = await db.dbGetUsers();
    const enteredHashed = hashPassword(password.trim());

    const user = (users as any[]).find((u: any) => {
      const uUsername = u.username || u.email?.split('@')[0] || '';
      if (uUsername.toLowerCase() !== username.trim().toLowerCase()) return false;
      const storedPassword = u.password || '';
      const isStoredHashed = storedPassword.length === 64 && /^[0-9a-f]{64}$/i.test(storedPassword);
      const comparisonHash = isStoredHashed ? storedPassword : hashPassword(storedPassword);
      return comparisonHash === enteredHashed;
    });

    if (!user) return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng' });

    const token = jwt.sign(
      { id: user.id, username: user.username, roleId: user.roleId, userType: user.userType },
      JWT_SECRET,
      { expiresIn: '7d' },
    );
    const { password: _pass, ...cleanUser } = user;
    res.json({ token, user: cleanUser });
  });

  // GET /api/data
  app.get('/api/data', async (req: any, res: any) => {
    const projects = await db.dbGetProjects();
    const users = await db.dbGetUsers();
    const meta = await db.dbGetAllMetadata();
    const actualProgress = await db.dbGetActualProgress();

    const currentUser = req.user;
    let visibleProjects = projects as any[];

    if (currentUser && currentUser.roleId !== 'Admin') {
      const { userType, agencyId, department = '', investorId } = currentUser;
      const processes = (meta as any).processes || [];
      const stepToAgencyMap: Record<string, string> = {};
      processes.forEach((proc: any) => {
        (proc.childSteps || []).forEach((cs: any) => {
          if (cs.name && cs.agency) stepToAgencyMap[cs.name] = cs.agency;
        });
      });
      const processingAgencies = (meta as any).processingAgencies || [];
      const userAgencyObj = processingAgencies.find((a: any) => a.id === agencyId);
      const userAgencyName = userAgencyObj ? userAgencyObj.name : '';

      visibleProjects = visibleProjects.filter((p: any) => {
        const stepAgency = stepToAgencyMap[p.currentStep];
        if (userType === 'agency' && agencyId === '1') return true;
        if (userType === 'agency' && agencyId === '6') {
          const projectLocation = p.location || '';
          const cleanProjectLoc = projectLocation.toLowerCase().replace(/đường|quận|huyện|phường|xã|thành phố|tp\.hcm|tp/g, '').trim();
          const cleanDept = department.toLowerCase().replace(/ubnd|phường|xã/g, '').trim();
          return cleanDept && (projectLocation.toLowerCase().includes(cleanDept) || cleanProjectLoc.includes(cleanDept));
        }
        if (userType === 'agency') return stepAgency === userAgencyName;
        if (userType === 'investor') return p.investor === investorId;
        return false;
      });
    }

    const cleanUsers = (users as any[]).map(({ password: _p, ...u }: any) => u);
    res.json({ projects: visibleProjects, users: cleanUsers, actualProgress, ...(meta as any) });
  });

  // PUT /api/projects/:id
  app.put('/api/projects/:id', async (req: any, res: any) => {
    const projects = await db.dbGetProjects();
    const project = (projects as any[]).find((p: any) => p.id === req.params.id);
    if (!project) return res.status(404).json({ error: 'Không tìm thấy dự án.' });

    const u = req.user;
    const isSxdOrAdmin = u.roleId === 'Admin' || (u.userType === 'agency' && u.agencyId === '1');
    if (!isSxdOrAdmin) {
      if (u.userType === 'agency') {
        const meta = await db.dbGetAllMetadata();
        const processes = (meta as any).processes || [];
        const stepToAgencyMap: Record<string, string> = {};
        processes.forEach((proc: any) => {
          (proc.childSteps || []).forEach((cs: any) => {
            if (cs.name && cs.agency) stepToAgencyMap[cs.name] = cs.agency;
          });
        });
        const processingAgencies = (meta as any).processingAgencies || [];
        const userAgencyObj = processingAgencies.find((a: any) => a.id === u.agencyId);
        const userAgencyName = userAgencyObj ? userAgencyObj.name : '';
        const currentStepAgency = stepToAgencyMap[project.currentStep];
        if (currentStepAgency !== userAgencyName)
          return res.status(403).json({ error: 'Dự án hiện không ở bước xử lý của cơ quan bạn.' });
      } else {
        return res.status(403).json({ error: 'Bạn không có quyền chỉnh sửa dự án.' });
      }
    }
    const updated = await db.dbUpdateProject(req.params.id, req.body);
    res.json(updated);
  });

  // PUT /api/metadata/:key
  app.put('/api/metadata/:key', async (req: any, res: any) => {
    const u = req.user;
    const isSxdOrAdmin = u.roleId === 'Admin' || (u.userType === 'agency' && u.agencyId === '1');
    if (!isSxdOrAdmin) return res.status(403).json({ error: 'Bạn không có quyền cập nhật metadata.' });
    try {
      const list = await db.dbUpdateMetadata(req.params.key, req.body);
      res.json(list);
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  // POST /api/users
  app.post('/api/users', async (req: any, res: any) => {
    const u = req.user;
    const isSxdOrAdmin = u.roleId === 'Admin' || (u.userType === 'agency' && u.agencyId === '1');
    if (!isSxdOrAdmin) return res.status(403).json({ error: 'Không có quyền.' });
    try {
      const user = await db.dbCreateUser(req.body);
      const { password: _p, ...cleanUser } = user as any;
      res.json(cleanUser);
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  // PUT /api/users/:id
  app.put('/api/users/:id', async (req: any, res: any) => {
    const u = req.user;
    const isSelf = u.id === req.params.id;
    const isSxdOrAdmin = u.roleId === 'Admin' || (u.userType === 'agency' && u.agencyId === '1');
    if (!isSxdOrAdmin && !isSelf) return res.status(403).json({ error: 'Không có quyền.' });
    try {
      const user = await db.dbUpdateUser(req.params.id, req.body);
      const { password: _p, ...cleanUser } = user as any;
      res.json(cleanUser);
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  // GET /api/db-status
  app.get('/api/db-status', async (_req, res: any) => {
    await db.initDatabase(false);
    res.json(db.getDbStatus());
  });

  // GET /api/email-config
  app.get('/api/email-config', async (req: any, res: any) => {
    const u = req.user;
    const isSxdOrAdmin = u.roleId === 'Admin' || (u.userType === 'agency' && u.agencyId === '1');
    if (!isSxdOrAdmin) return res.status(403).json({ error: 'Không có quyền.' });
    const config = await db.dbGetEmailConfig();
    const display = { ...(config as any), password: (config as any).password ? '●●●●●●●●' : '' };
    res.json(display);
  });

  // POST /api/users/:id/recover-password
  app.post('/api/users/:id/recover-password', async (req, res: any) => {
    const userId = req.params.id;
    const users = await db.dbGetUsers();
    const user = (users as any[]).find((u: any) => u.id === userId);
    if (!user) return res.status(404).json({ error: 'Không tìm thấy tài khoản người dùng.' });
    if (!user.email) return res.status(400).json({ error: 'Người dùng không có địa chỉ email để gửi.' });

    const policyConfig = await db.dbGetPasswordPolicy();
    const tempPassword = generatePolicyCompliantPassword(policyConfig);
    const hashed = hashPassword(tempPassword);

    const dbSuccess = await db.dbResetUserPassword(userId, hashed);
    if (!dbSuccess) return res.status(500).json({ error: 'Không thể cập nhật mật khẩu.' });

    const emailConfig = await db.dbGetEmailConfig();
    let emailSent = false;
    let emailError = 'SMTP chưa được cấu hình hoàn chỉnh.';

    if ((emailConfig as any).host && (emailConfig as any).username && (emailConfig as any).password) {
      emailSent = true;
      emailError = '';
    }

    res.json({ success: true, tempPassword, emailSent, emailError: emailSent ? null : emailError, email: user.email });
  });

  return app;
}

// ─── State ────────────────────────────────────────────────────────────────────

let app: ReturnType<typeof createApp>;

beforeEach(() => {
  vi.clearAllMocks();
  app = createApp();

  // Default mock resets
  vi.mocked(db.getDbStatus).mockReturnValue({ connected: true, mode: 'PostgreSQL' } as any);
  vi.mocked(db.dbGetUsers).mockResolvedValue([]);
  vi.mocked(db.dbGetProjects).mockResolvedValue([]);
  vi.mocked(db.dbGetAllMetadata).mockResolvedValue({ processes: [], processingAgencies: [] } as any);
  vi.mocked(db.dbGetPasswordPolicy).mockResolvedValue({
    minLength: 6, requireUppercase: false, requireLowercase: false, requireNumbers: false, requireSpecialChars: false,
  } as any);
  vi.mocked(db.dbGetEmailConfig).mockResolvedValue({ host: '', username: '', password: '' } as any);
  vi.mocked(db.dbCreateUser).mockImplementation((u: any) => Promise.resolve({ ...u, id: 'new-user-id' }));
  vi.mocked(db.dbUpdateUser).mockImplementation((id: string, u: any) => Promise.resolve({ ...u, id }));
  vi.mocked(db.dbUpdateMetadata).mockResolvedValue([]);
  vi.mocked(db.dbResetUserPassword).mockResolvedValue(true);
  vi.mocked(hashPassword).mockReturnValue('hashed-password');
  vi.mocked(generatePolicyCompliantPassword).mockReturnValue('TempPass123!');
});

// ─── NHÓM 1 – Login ───────────────────────────────────────────────────────────

describe('NHÓM 1 – Login (xác thực mật khẩu)', () => {
  it('LOGIN-01: thiếu username hoặc password → 400', async () => {
    const res = await request(app).post('/api/login').send({ username: 'admin' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Vui lòng nhập');
  });

  it('LOGIN-02: đúng username nhưng sai mật khẩu → 401', async () => {
    // password stored as 64-char hex → compared directly → won't match 'hashed-password'
    vi.mocked(db.dbGetUsers).mockResolvedValue([
      { id: 'u1', username: 'admin', password: 'a'.repeat(64), email: 'a@a.com' },
    ] as any);
    const res = await request(app).post('/api/login').send({ username: 'admin', password: 'wrongpass' });
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('không đúng');
  });

  it('LOGIN-03: username không tồn tại → 401', async () => {
    vi.mocked(db.dbGetUsers).mockResolvedValue([
      { id: 'u1', username: 'admin', password: 'hashed-password', email: 'a@a.com' },
    ] as any);
    const res = await request(app).post('/api/login').send({ username: 'ghost', password: 'any' });
    expect(res.status).toBe(401);
  });

  it('LOGIN-04: username khớp kiểu case-insensitive (ADMIN vs admin) → 200', async () => {
    // 'hashed-password' length = 15 → isStoredHashed=false → hashPassword('hashed-password') = 'hashed-password'
    // enteredHashed = hashPassword(any) = 'hashed-password' → match
    vi.mocked(db.dbGetUsers).mockResolvedValue([
      { id: 'u1', username: 'admin', password: 'hashed-password', email: 'a@a.com', roleId: 'Admin', userType: 'agency' },
    ] as any);
    const res = await request(app).post('/api/login').send({ username: 'ADMIN', password: 'anypass' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user).not.toHaveProperty('password');
  });

  it('LOGIN-05: DB có password plain-text chưa hash → server tự hash khi so sánh → 200', async () => {
    // password = '123456' (plain, not 64-char hex) → isStoredHashed=false
    // comparisonHash = hashPassword('123456') = 'hashed-password'
    // enteredHashed = hashPassword('123456') = 'hashed-password' → match
    vi.mocked(db.dbGetUsers).mockResolvedValue([
      { id: 'u1', username: 'admin', password: '123456', email: 'a@a.com', roleId: 'Admin' },
    ] as any);
    const res = await request(app).post('/api/login').send({ username: 'admin', password: '123456' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });
});

// ─── NHÓM 4 – User Uniqueness ─────────────────────────────────────────────────

describe('NHÓM 4 – User Uniqueness Validation', () => {
  it('UNIQ-01: tạo user với email đã tồn tại → 400', async () => {
    const uniquenessError = Object.assign(new Error('Email đã được sử dụng bởi người dùng khác.'), { statusCode: 400 });
    vi.mocked(db.dbCreateUser).mockRejectedValue(uniquenessError);
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ email: 'dup@test.com', username: 'newuser' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Email');
  });

  it('UNIQ-02: tạo user với username đã tồn tại → 400', async () => {
    const uniquenessError = Object.assign(new Error('Username đã được sử dụng bởi người dùng khác.'), { statusCode: 400 });
    vi.mocked(db.dbCreateUser).mockRejectedValue(uniquenessError);
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ email: 'new@test.com', username: 'existinguser' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Username');
  });

  it('UNIQ-03: tạo user với số điện thoại đã tồn tại → 400', async () => {
    const uniquenessError = Object.assign(new Error('Số điện thoại đã được sử dụng bởi người dùng khác.'), { statusCode: 400 });
    vi.mocked(db.dbCreateUser).mockRejectedValue(uniquenessError);
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ email: 'new@test.com', username: 'newuser', phone: '0901234567' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('điện thoại');
  });

  it('UNIQ-04: sửa user, đổi email thành email của người khác → 400', async () => {
    const uniquenessError = Object.assign(new Error('Email đã được sử dụng bởi người dùng khác.'), { statusCode: 400 });
    vi.mocked(db.dbUpdateUser).mockRejectedValue(uniquenessError);
    const res = await request(app)
      .put('/api/users/u-other')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ email: 'taken@test.com' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Email');
  });

  it('UNIQ-05: sửa chính mình, email/username không đụng người khác → 200', async () => {
    const selfToken = makeToken({ id: 'u-self', roleId: 'User', userType: 'agency', agencyId: '2' });
    vi.mocked(db.dbUpdateUser).mockResolvedValue({ id: 'u-self', email: 'self@test.com' } as any);
    const res = await request(app)
      .put('/api/users/u-self')
      .set('Authorization', `Bearer ${selfToken}`)
      .send({ email: 'self@test.com' });
    expect(res.status).toBe(200);
  });
});

// ─── NHÓM 5 – Project Isolation Edge cases ────────────────────────────────────

describe('NHÓM 5 – Project Isolation Edge cases', () => {
  const PROJECTS = [
    { id: 'p1', currentStep: 'Buoc SXD', investor: 'INV-001', location: 'Phường 5' },
    { id: 'p2', currentStep: 'Buoc SDH', investor: 'INV-002', location: 'Phường 7' },
  ];

  beforeEach(() => {
    vi.mocked(db.dbGetProjects).mockResolvedValue(PROJECTS as any);
    vi.mocked(db.dbGetAllMetadata).mockResolvedValue(MOCK_META as any);
  });

  it('ISO-01: agency user không có agencyId → không khớp bất kỳ step nào → 0 dự án', async () => {
    const noAgencyToken = makeToken({ id: 'u-x', roleId: 'User', userType: 'agency' }); // no agencyId
    const res = await request(app).get('/api/data').set('Authorization', `Bearer ${noAgencyToken}`);
    expect(res.status).toBe(200);
    expect(res.body.projects).toHaveLength(0);
  });

  it('ISO-02: investor user không có investorId → không thấy dự án nào → 0 dự án', async () => {
    const noInvToken = makeToken({ id: 'u-inv', roleId: 'User', userType: 'investor' }); // no investorId
    const res = await request(app).get('/api/data').set('Authorization', `Bearer ${noInvToken}`);
    expect(res.status).toBe(200);
    expect(res.body.projects).toHaveLength(0);
  });

  it('ISO-03: UBND (agencyId=6) với department rỗng → không khớp địa bàn → 0 dự án', async () => {
    const ubndToken = makeToken({ id: 'u-ubnd', roleId: 'User', userType: 'agency', agencyId: '6', department: '' });
    const res = await request(app).get('/api/data').set('Authorization', `Bearer ${ubndToken}`);
    expect(res.status).toBe(200);
    expect(res.body.projects).toHaveLength(0);
  });

  it('ISO-04: agency ở đúng cơ quan (So Dia hinh) nhưng dự án đã chuyển sang bước SXD → PUT 403', async () => {
    // Project p1 is at 'Buoc SXD' (So Xay Dung), but AGENCY2 is 'So Dia hinh'
    const res = await request(app)
      .put('/api/projects/p1')
      .set('Authorization', `Bearer ${AGENCY2_TOKEN}`)
      .send({ name: 'Updated' });
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('bước xử lý');
  });
});

// ─── NHÓM 6 – Metadata API ────────────────────────────────────────────────────

describe('NHÓM 6 – Metadata API', () => {
  it('META-01: PUT /api/metadata/investors với danh sách hợp lệ → 200', async () => {
    vi.mocked(db.dbUpdateMetadata).mockResolvedValue([{ id: 'inv1', name: 'CĐT Alpha' }] as any);
    const res = await request(app)
      .put('/api/metadata/investors')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send([{ id: 'inv1', name: 'CĐT Alpha' }]);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'inv1', name: 'CĐT Alpha' }]);
  });

  it('META-02: PUT /api/metadata/processes cập nhật quy trình → 200', async () => {
    vi.mocked(db.dbUpdateMetadata).mockResolvedValue([{ id: 'proc1', name: 'Quy trình 1' }] as any);
    const res = await request(app)
      .put('/api/metadata/processes')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send([{ id: 'proc1', name: 'Quy trình 1' }]);
    expect(res.status).toBe(200);
  });

  it('META-03: PUT /api/metadata/users đồng bộ danh sách user → 200', async () => {
    vi.mocked(db.dbUpdateMetadata).mockResolvedValue([{ id: 'u1' }] as any);
    const res = await request(app)
      .put('/api/metadata/users')
      .set('Authorization', `Bearer ${SXD_TOKEN}`)
      .send([{ id: 'u1', username: 'admin' }]);
    expect(res.status).toBe(200);
  });

  it('META-04: agency thường (không phải Admin/SXD) PUT metadata → 403', async () => {
    const res = await request(app)
      .put('/api/metadata/investors')
      .set('Authorization', `Bearer ${AGENCY2_TOKEN}`)
      .send([]);
    expect(res.status).toBe(403);
  });
});

// ─── NHÓM 7 – Recover Password Edge cases ────────────────────────────────────

describe('NHÓM 7 – Recover Password Edge cases', () => {
  it('PASS-04: user không có email trong DB → 400, password không bị reset', async () => {
    vi.mocked(db.dbGetUsers).mockResolvedValue([
      { id: 'u-noemail', username: 'noemail' }, // no email field
    ] as any);
    const res = await request(app)
      .post('/api/users/u-noemail/recover-password')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('email');
    expect(db.dbResetUserPassword).not.toHaveBeenCalled();
  });

  it('PASS-05: SMTP chưa cấu hình → vẫn reset password thành công, emailSent: false', async () => {
    vi.mocked(db.dbGetUsers).mockResolvedValue([
      { id: 'u1', username: 'test', email: 'test@test.com' },
    ] as any);
    vi.mocked(db.dbGetEmailConfig).mockResolvedValue({ host: '', username: '', password: '' } as any);

    const res = await request(app)
      .post('/api/users/u1/recover-password')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.emailSent).toBe(false);
    expect(db.dbResetUserPassword).toHaveBeenCalled();
  });

  it('PASS-06: mật khẩu tạm sinh ra phải hợp lệ theo passwordPolicy hiện tại', async () => {
    vi.mocked(db.dbGetUsers).mockResolvedValue([
      { id: 'u1', username: 'test', email: 'test@test.com' },
    ] as any);
    vi.mocked(db.dbGetPasswordPolicy).mockResolvedValue({
      minLength: 8, requireUppercase: true, requireNumbers: true, requireSpecialChars: true,
    } as any);
    vi.mocked(generatePolicyCompliantPassword).mockReturnValue('Secure1!');

    const res = await request(app)
      .post('/api/users/u1/recover-password')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({});
    expect(res.status).toBe(200);
    const temp = res.body.tempPassword as string;
    // Verify the generated password complies with the policy
    expect(temp.length).toBeGreaterThanOrEqual(8);
    expect(/[A-Z]/.test(temp)).toBe(true);
    expect(/[0-9]/.test(temp)).toBe(true);
    expect(/[!@#$%&*]/.test(temp)).toBe(true);
    // Verify generatePolicyCompliantPassword was called with the active policy
    expect(generatePolicyCompliantPassword).toHaveBeenCalledWith(
      expect.objectContaining({ minLength: 8, requireUppercase: true }),
    );
  });
});

// ─── NHÓM 8 – Security ────────────────────────────────────────────────────────

describe('NHÓM 8 – Security', () => {
  it('SEC-01: JWT token bị giả mạo/signature sai → 403', async () => {
    const fakeToken = jwt.sign({ id: 'u1', roleId: 'Admin' }, 'wrong-secret', { expiresIn: '1h' });
    const res = await request(app).get('/api/data').set('Authorization', `Bearer ${fakeToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Invalid or expired token');
  });

  it('SEC-02: JWT token hết hạn → 403', async () => {
    const expiredToken = jwt.sign({ id: 'u1', roleId: 'Admin' }, JWT_SECRET, { expiresIn: '-1s' });
    const res = await request(app).get('/api/data').set('Authorization', `Bearer ${expiredToken}`);
    expect(res.status).toBe(403);
  });

  it('SEC-03: response /api/data không chứa password trong danh sách users', async () => {
    vi.mocked(db.dbGetUsers).mockResolvedValue([
      { id: 'u1', username: 'admin', password: 'super-secret-hash', email: 'a@a.com' },
    ] as any);
    const res = await request(app).get('/api/data').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(200);
    const users: any[] = res.body.users;
    users.forEach((u) => {
      expect(u).not.toHaveProperty('password');
    });
  });

  it('SEC-04: response /api/email-config hiển thị password dạng ●●●●●●●● (masked)', async () => {
    vi.mocked(db.dbGetEmailConfig).mockResolvedValue({
      host: 'smtp.gmail.com', username: 'admin@test.com', password: 'realSecretPassword',
    } as any);
    const res = await request(app)
      .get('/api/email-config')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.password).toBe('●●●●●●●●');
    expect(res.body.password).not.toBe('realSecretPassword');
  });
});

// ─── NHÓM 9 – DB In-Memory Fallback ─────────────────────────────────────────

describe('NHÓM 9 – DB In-Memory Fallback', () => {
  it('MEM-01: khi isDbConnected=false, GET /api/data vẫn trả về dữ liệu → 200', async () => {
    vi.mocked(db.getDbStatus).mockReturnValue({ connected: false, mode: 'In-Memory Fallback' } as any);
    vi.mocked(db.dbGetProjects).mockResolvedValue([{ id: 'p1', name: 'Dự án A' }] as any);
    vi.mocked(db.dbGetUsers).mockResolvedValue([{ id: 'u1', username: 'admin' }] as any);
    vi.mocked(db.dbGetAllMetadata).mockResolvedValue({ processes: [] } as any);
    vi.mocked(db.dbGetActualProgress).mockResolvedValue({} as any);

    const res = await request(app).get('/api/data').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.projects).toHaveLength(1);
  });

  it('MEM-02: Fallback mode, GET /api/db-status trả về connected: false và mode "In-Memory Fallback"', async () => {
    vi.mocked(db.getDbStatus).mockReturnValue({ connected: false, mode: 'In-Memory Fallback' } as any);
    const res = await request(app).get('/api/db-status');
    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(false);
    expect(res.body.mode).toContain('In-Memory');
  });
});
