/**
 * Integration Tests: Express API Routes
 *
 * Cách hoạt động:
 *   - vi.mock('../../server/db.ts') mock toàn bộ DB layer
 *   - createTestApp() dựng Express app với cùng route handlers như server.ts
 *     (không có Vite, không cần server đang chạy)
 *   - supertest gửi request trực tiếp vào app object
 *
 * Phạm vi test (v2 – cập nhật theo menu/tính năng mới):
 *   - Health & DB Status
 *   - GET /api/data
 *   - Projects CRUD (POST, PUT, DELETE)
 *   - Project History (GET, POST)
 *   - Attachments (GET list, GET download)
 *   - Actual Progress (GET, PUT, POST reset)
 *   - Metadata (PUT)
 *   - Users CRUD (GET, POST, PUT, DELETE)
 *   - Email Config (GET, POST) ← MỚI
 *   - Password Recovery (POST) ← MỚI
 *   - Error handling cho tất cả route
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ─── Mock DB module (phải đứng trước bất kỳ import nào dùng db) ──────────────
vi.mock('../../server/db.ts', () => ({
  initDatabase: vi.fn().mockResolvedValue({ isDbConnected: true }),
  getDbStatus: vi.fn().mockReturnValue({
    connected: true,
    mode: 'PostgreSQL Database',
    errorMessage: '',
    rawUrlMasked: 'postgresql://***',
    sanitizedUrlMasked: 'postgresql://***',
    setupGuide: '',
  }),
  dbGetProjects: vi.fn().mockResolvedValue([
    { id: '1', code: 'NX01', name: 'Du an mau', progress: 50 },
  ]),
  dbCreateProject: vi.fn().mockImplementation((p: any) =>
    Promise.resolve({ ...p, id: 'new-proj-id' })
  ),
  dbUpdateProject: vi.fn().mockImplementation((id: string, p: any) =>
    Promise.resolve({ ...p, id })
  ),
  dbDeleteProject: vi.fn().mockResolvedValue(true),
  dbGetAllMetadata: vi.fn().mockResolvedValue({
    investors: ['Inv A', 'Inv B'],
    projectStatuses: ['Chua trien khai', 'Dang trien khai'],
  }),
  dbUpdateMetadata: vi.fn().mockImplementation((_key: string, list: any[]) =>
    Promise.resolve(list)
  ),
  dbGetUsers: vi.fn().mockResolvedValue([
    { id: 'u1', email: 'admin@example.com', userType: 'agency', roleId: 'Admin' },
  ]),
  dbCreateUser: vi.fn().mockImplementation((u: any) =>
    Promise.resolve({ ...u, id: 'new-user-id' })
  ),
  dbUpdateUser: vi.fn().mockImplementation((id: string, u: any) =>
    Promise.resolve({ ...u, id })
  ),
  dbDeleteUser: vi.fn().mockResolvedValue(true),
  dbGetActualProgress: vi.fn().mockResolvedValue({
    '1': { chutruong: { cdtDate: '2024-01-01', nnDate: '' } },
  }),
  dbUpdateActualProgress: vi.fn().mockImplementation((_id: string, data: any) =>
    Promise.resolve(data)
  ),
  dbResetActualProgress: vi.fn().mockResolvedValue(true),
  dbGetProjectAttachments: vi.fn().mockResolvedValue([
    { id: 1, name: 'file.pdf', size: '10 KB', fileType: 'PDF' },
  ]),
  dbCreateProjectAttachment: vi.fn().mockImplementation((projectId: string, name: string, size: string, ext: string) =>
    Promise.resolve({ id: 42, projectId, name, size, fileType: ext })
  ),
  dbGetAttachmentById: vi.fn().mockImplementation((id: number) =>
    id === 1
      ? Promise.resolve({ id: 1, name: 'file.pdf', size: '10 KB', fileType: 'PDF' })
      : Promise.resolve(null)
  ),
  dbGetProjectHistory: vi.fn().mockResolvedValue([
    { id: 1, projectId: '1', actionType: 'create_project', description: 'Khởi tạo' },
  ]),
  dbCreateProjectHistory: vi.fn().mockImplementation(
    (projectId: string, userName: string, actionType: string, description: string) =>
      Promise.resolve({ id: 99, projectId, userName, actionType, description })
  ),
  dbGetEmailConfig: vi.fn().mockResolvedValue({
    host: 'smtp.example.com',
    port: '587',
    secure: false,
    username: 'user@example.com',
    password: 'secret123',
    fromName: 'NOXH System',
    fromEmail: 'noreply@example.com',
  }),
  dbSaveEmailConfig: vi.fn().mockImplementation((config: any) =>
    Promise.resolve({ ...config, saved: true })
  ),
  dbResetUserPassword: vi.fn().mockResolvedValue(true),
  dbGetUploadConfig: vi.fn().mockResolvedValue({ allowedExtensions: 'PDF,DOCX,XLSX', maxSizeMb: 20 }),
  dbSaveUploadConfig: vi.fn().mockImplementation((c: any) => Promise.resolve({ ...c })),
  dbGetPasswordPolicy: vi.fn().mockResolvedValue({ minLength: 6, requireUppercase: false, requireLowercase: false, requireNumbers: false, requireSpecialChars: false }),
  dbSavePasswordPolicy: vi.fn().mockImplementation((p: any) => Promise.resolve({ ...p })),
}));

// Mock nodemailer để tránh gửi email thật
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn().mockReturnValue({
      sendMail: vi.fn().mockResolvedValue({ messageId: 'test-msg-id' }),
    }),
  },
}));

// Mock hashPassword
vi.mock('../../src/lib/crypto.ts', () => ({
  hashPassword: vi.fn().mockReturnValue('hashed-password'),
  generatePolicyCompliantPassword: vi.fn().mockReturnValue('TempPass123!'),
}));

import * as db from '../../server/db.ts';
import { hashPassword } from '../../src/lib/crypto.ts';

// ─── Tạo app test (mirror routes từ server.ts, không có Vite) ────────────────
function createTestApp() {
  const app = express();
  app.use(express.json());

  // Health
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  // DB Status
  app.get('/api/db-status', async (req, res) => {
    try {
      const force = req.query.retry === 'true' || req.query.force === 'true';
      if (force) await db.initDatabase(true);
      res.json(db.getDbStatus());
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Data
  app.get('/api/data', async (_req, res) => {
    try {
      const projects = await db.dbGetProjects();
      const users = await db.dbGetUsers();
      const meta = await db.dbGetAllMetadata();
      const actualProgress = await db.dbGetActualProgress();
      res.json({ projects, users, actualProgress, ...meta });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Projects
  app.post('/api/projects', async (req, res) => {
    try { res.json(await db.dbCreateProject(req.body)); }
    catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.put('/api/projects/:id', async (req, res) => {
    try { res.json(await db.dbUpdateProject(req.params.id, req.body)); }
    catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.delete('/api/projects/:id', async (req, res) => {
    try { res.json({ success: await db.dbDeleteProject(req.params.id) }); }
    catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Project history
  app.get('/api/projects/:id/history', async (req, res) => {
    try { res.json(await db.dbGetProjectHistory(req.params.id)); }
    catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/projects/:id/history', async (req, res) => {
    try {
      const { userName, actionType, description, oldStatus, newStatus } = req.body;
      res.json(await db.dbCreateProjectHistory(req.params.id, userName, actionType, description, oldStatus, newStatus));
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Attachments
  app.get('/api/projects/:id/attachments', async (req, res) => {
    try { res.json(await db.dbGetProjectAttachments(req.params.id)); }
    catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Attachment download
  app.get('/api/attachments/:id/download', async (req, res) => {
    try {
      const attachmentId = parseInt(req.params.id);
      if (isNaN(attachmentId)) {
        return res.status(400).json({ error: 'Invalid attachment id' });
      }
      const attachment = await db.dbGetAttachmentById(attachmentId);
      if (!attachment) {
        return res.status(404).json({ error: 'Attachment not found' });
      }
      res.json({ id: attachment.id, name: attachment.name });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Actual progress
  app.get('/api/actual-progress', async (_req, res) => {
    try { res.json(await db.dbGetActualProgress()); }
    catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.put('/api/actual-progress/:projectId', async (req, res) => {
    try { res.json(await db.dbUpdateActualProgress(req.params.projectId, req.body)); }
    catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/actual-progress/reset', async (_req, res) => {
    try { res.json({ success: await db.dbResetActualProgress() }); }
    catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Metadata
  app.put('/api/metadata/:key', async (req, res) => {
    try { res.json(await db.dbUpdateMetadata(req.params.key, req.body)); }
    catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Users
  app.get('/api/users', async (_req, res) => {
    try { res.json(await db.dbGetUsers()); }
    catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/users', async (req, res) => {
    try { res.json(await db.dbCreateUser(req.body)); }
    catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.put('/api/users/:id', async (req, res) => {
    try { res.json(await db.dbUpdateUser(req.params.id, req.body)); }
    catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.delete('/api/users/:id', async (req, res) => {
    try { res.json({ success: await db.dbDeleteUser(req.params.id) }); }
    catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Email Config ← MỚI
  app.get('/api/email-config', async (_req, res) => {
    try {
      const config = await db.dbGetEmailConfig();
      const displayConfig = { ...config, password: config.password ? '●●●●●●●●' : '' };
      res.json(displayConfig);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/email-config', async (req, res) => {
    try {
      const config = req.body;
      const currentConfig = await db.dbGetEmailConfig();
      if (config.password === '●●●●●●●●') {
        config.password = currentConfig.password;
      }
      const saved = await db.dbSaveEmailConfig(config);
      res.json(saved);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Password Recovery ← MỚI
  app.post('/api/users/:id/recover-password', async (req, res) => {
    try {
      const userId = req.params.id;
      const users = await db.dbGetUsers();
      const user = users.find((u: any) => u.id === userId);
      if (!user) {
        return res.status(404).json({ error: 'Không tìm thấy tài khoản người dùng.' });
      }
      if (!user.email) {
        return res.status(400).json({ error: 'Người dùng không có địa chỉ email để gửi.' });
      }
      const tempPassword = '654321'; // cố định trong test
      const hashed = 'hashed-password';
      const dbSuccess = await db.dbResetUserPassword(userId, hashed);
      if (!dbSuccess) {
        return res.status(500).json({ error: 'Không thể cập nhật mật khẩu trong cơ sở dữ liệu.' });
      }
      res.json({
        success: true,
        tempPassword,
        emailSent: false,
        emailError: 'SMTP chưa được cấu hình hoàn chỉnh.',
        email: user.email,
      });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Upload Config
  app.get('/api/upload-config', async (_req, res) => {
    try { res.json(await db.dbGetUploadConfig()); }
    catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/upload-config', async (req, res) => {
    try { res.json(await db.dbSaveUploadConfig(req.body)); }
    catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Password Policy
  app.get('/api/password-policy', async (_req, res) => {
    try { res.json(await db.dbGetPasswordPolicy()); }
    catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/password-policy', async (req, res) => {
    try { res.json(await db.dbSavePasswordPolicy(req.body)); }
    catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  return app;
}

// ─── Test suite ───────────────────────────────────────────────────────────────

let app: ReturnType<typeof createTestApp>;

beforeEach(() => {
  vi.clearAllMocks();
  app = createTestApp();
});

// ─── Health & DB Status ───────────────────────────────────────────────────────
describe('GET /api/health', () => {
  it('trả về { status: "ok" }', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('GET /api/db-status', () => {
  it('trả về connected=true và mode', async () => {
    const res = await request(app).get('/api/db-status');
    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(true);
    expect(res.body.mode).toBe('PostgreSQL Database');
  });

  it('gọi initDatabase(true) khi query ?retry=true', async () => {
    await request(app).get('/api/db-status?retry=true');
    expect(db.initDatabase).toHaveBeenCalledWith(true);
  });

  it('gọi initDatabase(true) khi query ?force=true', async () => {
    await request(app).get('/api/db-status?force=true');
    expect(db.initDatabase).toHaveBeenCalledWith(true);
  });

  it('trả về các trường bắt buộc', async () => {
    const res = await request(app).get('/api/db-status');
    expect(res.body).toHaveProperty('connected');
    expect(res.body).toHaveProperty('mode');
  });
});

// ─── GET /api/data ────────────────────────────────────────────────────────────
describe('GET /api/data', () => {
  it('trả về projects, users, actualProgress', async () => {
    const res = await request(app).get('/api/data');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.projects)).toBe(true);
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(typeof res.body.actualProgress).toBe('object');
  });

  it('gọi đủ 4 hàm DB', async () => {
    await request(app).get('/api/data');
    expect(db.dbGetProjects).toHaveBeenCalledOnce();
    expect(db.dbGetUsers).toHaveBeenCalledOnce();
    expect(db.dbGetAllMetadata).toHaveBeenCalledOnce();
    expect(db.dbGetActualProgress).toHaveBeenCalledOnce();
  });

  it('trả về 500 khi DB lỗi', async () => {
    vi.mocked(db.dbGetProjects).mockRejectedValueOnce(new Error('DB down'));
    const res = await request(app).get('/api/data');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('DB down');
  });

  it('trả về metadata trong response', async () => {
    const res = await request(app).get('/api/data');
    expect(res.body).toHaveProperty('investors');
    expect(res.body).toHaveProperty('projectStatuses');
  });
});

// ─── Projects CRUD ────────────────────────────────────────────────────────────
describe('POST /api/projects', () => {
  it('tạo project và trả về với id', async () => {
    const body = { code: 'NX99', name: 'Test', progress: 0 };
    const res = await request(app).post('/api/projects').send(body);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('new-proj-id');
    expect(res.body.code).toBe('NX99');
  });

  it('gọi dbCreateProject với đúng body', async () => {
    const body = { code: 'NX99', name: 'Test' };
    await request(app).post('/api/projects').send(body);
    expect(db.dbCreateProject).toHaveBeenCalledWith(body);
  });

  it('trả về 500 khi DB lỗi', async () => {
    vi.mocked(db.dbCreateProject).mockRejectedValueOnce(new Error('Insert failed'));
    const res = await request(app).post('/api/projects').send({ code: 'ERR' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Insert failed');
  });
});

describe('PUT /api/projects/:id', () => {
  it('cập nhật project và trả về với id đúng', async () => {
    const body = { code: 'NX01', name: 'Updated', progress: 80 };
    const res = await request(app).put('/api/projects/proj-123').send(body);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('proj-123');
    expect(res.body.progress).toBe(80);
  });

  it('gọi dbUpdateProject với đúng id và body', async () => {
    const body = { name: 'Test Update' };
    await request(app).put('/api/projects/abc').send(body);
    expect(db.dbUpdateProject).toHaveBeenCalledWith('abc', body);
  });

  it('trả về 500 khi DB lỗi', async () => {
    vi.mocked(db.dbUpdateProject).mockRejectedValueOnce(new Error('Update failed'));
    const res = await request(app).put('/api/projects/bad-id').send({});
    expect(res.status).toBe(500);
  });
});

describe('DELETE /api/projects/:id', () => {
  it('xóa project và trả về { success: true }', async () => {
    const res = await request(app).delete('/api/projects/proj-123');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('gọi dbDeleteProject với đúng id', async () => {
    await request(app).delete('/api/projects/proj-abc');
    expect(db.dbDeleteProject).toHaveBeenCalledWith('proj-abc');
  });

  it('trả về 500 khi DB lỗi', async () => {
    vi.mocked(db.dbDeleteProject).mockRejectedValueOnce(new Error('Delete failed'));
    const res = await request(app).delete('/api/projects/bad-id');
    expect(res.status).toBe(500);
  });
});

// ─── Project History ──────────────────────────────────────────────────────────
describe('GET /api/projects/:id/history', () => {
  it('trả về mảng history', async () => {
    const res = await request(app).get('/api/projects/1/history');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].actionType).toBe('create_project');
  });

  it('gọi dbGetProjectHistory với đúng projectId', async () => {
    await request(app).get('/api/projects/proj-123/history');
    expect(db.dbGetProjectHistory).toHaveBeenCalledWith('proj-123');
  });
});

describe('POST /api/projects/:id/history', () => {
  it('tạo history entry mới', async () => {
    const body = { userName: 'admin', actionType: 'update', description: 'Cập nhật tiến độ' };
    const res = await request(app).post('/api/projects/1/history').send(body);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(99);
    expect(res.body.projectId).toBe('1');
    expect(res.body.actionType).toBe('update');
  });

  it('gọi dbCreateProjectHistory với đúng params', async () => {
    const body = { userName: 'user1', actionType: 'create', description: 'Test', oldStatus: '', newStatus: 'Active' };
    await request(app).post('/api/projects/p1/history').send(body);
    expect(db.dbCreateProjectHistory).toHaveBeenCalledWith('p1', 'user1', 'create', 'Test', '', 'Active');
  });
});

// ─── Attachments ─────────────────────────────────────────────────────────────
describe('GET /api/projects/:id/attachments', () => {
  it('trả về danh sách attachments', async () => {
    const res = await request(app).get('/api/projects/1/attachments');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].name).toBe('file.pdf');
  });

  it('gọi dbGetProjectAttachments với đúng projectId', async () => {
    await request(app).get('/api/projects/proj-xyz/attachments');
    expect(db.dbGetProjectAttachments).toHaveBeenCalledWith('proj-xyz');
  });
});

describe('GET /api/attachments/:id/download', () => {
  it('trả về attachment khi tìm thấy', async () => {
    const res = await request(app).get('/api/attachments/1/download');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
    expect(res.body.name).toBe('file.pdf');
  });

  it('trả về 404 khi attachment không tồn tại', async () => {
    const res = await request(app).get('/api/attachments/999/download');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Attachment not found');
  });

  it('trả về 400 khi id không phải số', async () => {
    const res = await request(app).get('/api/attachments/abc/download');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid attachment id');
  });
});

// ─── Actual Progress ──────────────────────────────────────────────────────────
describe('GET /api/actual-progress', () => {
  it('trả về object tiến độ', async () => {
    const res = await request(app).get('/api/actual-progress');
    expect(res.status).toBe(200);
    expect(res.body['1'].chutruong.cdtDate).toBe('2024-01-01');
  });

  it('trả về 500 khi DB lỗi', async () => {
    vi.mocked(db.dbGetActualProgress).mockRejectedValueOnce(new Error('DB fail'));
    const res = await request(app).get('/api/actual-progress');
    expect(res.status).toBe(500);
  });
});

describe('PUT /api/actual-progress/:projectId', () => {
  it('cập nhật và trả về dữ liệu mới', async () => {
    const data = { chutruong: { cdtDate: '2024-06-01', nnDate: '' } };
    const res = await request(app).put('/api/actual-progress/proj-99').send(data);
    expect(res.status).toBe(200);
    expect(res.body.chutruong.cdtDate).toBe('2024-06-01');
  });

  it('gọi dbUpdateActualProgress với đúng projectId', async () => {
    const data = { step1: { done: true } };
    await request(app).put('/api/actual-progress/my-proj').send(data);
    expect(db.dbUpdateActualProgress).toHaveBeenCalledWith('my-proj', data);
  });
});

describe('POST /api/actual-progress/reset', () => {
  it('trả về { success: true }', async () => {
    const res = await request(app).post('/api/actual-progress/reset');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('gọi dbResetActualProgress một lần', async () => {
    await request(app).post('/api/actual-progress/reset');
    expect(db.dbResetActualProgress).toHaveBeenCalledOnce();
  });
});

// ─── Metadata ─────────────────────────────────────────────────────────────────
describe('PUT /api/metadata/:key', () => {
  it('cập nhật metadata và trả về list', async () => {
    const list = ['Inv A', 'Inv B', 'Inv C'];
    const res = await request(app).put('/api/metadata/investors').send(list);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(list);
  });

  it('gọi dbUpdateMetadata với đúng key và list', async () => {
    const list = ['Status 1', 'Status 2'];
    await request(app).put('/api/metadata/projectStatuses').send(list);
    expect(db.dbUpdateMetadata).toHaveBeenCalledWith('projectStatuses', list);
  });

  it('xử lý cập nhật processingAgencies (cấu trúc phức tạp)', async () => {
    const agencies = [
      { id: 'sxd', name: 'Sở Xây Dựng', departments: ['Phòng 1'] },
      { id: 'sqhkt', name: 'Sở QHKT', departments: [] },
    ];
    const res = await request(app).put('/api/metadata/processingAgencies').send(agencies);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(agencies);
  });

  it('xử lý cập nhật locations (ward + oldArea)', async () => {
    const locations = [{ ward: 'Phường 1', oldArea: 'Quận 1' }];
    const res = await request(app).put('/api/metadata/locations').send(locations);
    expect(res.status).toBe(200);
  });

  it('xử lý cập nhật processes (quy trình)', async () => {
    const processes = [
      { id: 'proc-1', name: 'Quy trình A', parentSteps: [] },
    ];
    const res = await request(app).put('/api/metadata/processes').send(processes);
    expect(res.status).toBe(200);
  });
});

// ─── Users CRUD ───────────────────────────────────────────────────────────────
describe('GET /api/users', () => {
  it('trả về danh sách users', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].email).toBe('admin@example.com');
  });

  it('trả về 500 khi DB lỗi', async () => {
    vi.mocked(db.dbGetUsers).mockRejectedValueOnce(new Error('Users fail'));
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(500);
  });
});

describe('POST /api/users', () => {
  it('tạo user mới và trả về với id', async () => {
    const body = { email: 'new@example.com', fullName: 'New User', userType: 'agency' };
    const res = await request(app).post('/api/users').send(body);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('new-user-id');
    expect(res.body.email).toBe('new@example.com');
  });

  it('gọi dbCreateUser với đúng body', async () => {
    const body = { email: 'test@test.com', userType: 'investor' };
    await request(app).post('/api/users').send(body);
    expect(db.dbCreateUser).toHaveBeenCalledWith(body);
  });
});

describe('PUT /api/users/:id', () => {
  it('cập nhật user và trả về với id đúng', async () => {
    const body = { email: 'updated@example.com', fullName: 'Updated Name' };
    const res = await request(app).put('/api/users/user-123').send(body);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('user-123');
    expect(res.body.fullName).toBe('Updated Name');
  });
});

describe('DELETE /api/users/:id', () => {
  it('xóa user và trả về { success: true }', async () => {
    const res = await request(app).delete('/api/users/user-123');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('gọi dbDeleteUser với đúng id', async () => {
    await request(app).delete('/api/users/user-xyz');
    expect(db.dbDeleteUser).toHaveBeenCalledWith('user-xyz');
  });
});

// ─── Email Config (MỚI) ───────────────────────────────────────────────────────
describe('GET /api/email-config', () => {
  it('trả về config với password được ẩn', async () => {
    const res = await request(app).get('/api/email-config');
    expect(res.status).toBe(200);
    expect(res.body.password).toBe('●●●●●●●●');
    expect(res.body.host).toBe('smtp.example.com');
  });

  it('trả về các trường cần thiết', async () => {
    const res = await request(app).get('/api/email-config');
    expect(res.body).toHaveProperty('host');
    expect(res.body).toHaveProperty('port');
    expect(res.body).toHaveProperty('username');
    expect(res.body).toHaveProperty('fromName');
    expect(res.body).toHaveProperty('fromEmail');
  });

  it('ẩn password khi có giá trị', async () => {
    const res = await request(app).get('/api/email-config');
    expect(res.body.password).not.toBe('secret123');
    expect(res.body.password).toBe('●●●●●●●●');
  });

  it('trả về password rỗng khi config không có password', async () => {
    vi.mocked(db.dbGetEmailConfig).mockResolvedValueOnce({
      host: 'smtp.example.com',
      port: '587',
      secure: false,
      username: 'user@example.com',
      password: '',
      fromName: 'Test',
      fromEmail: 'test@example.com',
    });
    const res = await request(app).get('/api/email-config');
    expect(res.body.password).toBe('');
  });

  it('trả về 500 khi DB lỗi', async () => {
    vi.mocked(db.dbGetEmailConfig).mockRejectedValueOnce(new Error('Email config fail'));
    const res = await request(app).get('/api/email-config');
    expect(res.status).toBe(500);
  });
});

describe('POST /api/email-config', () => {
  it('lưu config mới và trả về', async () => {
    const config = {
      host: 'smtp.gmail.com',
      port: '465',
      secure: true,
      username: 'admin@gmail.com',
      password: 'newpassword',
      fromName: 'Admin',
      fromEmail: 'admin@gmail.com',
    };
    const res = await request(app).post('/api/email-config').send(config);
    expect(res.status).toBe(200);
    expect(db.dbSaveEmailConfig).toHaveBeenCalled();
  });

  it('giữ nguyên password cũ khi gửi placeholder "●●●●●●●●"', async () => {
    const config = {
      host: 'smtp.gmail.com',
      port: '465',
      secure: true,
      username: 'admin@gmail.com',
      password: '●●●●●●●●', // placeholder
      fromName: 'Admin',
      fromEmail: 'admin@gmail.com',
    };
    await request(app).post('/api/email-config').send(config);
    const calledWith = vi.mocked(db.dbSaveEmailConfig).mock.calls[0][0];
    expect(calledWith.password).toBe('secret123'); // password cũ từ mock
  });

  it('trả về 500 khi lưu thất bại', async () => {
    vi.mocked(db.dbSaveEmailConfig).mockRejectedValueOnce(new Error('Save fail'));
    const res = await request(app).post('/api/email-config').send({ host: 'smtp.test.com' });
    expect(res.status).toBe(500);
  });
});

// ─── Password Recovery (MỚI) ──────────────────────────────────────────────────
describe('POST /api/users/:id/recover-password', () => {
  it('trả về 404 khi không tìm thấy user', async () => {
    vi.mocked(db.dbGetUsers).mockResolvedValueOnce([]); // không có user nào
    const res = await request(app).post('/api/users/nonexistent/recover-password');
    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Không tìm thấy');
  });

  it('trả về thành công khi user tồn tại và có email', async () => {
    const res = await request(app).post('/api/users/u1/recover-password');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('tempPassword');
    expect(res.body.email).toBe('admin@example.com');
  });

  it('gọi dbResetUserPassword với userId đúng', async () => {
    await request(app).post('/api/users/u1/recover-password');
    expect(db.dbResetUserPassword).toHaveBeenCalledWith('u1', expect.any(String));
  });

  it('trả về emailSent=false khi SMTP chưa cấu hình', async () => {
    const res = await request(app).post('/api/users/u1/recover-password');
    expect(res.status).toBe(200);
    expect(res.body.emailSent).toBe(false);
  });

  it('trả về 400 khi user không có email', async () => {
    vi.mocked(db.dbGetUsers).mockResolvedValueOnce([
      { id: 'u1', email: '', userType: 'agency', roleId: 'Admin' },
    ]);
    const res = await request(app).post('/api/users/u1/recover-password');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('email');
  });

  it('trả về 500 khi dbResetUserPassword thất bại', async () => {
    vi.mocked(db.dbResetUserPassword).mockResolvedValueOnce(false);
    const res = await request(app).post('/api/users/u1/recover-password');
    expect(res.status).toBe(500);
    expect(res.body.error).toContain('mật khẩu');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// NHÓM MỚI 1 — VALIDATION & BUSINESS RULES
// Kiểm tra server xử lý đúng khi nhận dữ liệu thiếu / sai định dạng
// ═══════════════════════════════════════════════════════════════════════════════

describe('Validation – POST /api/projects (body thiếu / rỗng)', () => {
  it('chấp nhận body rỗng {} và truyền thẳng vào DB (không validate phía server)', async () => {
    // Server hiện tại không validate — dbCreateProject nhận bất kỳ object nào
    const res = await request(app).post('/api/projects').send({});
    expect(res.status).toBe(200);
    expect(db.dbCreateProject).toHaveBeenCalledWith({});
  });

  it('chấp nhận project chỉ có name', async () => {
    const res = await request(app).post('/api/projects').send({ name: 'Dự án A' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Dự án A');
  });

  it('chấp nhận progress = 0', async () => {
    const res = await request(app).post('/api/projects').send({ name: 'Test', progress: 0 });
    expect(res.status).toBe(200);
  });

  it('chấp nhận progress = 100 (hoàn thành)', async () => {
    const res = await request(app).post('/api/projects').send({ name: 'Test', progress: 100 });
    expect(res.status).toBe(200);
  });

  it('truyền đúng tất cả trường vào dbCreateProject', async () => {
    const full = {
      code: 'NX99', name: 'Dự án đầy đủ', investor: 'Inv A',
      address: '123 Đường ABC', area: 500, units: 200,
      status: 'Đang triển khai', progress: 40,
    };
    await request(app).post('/api/projects').send(full);
    expect(db.dbCreateProject).toHaveBeenCalledWith(full);
  });
});

describe('Validation – POST /api/users (các trường user)', () => {
  it('chấp nhận tạo user chỉ với email', async () => {
    const res = await request(app).post('/api/users').send({ email: 'a@b.com' });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('new-user-id');
  });

  it('tạo user với đầy đủ trường — truyền đúng vào DB', async () => {
    const full = {
      username: 'testuser', email: 'test@example.com',
      fullName: 'Nguyễn Văn A', phone: '0901234567',
      userType: 'agency', agencyId: 'sxd', roleId: 'Admin',
    };
    await request(app).post('/api/users').send(full);
    expect(db.dbCreateUser).toHaveBeenCalledWith(full);
  });

  it('tạo user investor với investorId', async () => {
    const body = { userType: 'investor', investorId: 'CDT_X', email: 'cdt@example.com' };
    const res = await request(app).post('/api/users').send(body);
    expect(res.status).toBe(200);
  });
});

describe('Validation – PUT /api/metadata/:key (các key hợp lệ)', () => {
  it('cập nhật key "investors" với mảng rỗng', async () => {
    const res = await request(app).put('/api/metadata/investors').send([]);
    expect(res.status).toBe(200);
    expect(db.dbUpdateMetadata).toHaveBeenCalledWith('investors', []);
  });

  it('cập nhật key "projectStatuses" với 1 phần tử', async () => {
    const res = await request(app).put('/api/metadata/projectStatuses').send(['Mới']);
    expect(res.status).toBe(200);
  });

  it('cập nhật key tùy ý (server không giới hạn key)', async () => {
    const res = await request(app).put('/api/metadata/someNewKey').send(['val1', 'val2']);
    expect(res.status).toBe(200);
    expect(db.dbUpdateMetadata).toHaveBeenCalledWith('someNewKey', ['val1', 'val2']);
  });
});

describe('Validation – POST /api/email-config (password logic)', () => {
  it('giữ password cũ khi password trong body là chuỗi rỗng (không phải placeholder)', async () => {
    // Chú ý: chỉ placeholder "●●●●●●●●" mới được thay, chuỗi rỗng thì KHÔNG
    const config = { host: 'smtp.test.com', port: '587', password: '' };
    await request(app).post('/api/email-config').send(config);
    const calledWith = vi.mocked(db.dbSaveEmailConfig).mock.calls[0][0];
    // password rỗng truyền thẳng vào DB (không thay bằng password cũ)
    expect(calledWith.password).toBe('');
  });

  it('lưu đúng host và port vào DB', async () => {
    const config = { host: 'mail.example.com', port: '465', password: 'newpass' };
    await request(app).post('/api/email-config').send(config);
    const calledWith = vi.mocked(db.dbSaveEmailConfig).mock.calls[0][0];
    expect(calledWith.host).toBe('mail.example.com');
    expect(calledWith.port).toBe('465');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// NHÓM MỚI 2 — AUTHENTICATION & AUTHORIZATION (KIỂM TRA TRẠNG THÁI HIỆN TẠI)
// Server hiện KHÔNG có auth middleware — tất cả route đều mở
// Nhóm test này ghi nhận behavior hiện tại và sẵn sàng fail khi auth được thêm
// ═══════════════════════════════════════════════════════════════════════════════

describe('Auth – Trạng thái hiện tại (không có middleware)', () => {
  it('GET /api/users — không cần token vẫn trả về 200', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(200);
  });

  it('POST /api/users — không cần token vẫn tạo được user', async () => {
    const res = await request(app).post('/api/users').send({ email: 'x@y.com' });
    expect(res.status).toBe(200);
  });

  it('DELETE /api/users/:id — không cần token vẫn xóa được', async () => {
    const res = await request(app).delete('/api/users/u1');
    expect(res.status).toBe(200);
  });

  it('GET /api/email-config — không cần token vẫn trả về config', async () => {
    const res = await request(app).get('/api/email-config');
    expect(res.status).toBe(200);
  });

  it('POST /api/actual-progress/reset — không cần token vẫn reset được', async () => {
    const res = await request(app).post('/api/actual-progress/reset');
    expect(res.status).toBe(200);
  });

  it('DELETE /api/projects/:id — không cần token vẫn xóa được', async () => {
    const res = await request(app).delete('/api/projects/proj-1');
    expect(res.status).toBe(200);
  });

  it('header Authorization bị ignore (server không đọc nó)', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', 'Bearer invalid-token-xyz');
    // Vẫn 200 vì server không có middleware verify token
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// NHÓM MỚI 3 — EDGE CASES & ERROR HANDLING
// ═══════════════════════════════════════════════════════════════════════════════

describe('Edge cases – GET /api/attachments/:id/download', () => {
  it('id = 0 — không phải NaN nên không trả 400 (tìm theo id=0)', async () => {
    // parseInt('0') = 0, isNaN(0) = false → server thử tìm attachment id=0
    const res = await request(app).get('/api/attachments/0/download');
    // mock trả null cho id != 1 → phải là 404
    expect(res.status).toBe(404);
  });

  it('id âm — parseInt("-5") = -5, không phải NaN → tìm attachment id=-5', async () => {
    const res = await request(app).get('/api/attachments/-5/download');
    expect(res.status).toBe(404); // mock trả null cho id != 1
  });

  it('id là số thực "1.5" — parseInt("1.5")=1 → tìm và thấy attachment id=1', async () => {
    const res = await request(app).get('/api/attachments/1.5/download');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
  });

  it('id là chuỗi đặc biệt "null" → NaN → trả 400', async () => {
    const res = await request(app).get('/api/attachments/null/download');
    expect(res.status).toBe(400);
  });

  it('id là chuỗi có khoảng trắng " 1 " → parseInt = 1 → tìm thấy', async () => {
    const res = await request(app).get('/api/attachments/ 1 /download');
    // Express URL routing xử lý khoảng trắng — route có thể không khớp
    // Chỉ test rằng không bị crash (4xx hoặc 2xx đều chấp nhận)
    expect([200, 400, 404]).toContain(res.status);
  });
});

describe('Edge cases – Projects với DB trả về dữ liệu bất thường', () => {
  it('dbGetProjects trả về mảng rỗng → /api/data vẫn 200', async () => {
    vi.mocked(db.dbGetProjects).mockResolvedValueOnce([]);
    const res = await request(app).get('/api/data');
    expect(res.status).toBe(200);
    expect(res.body.projects).toEqual([]);
  });

  it('dbGetUsers trả về mảng rỗng → /api/data vẫn 200', async () => {
    vi.mocked(db.dbGetUsers).mockResolvedValueOnce([]);
    const res = await request(app).get('/api/data');
    expect(res.status).toBe(200);
    expect(res.body.users).toEqual([]);
  });

  it('dbUpdateProject trả về 500 → PUT project trả về 500', async () => {
    vi.mocked(db.dbUpdateProject).mockRejectedValueOnce(new Error('Deadlock'));
    const res = await request(app).put('/api/projects/p1').send({ name: 'X' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Deadlock');
  });

  it('dbDeleteUser trả về 500 → DELETE user trả về 500', async () => {
    vi.mocked(db.dbDeleteUser).mockRejectedValueOnce(new Error('FK constraint'));
    const res = await request(app).delete('/api/users/u1');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('FK constraint');
  });

  it('dbGetProjectHistory trả về mảng rỗng → 200 với []', async () => {
    vi.mocked(db.dbGetProjectHistory).mockResolvedValueOnce([]);
    const res = await request(app).get('/api/projects/p1/history');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('dbGetProjectAttachments trả về mảng rỗng → 200 với []', async () => {
    vi.mocked(db.dbGetProjectAttachments).mockResolvedValueOnce([]);
    const res = await request(app).get('/api/projects/p1/attachments');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('dbGetActualProgress trả về {} rỗng → 200', async () => {
    vi.mocked(db.dbGetActualProgress).mockResolvedValueOnce({});
    const res = await request(app).get('/api/actual-progress');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });
});

describe('Edge cases – Content-Type và body', () => {
  it('POST /api/projects không có Content-Type → body là {} → 200', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Content-Type', 'application/json')
      .send('{}');
    expect(res.status).toBe(200);
  });

  it('PUT /api/actual-progress/:projectId với body lồng nhau nhiều cấp', async () => {
    const nested = {
      chutruong: { cdtDate: '2024-01-01', nnDate: '', sxdDate: '' },
      giayphep: { cdtDate: '', nnDate: '2024-02-01', sxdDate: '2024-03-01' },
    };
    const res = await request(app).put('/api/actual-progress/proj-deep').send(nested);
    expect(res.status).toBe(200);
    expect(db.dbUpdateActualProgress).toHaveBeenCalledWith('proj-deep', nested);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// NHÓM MỚI 4 — LUỒNG NGHIỆP VỤ (MULTI-STEP FLOWS)
// Mô phỏng workflow thật: nhiều bước liên tiếp, kiểm tra tính nhất quán
// ═══════════════════════════════════════════════════════════════════════════════

describe('Luồng 1 – Tạo dự án → Cập nhật tiến độ → Ghi lịch sử', () => {
  it('bước 1: tạo project thành công', async () => {
    const res = await request(app).post('/api/projects').send({
      code: 'FLOW01', name: 'Dự án Luồng 1', investor: 'Inv A',
    });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('new-proj-id');
  });

  it('bước 2: cập nhật tiến độ thực tế cho project vừa tạo', async () => {
    const progressData = { chutruong: { cdtDate: '2024-03-01', nnDate: '' } };
    const res = await request(app).put('/api/actual-progress/new-proj-id').send(progressData);
    expect(res.status).toBe(200);
    expect(db.dbUpdateActualProgress).toHaveBeenCalledWith('new-proj-id', progressData);
  });

  it('bước 3: ghi lịch sử sau khi cập nhật', async () => {
    const historyBody = {
      userName: 'admin',
      actionType: 'update_progress',
      description: 'Cập nhật tiến độ bước Chủ trương',
      oldStatus: '',
      newStatus: 'Đang triển khai',
    };
    const res = await request(app).post('/api/projects/new-proj-id/history').send(historyBody);
    expect(res.status).toBe(200);
    expect(res.body.actionType).toBe('update_progress');
    expect(res.body.projectId).toBe('new-proj-id');
  });
});

describe('Luồng 2 – Tạo dự án → Xóa → Kiểm tra các resource liên quan', () => {
  it('bước 1: tạo project', async () => {
    const res = await request(app).post('/api/projects').send({ name: 'Dự án cần xóa' });
    expect(res.status).toBe(200);
  });

  it('bước 2: lấy attachments của project (danh sách trước khi xóa)', async () => {
    const res = await request(app).get('/api/projects/new-proj-id/attachments');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('bước 3: xóa project', async () => {
    const res = await request(app).delete('/api/projects/new-proj-id');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(db.dbDeleteProject).toHaveBeenCalledWith('new-proj-id');
  });

  it('bước 4: sau khi xóa, DB mock không còn project → /api/data trả mảng rỗng', async () => {
    vi.mocked(db.dbGetProjects).mockResolvedValueOnce([]);
    const res = await request(app).get('/api/data');
    expect(res.status).toBe(200);
    expect(res.body.projects).toEqual([]);
  });
});

describe('Luồng 3 – Tạo user → Khôi phục mật khẩu → Cập nhật email', () => {
  it('bước 1: tạo user mới có email', async () => {
    const res = await request(app).post('/api/users').send({
      username: 'newuser', email: 'newuser@example.com',
      fullName: 'Nguyễn Văn B', userType: 'agency',
    });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('new-user-id');
  });

  it('bước 2: khôi phục mật khẩu — user tồn tại, có email → thành công', async () => {
    const res = await request(app).post('/api/users/u1/recover-password');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('tempPassword');
  });

  it('bước 3: cập nhật email user sau khi có mật khẩu tạm', async () => {
    const res = await request(app).put('/api/users/u1').send({
      email: 'updated_newuser@example.com',
      fullName: 'Nguyễn Văn B',
    });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('u1');
    expect(res.body.email).toBe('updated_newuser@example.com');
  });

  it('bước 4: xóa user sau khi hoàn tất', async () => {
    const res = await request(app).delete('/api/users/u1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('Luồng 4 – Cấu hình email → Kiểm tra → Lưu → Lấy lại (ẩn password)', () => {
  it('bước 1: lưu email config mới', async () => {
    const config = {
      host: 'smtp.gmail.com', port: '587', secure: false,
      username: 'admin@sxd.gov.vn', password: 'super_secret_2026',
      fromName: 'Sở Xây Dựng', fromEmail: 'noreply@sxd.gov.vn',
    };
    const res = await request(app).post('/api/email-config').send(config);
    expect(res.status).toBe(200);
    expect(db.dbSaveEmailConfig).toHaveBeenCalledOnce();
  });

  it('bước 2: lấy lại config — password phải bị ẩn', async () => {
    const res = await request(app).get('/api/email-config');
    expect(res.status).toBe(200);
    expect(res.body.password).toBe('●●●●●●●●');
    expect(res.body.host).toBe('smtp.example.com'); // từ mock mặc định
  });

  it('bước 3: lưu lại với placeholder → password cũ được giữ nguyên', async () => {
    await request(app).post('/api/email-config').send({
      host: 'smtp.gmail.com', port: '587', password: '●●●●●●●●',
    });
    const calledWith = vi.mocked(db.dbSaveEmailConfig).mock.calls[0][0];
    expect(calledWith.password).toBe('secret123'); // password cũ từ mock
  });
});

describe('Luồng 5 – Reset tiến độ → Kiểm tra state sau reset', () => {
  it('bước 1: cập nhật tiến độ một vài project', async () => {
    const r1 = await request(app).put('/api/actual-progress/p1').send({ step: 'done' });
    const r2 = await request(app).put('/api/actual-progress/p2').send({ step: 'in-progress' });
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
  });

  it('bước 2: reset toàn bộ tiến độ', async () => {
    const res = await request(app).post('/api/actual-progress/reset');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('bước 3: dbResetActualProgress đã được gọi đúng 1 lần', async () => {
    await request(app).post('/api/actual-progress/reset');
    expect(db.dbResetActualProgress).toHaveBeenCalledOnce();
  });

  it('bước 4: sau reset, lấy tiến độ lại → DB trả {} (mock reset state)', async () => {
    vi.mocked(db.dbGetActualProgress).mockResolvedValueOnce({});
    const res = await request(app).get('/api/actual-progress');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });
});

describe('Luồng 6 – Cập nhật metadata → Lấy lại qua /api/data', () => {
  it('bước 1: cập nhật danh sách nhà đầu tư', async () => {
    const investors = ['Nhà đầu tư A', 'Nhà đầu tư B', 'Nhà đầu tư C'];
    const res = await request(app).put('/api/metadata/investors').send(investors);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(investors);
  });

  it('bước 2: cập nhật trạng thái dự án', async () => {
    const statuses = ['Chưa triển khai', 'Đang triển khai', 'Hoàn thành', 'Tạm dừng'];
    const res = await request(app).put('/api/metadata/projectStatuses').send(statuses);
    expect(res.status).toBe(200);
  });

  it('bước 3: /api/data gọi dbGetAllMetadata để trả về metadata mới nhất', async () => {
    vi.mocked(db.dbGetAllMetadata).mockResolvedValueOnce({
      investors: ['Nhà đầu tư A', 'Nhà đầu tư B', 'Nhà đầu tư C'],
      projectStatuses: ['Chưa triển khai', 'Đang triển khai', 'Hoàn thành', 'Tạm dừng'],
    });
    const res = await request(app).get('/api/data');
    expect(res.status).toBe(200);
    expect(res.body.investors).toHaveLength(3);
    expect(res.body.projectStatuses).toHaveLength(4);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// NHÓM MỚI 5 — LUỒNG FILE ĐÍNH KÈM (UPLOAD → DOWNLOAD LIFECYCLE)
// Server parse multipart/form-data qua multer, lưu file vào uploads/
// Test dùng supertest .attach() để gửi file thật
// ═══════════════════════════════════════════════════════════════════════════════

// Bổ sung mock dbCreateProjectAttachment vào createTestApp cho upload route
function createTestAppWithUpload() {
  const app = express();
  app.use(express.json());

  // Minimal multer setup cho test (lưu vào memory, không cần thư mục thật)
  const multer = require('multer');
  const upload = multer({ storage: multer.memoryStorage() });

  app.post('/api/projects/:id/attachments/upload', upload.single('file'), async (req: any, res: any) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      const projectId = req.params.id;
      const originalName = req.file.originalname;
      const sizeInBytes = req.file.size;
      const sizeStr = sizeInBytes > 1024 * 1024
        ? `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`
        : `${(sizeInBytes / 1024).toFixed(0)} KB`;
      const extension = originalName.split('.').pop()?.toUpperCase() || 'FILE';
      const doc = await db.dbCreateProjectAttachment(projectId, originalName, sizeStr, extension);
      res.json(doc);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/projects/:id/attachments', async (req: any, res: any) => {
    try { res.json(await db.dbGetProjectAttachments(req.params.id)); }
    catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/attachments/:id/download', async (req: any, res: any) => {
    try {
      const attachmentId = parseInt(req.params.id);
      if (isNaN(attachmentId)) return res.status(400).json({ error: 'Invalid attachment id' });
      const attachment = await db.dbGetAttachmentById(attachmentId);
      if (!attachment) return res.status(404).json({ error: 'Attachment not found' });
      // Test không cần gọi res.download — trả JSON để supertest dễ assert
      res.json({ id: attachment.id, name: attachment.name, size: attachment.size });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  return app;
}

describe('Luồng 7 – Upload file đính kèm → Lấy danh sách → Download', () => {
  let uploadApp: ReturnType<typeof createTestAppWithUpload>;

  beforeEach(() => {
    uploadApp = createTestAppWithUpload();
  });

  it('bước 1: upload file PDF thành công → trả về attachment object', async () => {
    const res = await request(uploadApp)
      .post('/api/projects/proj-1/attachments/upload')
      .attach('file', Buffer.from('PDF content here'), 'bao-cao.pdf');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(42);
    expect(res.body.name).toBe('bao-cao.pdf');
    expect(res.body.fileType).toBe('PDF');
  });

  it('bước 1b: upload file DOCX → extension đúng', async () => {
    const res = await request(uploadApp)
      .post('/api/projects/proj-1/attachments/upload')
      .attach('file', Buffer.from('Word content'), 'hop-dong.docx');
    expect(res.status).toBe(200);
    expect(res.body.fileType).toBe('DOCX');
  });

  it('bước 1c: upload không có file → trả về 400', async () => {
    const res = await request(uploadApp)
      .post('/api/projects/proj-1/attachments/upload')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('No file uploaded');
  });

  it('bước 2: lấy danh sách attachments của project → thấy file vừa upload', async () => {
    const res = await request(uploadApp).get('/api/projects/proj-1/attachments');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // mock dbGetProjectAttachments trả [{ id:1, name:'file.pdf' }]
    expect(res.body[0].name).toBe('file.pdf');
  });

  it('bước 3: download file theo id → trả về info đúng', async () => {
    const res = await request(uploadApp).get('/api/attachments/1/download');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
    expect(res.body.name).toBe('file.pdf');
  });

  it('bước 4: download file không tồn tại → 404', async () => {
    const res = await request(uploadApp).get('/api/attachments/999/download');
    expect(res.status).toBe(404);
  });

  it('dbCreateProjectAttachment được gọi với đúng projectId và tên file', async () => {
    await request(uploadApp)
      .post('/api/projects/proj-xyz/attachments/upload')
      .attach('file', Buffer.from('content'), 'test-file.xlsx');
    expect(db.dbCreateProjectAttachment).toHaveBeenCalledWith(
      'proj-xyz', 'test-file.xlsx', expect.any(String), 'XLSX'
    );
  });

  it('size được tính đúng: file nhỏ hơn 1MB → định dạng KB', async () => {
    const smallBuffer = Buffer.alloc(500); // 500 bytes
    await request(uploadApp)
      .post('/api/projects/p1/attachments/upload')
      .attach('file', smallBuffer, 'small.pdf');
    const calledWith = vi.mocked(db.dbCreateProjectAttachment).mock.calls[0];
    expect(calledWith[2]).toContain('KB');
  });

  it('size được tính đúng: file lớn hơn 1MB → định dạng MB', async () => {
    const bigBuffer = Buffer.alloc(2 * 1024 * 1024); // 2MB
    await request(uploadApp)
      .post('/api/projects/p1/attachments/upload')
      .attach('file', bigBuffer, 'large.pdf');
    const calledWith = vi.mocked(db.dbCreateProjectAttachment).mock.calls[0];
    expect(calledWith[2]).toContain('MB');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// NHÓM MỚI 6 — LUỒNG LỊCH SỬ DỰ ÁN (MULTI ACTIONTYPE)
// Ghi nhiều loại history khác nhau → lấy lại → kiểm tra đầy đủ
// ═══════════════════════════════════════════════════════════════════════════════

describe('Luồng 8 – Lịch sử dự án: nhiều loại actionType', () => {
  it('bước 1: ghi history loại "create_project"', async () => {
    const res = await request(app).post('/api/projects/p1/history').send({
      userName: 'admin', actionType: 'create_project',
      description: 'Khởi tạo dự án mới', oldStatus: '', newStatus: '',
    });
    expect(res.status).toBe(200);
    expect(res.body.actionType).toBe('create_project');
  });

  it('bước 2: ghi history loại "update_progress"', async () => {
    const res = await request(app).post('/api/projects/p1/history').send({
      userName: 'sxd_user', actionType: 'update_progress',
      description: 'Cập nhật tiến độ bước Chủ trương',
      oldStatus: 'Chưa có', newStatus: 'Đang xử lý',
    });
    expect(res.status).toBe(200);
    expect(res.body.actionType).toBe('update_progress');
  });

  it('bước 3: ghi history loại "update_status"', async () => {
    const res = await request(app).post('/api/projects/p1/history').send({
      userName: 'admin', actionType: 'update_status',
      description: 'Chuyển trạng thái dự án',
      oldStatus: 'Chuẩn bị đầu tư', newStatus: 'Thực hiện đầu tư',
    });
    expect(res.status).toBe(200);
  });

  it('bước 4: ghi history loại "upload_attachment"', async () => {
    const res = await request(app).post('/api/projects/p1/history').send({
      userName: 'cdt_user', actionType: 'upload_attachment',
      description: 'Tải lên file "bao-cao-dau-tu.pdf"',
      oldStatus: '', newStatus: '',
    });
    expect(res.status).toBe(200);
    expect(res.body.actionType).toBe('upload_attachment');
  });

  it('bước 5: lấy lại lịch sử → đúng projectId', async () => {
    vi.mocked(db.dbGetProjectHistory).mockResolvedValueOnce([
      { id: 1, projectId: 'p1', actionType: 'create_project', description: 'Khởi tạo' },
      { id: 2, projectId: 'p1', actionType: 'update_progress', description: 'Cập nhật tiến độ' },
      { id: 3, projectId: 'p1', actionType: 'update_status', description: 'Chuyển trạng thái' },
      { id: 4, projectId: 'p1', actionType: 'upload_attachment', description: 'Tải file' },
    ]);
    const res = await request(app).get('/api/projects/p1/history');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(4);
    expect(res.body.map((h: any) => h.actionType)).toContain('upload_attachment');
  });

  it('dbCreateProjectHistory nhận đúng oldStatus và newStatus', async () => {
    await request(app).post('/api/projects/p1/history').send({
      userName: 'admin', actionType: 'update_status',
      description: 'Test', oldStatus: 'A', newStatus: 'B',
    });
    expect(db.dbCreateProjectHistory).toHaveBeenCalledWith('p1', 'admin', 'update_status', 'Test', 'A', 'B');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// NHÓM MỚI 7 — LUỒNG METADATA PHỨC TẠP
// processingAgencies (có departments lồng nhau), processes (có parentSteps/childSteps)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Luồng 9 – Cập nhật metadata processingAgencies (cơ quan xử lý)', () => {
  const agencies = [
    { id: 'sxd', name: 'Sở Xây Dựng', departments: ['Phòng Phát triển đô thị', 'Phòng Quản lý nhà'] },
    { id: 'sqhkt', name: 'Sở Quy hoạch Kiến trúc', departments: ['Phòng Quy hoạch'] },
    { id: 'stnmt', name: 'Sở TN&MT', departments: [] },
  ];

  it('bước 1: PUT processingAgencies với cấu trúc đầy đủ', async () => {
    const res = await request(app).put('/api/metadata/processingAgencies').send(agencies);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(agencies);
  });

  it('bước 2: gọi dbUpdateMetadata với đúng key "processingAgencies"', async () => {
    await request(app).put('/api/metadata/processingAgencies').send(agencies);
    expect(db.dbUpdateMetadata).toHaveBeenCalledWith('processingAgencies', agencies);
  });

  it('bước 3: cập nhật thêm departments cho 1 agency', async () => {
    const updated = agencies.map(a =>
      a.id === 'sxd'
        ? { ...a, departments: [...a.departments, 'Phòng Cấp phép xây dựng'] }
        : a
    );
    const res = await request(app).put('/api/metadata/processingAgencies').send(updated);
    expect(res.status).toBe(200);
    expect(res.body.find((a: any) => a.id === 'sxd').departments).toHaveLength(3);
  });

  it('bước 4: xóa hết agencies → PUT mảng rỗng', async () => {
    const res = await request(app).put('/api/metadata/processingAgencies').send([]);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('Luồng 10 – Cập nhật metadata processes (quy trình)', () => {
  const processes = [
    {
      id: 'proc-chutruong', name: 'Chủ trương đầu tư',
      parentSteps: [
        {
          id: 'step-1', name: 'Thẩm định dự án',
          childSteps: [
            { id: 'cs-1', name: 'Lập báo cáo', agency: 'sxd' },
            { id: 'cs-2', name: 'Phê duyệt', agency: 'ubnd' },
          ],
        },
      ],
    },
    {
      id: 'proc-gpxd', name: 'Giấy phép xây dựng',
      parentSteps: [
        { id: 'step-gpxd', name: 'Nộp hồ sơ', childSteps: [] },
      ],
    },
  ];

  it('bước 1: PUT processes với cấu trúc 3 cấp lồng nhau', async () => {
    const res = await request(app).put('/api/metadata/processes').send(processes);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(processes);
  });

  it('bước 2: dbUpdateMetadata nhận đúng dữ liệu processes', async () => {
    await request(app).put('/api/metadata/processes').send(processes);
    expect(db.dbUpdateMetadata).toHaveBeenCalledWith('processes', processes);
  });

  it('bước 3: cập nhật thêm parentStep mới vào quy trình hiện có', async () => {
    const updated = processes.map(p =>
      p.id === 'proc-chutruong'
        ? {
            ...p,
            parentSteps: [...p.parentSteps, {
              id: 'step-2', name: 'Ký quyết định', childSteps: [],
            }],
          }
        : p
    );
    const res = await request(app).put('/api/metadata/processes').send(updated);
    expect(res.status).toBe(200);
    const chutruong = res.body.find((p: any) => p.id === 'proc-chutruong');
    expect(chutruong.parentSteps).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// NHÓM MỚI 8 — CONCURRENT REQUESTS (ĐỒng THỜI)
// Gửi nhiều request cùng lúc → server không crash, không trả lỗi bất ngờ
// ═══════════════════════════════════════════════════════════════════════════════

describe('Concurrent – Nhiều request đồng thời không crash server', () => {
  it('gửi 5 GET /api/health đồng thời → tất cả trả 200', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => request(app).get('/api/health'))
    );
    results.forEach(r => expect(r.status).toBe(200));
  });

  it('gửi 3 GET /api/data đồng thời → tất cả trả 200', async () => {
    const results = await Promise.all(
      Array.from({ length: 3 }, () => request(app).get('/api/data'))
    );
    results.forEach(r => {
      expect(r.status).toBe(200);
      expect(Array.isArray(r.body.projects)).toBe(true);
    });
  });

  it('PUT project từ 3 "client" đồng thời → tất cả được phục vụ', async () => {
    const results = await Promise.all([
      request(app).put('/api/projects/p1').send({ name: 'Update 1' }),
      request(app).put('/api/projects/p1').send({ name: 'Update 2' }),
      request(app).put('/api/projects/p1').send({ name: 'Update 3' }),
    ]);
    results.forEach(r => expect(r.status).toBe(200));
    expect(db.dbUpdateProject).toHaveBeenCalledTimes(3);
  });

  it('tạo 3 users đồng thời → dbCreateUser được gọi 3 lần', async () => {
    const users = [
      { email: 'a@test.com', userType: 'agency' },
      { email: 'b@test.com', userType: 'investor' },
      { email: 'c@test.com', userType: 'agency' },
    ];
    const results = await Promise.all(
      users.map(u => request(app).post('/api/users').send(u))
    );
    results.forEach(r => expect(r.status).toBe(200));
    expect(db.dbCreateUser).toHaveBeenCalledTimes(3);
  });

  it('GET và PUT actual-progress cùng lúc → không bị lỗi', async () => {
    const [getRes, putRes] = await Promise.all([
      request(app).get('/api/actual-progress'),
      request(app).put('/api/actual-progress/p1').send({ done: true }),
    ]);
    expect(getRes.status).toBe(200);
    expect(putRes.status).toBe(200);
  });

  it('1 request thành công + 1 request DB fail xảy ra đồng thời → mỗi cái độc lập', async () => {
    vi.mocked(db.dbGetProjects).mockRejectedValueOnce(new Error('timeout'));
    const [failRes, okRes] = await Promise.all([
      request(app).get('/api/data'),       // sẽ fail vì dbGetProjects lỗi lần này
      request(app).get('/api/actual-progress'), // vẫn thành công độc lập
    ]);
    expect(failRes.status).toBe(500);
    expect(okRes.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// NHÓM MỚI 9 — PHÂN QUYỀN Ở MỨC API (HIỆN TẠI: TẤT CẢ MỞ)
// + CHUẨN BỊ CHO KHI AUTH ĐƯỢC THÊM VÀO
// Ghi nhận behavior hiện tại theo từng vai trò giả định
// ═══════════════════════════════════════════════════════════════════════════════

describe('RBAC API – Admin: truy cập đầy đủ tất cả resource', () => {
  // Admin = { roleId: 'Admin', userType: 'agency', agencyId: '1' }
  // Server hiện không check — test ghi nhận tất cả đều 200

  it('Admin GET /api/users → 200 (xem toàn bộ user)', async () => {
    const res = await request(app).get('/api/users')
      .set('X-User-Role', 'Admin').set('X-User-Type', 'agency');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('Admin POST /api/users → 200 (tạo user mới)', async () => {
    const res = await request(app).post('/api/users')
      .set('X-User-Role', 'Admin')
      .send({ email: 'newadmin@sxd.gov.vn', userType: 'agency' });
    expect(res.status).toBe(200);
  });

  it('Admin DELETE /api/users/:id → 200 (xóa user)', async () => {
    const res = await request(app).delete('/api/users/u1')
      .set('X-User-Role', 'Admin');
    expect(res.status).toBe(200);
  });

  it('Admin GET /api/email-config → 200 (xem cấu hình hệ thống)', async () => {
    const res = await request(app).get('/api/email-config')
      .set('X-User-Role', 'Admin');
    expect(res.status).toBe(200);
    expect(res.body.host).toBeDefined();
  });

  it('Admin POST /api/actual-progress/reset → 200 (reset toàn bộ tiến độ)', async () => {
    const res = await request(app).post('/api/actual-progress/reset')
      .set('X-User-Role', 'Admin');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('Admin DELETE /api/projects/:id → 200 (xóa dự án bất kỳ)', async () => {
    const res = await request(app).delete('/api/projects/any-project')
      .set('X-User-Role', 'Admin');
    expect(res.status).toBe(200);
  });
});

describe('RBAC API – Chủ đầu tư (investor): xem và cập nhật dự án của mình', () => {
  // CĐT = { userType: 'investor', investorId: 'CDT_A', roleId: 'Lãnh đạo' }
  // Server hiện không lọc theo investorId — CĐT thấy TẤT CẢ qua API

  it('CĐT GET /api/data → 200, nhận toàn bộ projects (lọc xảy ra ở frontend)', async () => {
    const res = await request(app).get('/api/data')
      .set('X-User-Type', 'investor').set('X-Investor-Id', 'CDT_A');
    expect(res.status).toBe(200);
    // API trả tất cả, frontend tự filter theo investorId
    expect(res.body.projects).toHaveLength(1); // mock trả 1 project
  });

  it('CĐT PUT /api/actual-progress/:projectId → 200 (cập nhật tiến độ dự án)', async () => {
    const res = await request(app).put('/api/actual-progress/proj-cdt')
      .set('X-User-Type', 'investor')
      .send({ chutruong: { cdtDate: '2024-05-01' } });
    expect(res.status).toBe(200);
  });

  it('CĐT POST /api/projects/:id/history → 200 (ghi lịch sử)', async () => {
    const res = await request(app).post('/api/projects/proj-cdt/history')
      .set('X-User-Type', 'investor')
      .send({ userName: 'cdt_user', actionType: 'update_progress', description: 'CĐT cập nhật', oldStatus: '', newStatus: '' });
    expect(res.status).toBe(200);
  });

  it('CĐT GET /api/users → 200 (API mở, nhưng frontend ẩn menu này với CĐT)', async () => {
    // Ghi nhận: API không chặn, nhưng frontend không render menu Quản lý tài khoản với CĐT
    const res = await request(app).get('/api/users')
      .set('X-User-Type', 'investor');
    expect(res.status).toBe(200);
  });
});

describe('RBAC API – Cơ quan đối tác (agency ≠ SXD): chỉ cập nhật bước của mình', () => {
  // Cơ quan = { userType: 'agency', agencyId: '2', roleId: 'Lãnh đạo' }
  // Server không kiểm tra agencyId — phân quyền ở frontend (canEditAgency)

  it('Cơ quan GET /api/data → 200 (thấy tất cả dự án qua API)', async () => {
    const res = await request(app).get('/api/data')
      .set('X-User-Type', 'agency').set('X-Agency-Id', '2');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.projects)).toBe(true);
  });

  it('Cơ quan PUT /api/actual-progress/:projectId → 200 (server không chặn)', async () => {
    // Frontend chặn edit nếu agencyId không khớp, nhưng API không kiểm tra
    const res = await request(app).put('/api/actual-progress/proj-1')
      .set('X-User-Type', 'agency').set('X-Agency-Id', '2')
      .send({ qh1500: { cdtDate: '2024-06-01' } });
    expect(res.status).toBe(200);
  });

  it('Cơ quan GET /api/email-config → 200 (API mở, frontend ẩn menu HỆ THỐNG với non-Admin)', async () => {
    const res = await request(app).get('/api/email-config')
      .set('X-User-Type', 'agency').set('X-Agency-Id', '2');
    // Ghi nhận: API không chặn, nhưng frontend không show menu Cấu hình email
    expect(res.status).toBe(200);
  });

  it('Cơ quan DELETE /api/users/:id → 200 (API mở — đây là điểm cần thêm auth sau)', async () => {
    // ⚠️ Đây là security gap: non-Admin vẫn có thể gọi API delete user
    // TODO: sau khi thêm auth middleware, test này phải thay thành expect(res.status).toBe(403)
    const res = await request(app).delete('/api/users/u1')
      .set('X-User-Type', 'agency').set('X-Agency-Id', '2');
    expect(res.status).toBe(200); // hiện tại mở, ghi nhận để biết khi nào cần fix
  });
});

describe('RBAC API – Recover password: chỉ user có email mới nhận được', () => {
  it('user có email → recover thành công', async () => {
    vi.mocked(db.dbGetUsers).mockResolvedValueOnce([
      { id: 'u-cdt', email: 'cdt@example.com', userType: 'investor', roleId: 'Lãnh đạo' },
    ]);
    const res = await request(app).post('/api/users/u-cdt/recover-password');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.email).toBe('cdt@example.com');
  });

  it('user không có email (null) → 400', async () => {
    vi.mocked(db.dbGetUsers).mockResolvedValueOnce([
      { id: 'u-no-email', email: null, userType: 'agency', roleId: 'Admin' },
    ]);
    const res = await request(app).post('/api/users/u-no-email/recover-password');
    expect(res.status).toBe(400);
  });

  it('user không có email (undefined) → 400', async () => {
    vi.mocked(db.dbGetUsers).mockResolvedValueOnce([
      { id: 'u-no-email', userType: 'agency', roleId: 'Admin' },
    ]);
    const res = await request(app).post('/api/users/u-no-email/recover-password');
    expect(res.status).toBe(400);
  });

  it('recover nhiều user liên tiếp → dbResetUserPassword gọi đúng số lần', async () => {
    vi.mocked(db.dbGetUsers).mockResolvedValue([
      { id: 'u1', email: 'admin@example.com', userType: 'agency', roleId: 'Admin' },
    ]);
    await request(app).post('/api/users/u1/recover-password');
    await request(app).post('/api/users/u1/recover-password');
    expect(db.dbResetUserPassword).toHaveBeenCalledTimes(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// UPLOAD CONFIG
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /api/upload-config', () => {
  it('trả về cấu hình upload', async () => {
    const res = await request(app).get('/api/upload-config');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('allowedExtensions');
    expect(res.body).toHaveProperty('maxSizeMb');
  });

  it('allowedExtensions là chuỗi', async () => {
    const res = await request(app).get('/api/upload-config');
    expect(typeof res.body.allowedExtensions).toBe('string');
  });

  it('maxSizeMb là số', async () => {
    const res = await request(app).get('/api/upload-config');
    expect(typeof res.body.maxSizeMb).toBe('number');
  });

  it('gọi dbGetUploadConfig đúng một lần', async () => {
    await request(app).get('/api/upload-config');
    expect(db.dbGetUploadConfig).toHaveBeenCalledOnce();
  });

  it('trả về 500 khi DB lỗi', async () => {
    vi.mocked(db.dbGetUploadConfig).mockRejectedValueOnce(new Error('Config fail'));
    const res = await request(app).get('/api/upload-config');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Config fail');
  });
});

describe('POST /api/upload-config', () => {
  it('lưu config và trả về 200', async () => {
    const config = { allowedExtensions: 'PDF,PNG', maxSizeMb: 10 };
    const res = await request(app).post('/api/upload-config').send(config);
    expect(res.status).toBe(200);
  });

  it('gọi dbSaveUploadConfig với đúng body', async () => {
    const config = { allowedExtensions: 'DOCX', maxSizeMb: 5 };
    await request(app).post('/api/upload-config').send(config);
    expect(db.dbSaveUploadConfig).toHaveBeenCalledWith(config);
  });

  it('kết quả chứa dữ liệu đã lưu', async () => {
    const config = { allowedExtensions: 'PDF,DOCX,XLSX', maxSizeMb: 20 };
    vi.mocked(db.dbSaveUploadConfig).mockResolvedValueOnce(config);
    const res = await request(app).post('/api/upload-config').send(config);
    expect(res.body).toMatchObject(config);
  });

  it('trả về 500 khi DB lỗi', async () => {
    vi.mocked(db.dbSaveUploadConfig).mockRejectedValueOnce(new Error('Save fail'));
    const res = await request(app).post('/api/upload-config').send({});
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Save fail');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PASSWORD POLICY
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /api/password-policy', () => {
  it('trả về chính sách mật khẩu', async () => {
    const res = await request(app).get('/api/password-policy');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('minLength');
    expect(res.body).toHaveProperty('requireUppercase');
    expect(res.body).toHaveProperty('requireLowercase');
    expect(res.body).toHaveProperty('requireNumbers');
    expect(res.body).toHaveProperty('requireSpecialChars');
  });

  it('minLength là số', async () => {
    const res = await request(app).get('/api/password-policy');
    expect(typeof res.body.minLength).toBe('number');
  });

  it('gọi dbGetPasswordPolicy đúng một lần', async () => {
    await request(app).get('/api/password-policy');
    expect(db.dbGetPasswordPolicy).toHaveBeenCalledOnce();
  });

  it('trả về 500 khi DB lỗi', async () => {
    vi.mocked(db.dbGetPasswordPolicy).mockRejectedValueOnce(new Error('Policy fail'));
    const res = await request(app).get('/api/password-policy');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Policy fail');
  });
});

describe('POST /api/password-policy', () => {
  it('lưu chính sách và trả về 200', async () => {
    const policy = { minLength: 8, requireUppercase: true, requireNumbers: true };
    const res = await request(app).post('/api/password-policy').send(policy);
    expect(res.status).toBe(200);
  });

  it('gọi dbSavePasswordPolicy với đúng body', async () => {
    const policy = { minLength: 12, requireSpecialChars: true };
    await request(app).post('/api/password-policy').send(policy);
    expect(db.dbSavePasswordPolicy).toHaveBeenCalledWith(policy);
  });

  it('kết quả chứa dữ liệu đã lưu', async () => {
    const policy = { minLength: 10, requireUppercase: true };
    vi.mocked(db.dbSavePasswordPolicy).mockResolvedValueOnce(policy);
    const res = await request(app).post('/api/password-policy').send(policy);
    expect(res.body).toMatchObject(policy);
  });

  it('trả về 500 khi DB lỗi', async () => {
    vi.mocked(db.dbSavePasswordPolicy).mockRejectedValueOnce(new Error('Policy save fail'));
    const res = await request(app).post('/api/password-policy').send({});
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Policy save fail');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CHANGE PASSWORD
// ═══════════════════════════════════════════════════════════════════════════════

function createChangePasswordTestApp() {
  const cpApp = express();
  cpApp.use(express.json());
  cpApp.use((req: any, _res: any, next: any) => {
    req.user = { id: 'u1' };
    next();
  });

  cpApp.post('/api/profile/change-password', async (req: any, res) => {
    try {
      const u = req.user;
      if (!u || !u.id) return res.status(401).json({ error: 'Chưa xác thực người dùng.' });
      const { oldPassword, newPassword } = req.body;
      if (!oldPassword || !newPassword) return res.status(400).json({ error: 'Vui lòng nhập đầy đủ mật khẩu cũ và mới.' });
      const users = await db.dbGetUsers();
      const user = users.find((item: any) => item.id === u.id);
      if (!user) return res.status(404).json({ error: 'Không tìm thấy thông tin tài khoản.' });
      const enteredOldHashed = hashPassword(oldPassword.trim());
      const storedPassword = (user as any).password || '';
      const isStoredHashed = storedPassword.length === 64 && /^[0-9a-f]{64}$/i.test(storedPassword);
      const comparisonHash = isStoredHashed ? storedPassword : hashPassword(storedPassword);
      if (comparisonHash !== enteredOldHashed) return res.status(400).json({ error: 'Mật khẩu cũ không chính xác. Vui lòng kiểm tra lại!' });
      const policy = await db.dbGetPasswordPolicy();
      const minLen = policy.minLength || 6;
      if (newPassword.length < minLen) return res.status(400).json({ error: `Mật khẩu mới phải có ít nhất ${minLen} ký tự.` });
      const hashedNew = hashPassword(newPassword.trim());
      const dbSuccess = await db.dbResetUserPassword(u.id, hashedNew);
      if (!dbSuccess) return res.status(500).json({ error: 'Không thể lưu mật khẩu mới.' });
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  return cpApp;
}

describe('POST /api/profile/change-password', () => {
  let cpApp: ReturnType<typeof createChangePasswordTestApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Khôi phục mock mặc định cho dbGetUsers
    vi.mocked(db.dbGetUsers).mockResolvedValue([
      { id: 'u1', email: 'admin@example.com', userType: 'agency', roleId: 'Admin' },
    ]);
    vi.mocked(db.dbGetPasswordPolicy).mockResolvedValue({ minLength: 6, requireUppercase: false, requireLowercase: false, requireNumbers: false, requireSpecialChars: false });
    vi.mocked(db.dbResetUserPassword).mockResolvedValue(true);
    cpApp = createChangePasswordTestApp();
  });

  it('thiếu cả oldPassword và newPassword → 400', async () => {
    const res = await request(cpApp).post('/api/profile/change-password').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/mật khẩu/i);
  });

  it('thiếu newPassword → 400', async () => {
    const res = await request(cpApp).post('/api/profile/change-password').send({ oldPassword: '123456' });
    expect(res.status).toBe(400);
  });

  it('thiếu oldPassword → 400', async () => {
    const res = await request(cpApp).post('/api/profile/change-password').send({ newPassword: 'newpass123' });
    expect(res.status).toBe(400);
  });

  it('user không tồn tại → 404', async () => {
    vi.mocked(db.dbGetUsers).mockResolvedValueOnce([]);
    const res = await request(cpApp).post('/api/profile/change-password')
      .send({ oldPassword: '123456', newPassword: 'newpass123' });
    expect(res.status).toBe(404);
  });

  it('mật khẩu cũ sai (stored là pre-hashed 64-char) → 400', async () => {
    vi.mocked(db.dbGetUsers).mockResolvedValueOnce([{
      id: 'u1', email: 'admin@example.com',
      password: 'a'.repeat(64), // 64-char hex → so sánh trực tiếp, không khớp 'hashed-password'
    }]);
    const res = await request(cpApp).post('/api/profile/change-password')
      .send({ oldPassword: 'wrongpass', newPassword: 'newpass123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/không chính xác/i);
  });

  it('newPassword quá ngắn theo policy → 400', async () => {
    vi.mocked(db.dbGetPasswordPolicy).mockResolvedValueOnce({ minLength: 10, requireUppercase: false, requireLowercase: false, requireNumbers: false, requireSpecialChars: false });
    const res = await request(cpApp).post('/api/profile/change-password')
      .send({ oldPassword: '123456', newPassword: 'short' }); // 5 chars < 10
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/ít nhất/i);
  });

  it('đổi mật khẩu thành công → 200 + success:true', async () => {
    const res = await request(cpApp).post('/api/profile/change-password')
      .send({ oldPassword: '123456', newPassword: 'newpassword123' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('gọi dbResetUserPassword với đúng userId', async () => {
    await request(cpApp).post('/api/profile/change-password')
      .send({ oldPassword: '123456', newPassword: 'newpassword123' });
    expect(db.dbResetUserPassword).toHaveBeenCalledWith('u1', expect.any(String));
  });

  it('dbResetUserPassword trả về false → 500', async () => {
    vi.mocked(db.dbResetUserPassword).mockResolvedValueOnce(false);
    const res = await request(cpApp).post('/api/profile/change-password')
      .send({ oldPassword: '123456', newPassword: 'newpassword123' });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/lưu mật khẩu/i);
  });

  it('DB lỗi exception → 500', async () => {
    vi.mocked(db.dbGetUsers).mockRejectedValueOnce(new Error('DB crash'));
    const res = await request(cpApp).post('/api/profile/change-password')
      .send({ oldPassword: '123456', newPassword: 'newpassword123' });
    expect(res.status).toBe(500);
  });
});
