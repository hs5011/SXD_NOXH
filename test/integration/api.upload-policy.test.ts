import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import * as db from '../../server/db.ts';
import { hashPassword } from '../../src/lib/crypto.ts';

vi.mock('../../server/db.ts', () => ({
  dbGetUploadConfig: vi.fn(),
  dbSaveUploadConfig: vi.fn(),
  dbGetPasswordPolicy: vi.fn(),
  dbSavePasswordPolicy: vi.fn(),
  dbGetUsers: vi.fn(),
  dbResetUserPassword: vi.fn().mockResolvedValue(true),
  dbCreateProjectAttachment: vi.fn().mockImplementation(
    (projectId: string, name: string, size: string, fileType: string) =>
      Promise.resolve({ id: 42, projectId, name, size, fileType }),
  ),
}));

vi.mock('../../src/lib/crypto.ts', () => ({
  hashPassword: vi.fn().mockReturnValue('hashed-password'),
}));

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_UPLOAD_CONFIG = { allowedExtensions: 'PDF,DOCX,XLSX', maxSizeMb: 20 };
const DEFAULT_PASSWORD_POLICY = {
  minLength: 6,
  requireUppercase: false,
  requireLowercase: false,
  requireNumbers: false,
  requireSpecialChars: false,
};
const TEST_USER = {
  id: 'test-user-id',
  password: 'hashed-password',
  email: 'test@test.com',
  fullName: 'Test User',
};
// 64-char hex string → isStoredHashed=true → compared directly → won't match 'hashed-password'
const WRONG_STORED_HASH = 'a'.repeat(64);

// ─── App factory ──────────────────────────────────────────────────────────────

function createApp() {
  const app = express();
  app.use(express.json());

  // Inject mock user into every request
  app.use((req: any, _res: any, next: any) => {
    req.user = { id: 'test-user-id' };
    next();
  });

  // Upload config
  app.get('/api/upload-config', async (_req, res: any) => {
    res.json(await db.dbGetUploadConfig());
  });
  app.post('/api/upload-config', async (req, res: any) => {
    res.json(await db.dbSaveUploadConfig(req.body));
  });

  // Upload route — multer replaced by X-Test-* header simulation
  app.post('/api/projects/:id/attachments/upload', async (req: any, res: any) => {
    const fileName = req.headers['x-test-filename'] as string;
    const fileSizeBytes = parseInt((req.headers['x-test-filesize'] as string) || '0', 10);

    if (!fileName) return res.status(400).json({ error: 'No file uploaded' });

    const uploadConfig = await db.dbGetUploadConfig();
    const extension = (fileName.split('.').pop() || 'FILE').toUpperCase();
    const allowedExts = (uploadConfig.allowedExtensions || '')
      .split(',')
      .map((s: string) => s.trim().toUpperCase())
      .filter(Boolean);
    const maxSizeInBytes = (uploadConfig.maxSizeMb || 20) * 1024 * 1024;

    if (allowedExts.length > 0 && !allowedExts.includes(extension)) {
      return res.status(400).json({
        error: `Định dạng tệp .${extension} không được phép tải lên! Các định dạng được cấu hình cho phép: ${uploadConfig.allowedExtensions}`,
      });
    }
    if (fileSizeBytes > maxSizeInBytes) {
      return res.status(400).json({
        error: `Dung lượng tệp vượt quá cấu hình tối đa cho phép (${uploadConfig.maxSizeMb} MB).`,
      });
    }

    const sizeStr =
      fileSizeBytes > 1024 * 1024
        ? `${(fileSizeBytes / (1024 * 1024)).toFixed(1)} MB`
        : `${(fileSizeBytes / 1024).toFixed(0)} KB`;
    const doc = await db.dbCreateProjectAttachment(req.params.id, fileName, sizeStr, extension);
    res.json(doc);
  });

  // Password policy
  app.get('/api/password-policy', async (_req, res: any) => {
    res.json(await db.dbGetPasswordPolicy());
  });
  app.post('/api/password-policy', async (req, res: any) => {
    res.json(await db.dbSavePasswordPolicy(req.body));
  });

  // Change password — full logic from server.ts
  app.post('/api/profile/change-password', async (req: any, res: any) => {
    const u = req.user;
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword)
      return res.status(400).json({ error: 'Vui lòng nhập đầy đủ mật khẩu cũ và mới.' });

    const users = await db.dbGetUsers();
    const user = (users as any[]).find((item: any) => item.id === u.id);
    if (!user) return res.status(404).json({ error: 'Không tìm thấy thông tin tài khoản.' });

    const enteredOldHashed = hashPassword(oldPassword.trim());
    const storedPassword = user.password || '';
    const isStoredHashed =
      storedPassword.length === 64 && /^[0-9a-f]{64}$/i.test(storedPassword);
    const comparisonHash = isStoredHashed ? storedPassword : hashPassword(storedPassword);
    if (comparisonHash !== enteredOldHashed)
      return res
        .status(400)
        .json({ error: 'Mật khẩu cũ không chính xác. Vui lòng kiểm tra lại!' });

    const policy = await db.dbGetPasswordPolicy();
    if (newPassword.length < (policy.minLength || 6))
      return res
        .status(400)
        .json({ error: `Mật khẩu mới phải có ít nhất ${policy.minLength} ký tự.` });
    if (policy.requireUppercase && !/[A-Z]/.test(newPassword))
      return res
        .status(400)
        .json({ error: 'Mật khẩu mới phải chứa ít nhất một chữ cái in hoa (A-Z).' });
    if (policy.requireLowercase && !/[a-z]/.test(newPassword))
      return res
        .status(400)
        .json({ error: 'Mật khẩu mới phải chứa ít nhất một chữ cái thường (a-z).' });
    if (policy.requireNumbers && !/[0-9]/.test(newPassword))
      return res
        .status(400)
        .json({ error: 'Mật khẩu mới phải chứa ít nhất một chữ số (0-9).' });
    if (policy.requireSpecialChars && !/[!@#$%&*]/.test(newPassword))
      return res.status(400).json({
        error: 'Mật khẩu mới phải chứa ít nhất một ký tự đặc biệt (ví dụ: ! @ # $ % & *).',
      });

    await db.dbResetUserPassword(u.id, hashPassword(newPassword.trim()));
    res.json({ success: true });
  });

  return app;
}

// ─── State ────────────────────────────────────────────────────────────────────

let app: ReturnType<typeof createApp>;

beforeEach(() => {
  vi.clearAllMocks();
  app = createApp();
  vi.mocked(db.dbGetUploadConfig).mockResolvedValue({ ...DEFAULT_UPLOAD_CONFIG });
  vi.mocked(db.dbSaveUploadConfig).mockImplementation((c: any) => Promise.resolve(c));
  vi.mocked(db.dbGetPasswordPolicy).mockResolvedValue({ ...DEFAULT_PASSWORD_POLICY });
  vi.mocked(db.dbSavePasswordPolicy).mockImplementation((p: any) => Promise.resolve(p));
  vi.mocked(db.dbGetUsers).mockResolvedValue([{ ...TEST_USER }]);
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uploadFile(fileName: string, fileSizeBytes: number, projectId = 'proj-1') {
  return request(app)
    .post(`/api/projects/${projectId}/attachments/upload`)
    .set('X-Test-Filename', fileName)
    .set('X-Test-Filesize', String(fileSizeBytes));
}

function changePassword(oldPassword: string, newPassword: string) {
  return request(app)
    .post('/api/profile/change-password')
    .send({ oldPassword, newPassword });
}

// ─── NHÓM A1 – Upload với cấu hình mặc định ──────────────────────────────────

describe('NHÓM A1 – Upload với cấu hình mặc định (PDF,DOCX,XLSX / 20MB)', () => {
  it('ATTACH-01: upload file PDF hợp lệ → 200', async () => {
    const res = await uploadFile('baocao.pdf', 1 * 1024 * 1024);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'baocao.pdf' });
  });

  it('ATTACH-02: upload file EXE bị từ chối → 400', async () => {
    const res = await uploadFile('malware.exe', 100 * 1024);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('.EXE');
  });

  it('ATTACH-03: upload file vượt quá 20MB → 400', async () => {
    const res = await uploadFile('large.pdf', 21 * 1024 * 1024);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('20 MB');
  });

  it('ATTACH-04: không gửi file (thiếu header) → 400', async () => {
    const res = await request(app).post('/api/projects/proj-1/attachments/upload');
    expect(res.status).toBe(400);
  });

  it('ATTACH-05: upload thành công gọi dbCreateProjectAttachment với đúng tham số', async () => {
    await uploadFile('report.docx', 500 * 1024, 'proj-99');
    expect(db.dbCreateProjectAttachment).toHaveBeenCalledWith(
      'proj-99',
      'report.docx',
      expect.any(String),
      'DOCX',
    );
  });
});

// ─── NHÓM A2 – Thay đổi allowedExtensions ────────────────────────────────────

describe('NHÓM A2 – Thay đổi cấu hình allowedExtensions', () => {
  it('UPCFG-01: cấu hình mặc định cho phép PDF → upload PDF thành công', async () => {
    const res = await uploadFile('file.pdf', 1 * 1024 * 1024);
    expect(res.status).toBe(200);
  });

  it('UPCFG-02: cấu hình mặc định KHÔNG cho phép EXE → upload EXE bị từ chối', async () => {
    const res = await uploadFile('file.exe', 1 * 1024 * 1024);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('PDF,DOCX,XLSX');
  });

  it('UPCFG-03: thêm EXE vào allowedExtensions → upload EXE thành công', async () => {
    vi.mocked(db.dbGetUploadConfig).mockResolvedValue({
      allowedExtensions: 'PDF,DOCX,XLSX,EXE',
      maxSizeMb: 20,
    });
    const res = await uploadFile('app.exe', 500 * 1024);
    expect(res.status).toBe(200);
  });

  it('UPCFG-04: xóa PDF khỏi allowedExtensions → upload PDF bị từ chối', async () => {
    vi.mocked(db.dbGetUploadConfig).mockResolvedValue({
      allowedExtensions: 'DOCX,XLSX',
      maxSizeMb: 20,
    });
    const res = await uploadFile('report.pdf', 500 * 1024);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('.PDF');
  });

  it('UPCFG-08: allowedExtensions rỗng → mọi định dạng đều được phép', async () => {
    vi.mocked(db.dbGetUploadConfig).mockResolvedValue({ allowedExtensions: '', maxSizeMb: 20 });
    const res = await uploadFile('anything.xyz', 100 * 1024);
    expect(res.status).toBe(200);
  });

  it('UPCFG-09: kiểm tra không phân biệt hoa/thường — upload "file.PDF" với config "pdf" → 200', async () => {
    vi.mocked(db.dbGetUploadConfig).mockResolvedValue({
      allowedExtensions: 'pdf,docx',
      maxSizeMb: 20,
    });
    const res = await uploadFile('REPORT.PDF', 100 * 1024);
    expect(res.status).toBe(200);
  });
});

// ─── NHÓM A3 – Thay đổi maxSizeMb ────────────────────────────────────────────

describe('NHÓM A3 – Thay đổi cấu hình maxSizeMb', () => {
  it('UPCFG-05: giảm giới hạn xuống 5MB → upload 8MB bị từ chối', async () => {
    vi.mocked(db.dbGetUploadConfig).mockResolvedValue({
      allowedExtensions: 'PDF,DOCX,XLSX',
      maxSizeMb: 5,
    });
    const res = await uploadFile('big.pdf', 8 * 1024 * 1024);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('5 MB');
  });

  it('UPCFG-06: tăng giới hạn lên 20MB → upload 8MB thành công', async () => {
    vi.mocked(db.dbGetUploadConfig).mockResolvedValue({
      allowedExtensions: 'PDF,DOCX,XLSX',
      maxSizeMb: 20,
    });
    const res = await uploadFile('medium.pdf', 8 * 1024 * 1024);
    expect(res.status).toBe(200);
  });

  it('UPCFG-07: giảm giới hạn xuống 3MB → upload 5MB bị từ chối', async () => {
    vi.mocked(db.dbGetUploadConfig).mockResolvedValue({
      allowedExtensions: 'PDF,DOCX,XLSX',
      maxSizeMb: 3,
    });
    const res = await uploadFile('report.pdf', 5 * 1024 * 1024);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('3 MB');
  });
});

// ─── NHÓM B1 – Đổi mật khẩu cơ bản ──────────────────────────────────────────

describe('NHÓM B1 – Đổi mật khẩu cơ bản', () => {
  it('CHPWD-08: sai mật khẩu cũ → 400', async () => {
    // Store WRONG_STORED_HASH: 64 hex chars → isStoredHashed=true → compared directly
    // hashPassword mock returns 'hashed-password' which never equals 'aaa...'
    vi.mocked(db.dbGetUsers).mockResolvedValue([
      { ...TEST_USER, password: WRONG_STORED_HASH },
    ]);
    const res = await changePassword('wrongOldPassword', 'NewPass123');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Mật khẩu cũ không chính xác');
  });

  it('CHPWD-09: mật khẩu mới quá ngắn (< 6 ký tự) → 400', async () => {
    const res = await changePassword('correctOldPass', 'abc');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('ít nhất 6 ký tự');
  });

  it('CHPWD-13: đổi mật khẩu hợp lệ → 200', async () => {
    const res = await changePassword('correctOldPass', 'NewValidPass1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ─── NHÓM B2 – Thay đổi minLength ────────────────────────────────────────────

describe('NHÓM B2 – Thay đổi cấu hình minLength', () => {
  it('PWPOL-01: minLength mặc định 6 → mật khẩu 6 ký tự được chấp nhận', async () => {
    const res = await changePassword('correctOldPass', 'abc123');
    expect(res.status).toBe(200);
  });

  it('PWPOL-02: tăng minLength lên 10 → mật khẩu 6 ký tự bị từ chối', async () => {
    vi.mocked(db.dbGetPasswordPolicy).mockResolvedValue({
      ...DEFAULT_PASSWORD_POLICY,
      minLength: 10,
    });
    const res = await changePassword('correctOldPass', 'abc123');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('ít nhất 10 ký tự');
  });

  it('PWPOL-03: minLength = 10 → mật khẩu 10 ký tự được chấp nhận', async () => {
    vi.mocked(db.dbGetPasswordPolicy).mockResolvedValue({
      ...DEFAULT_PASSWORD_POLICY,
      minLength: 10,
    });
    const res = await changePassword('correctOldPass', 'abcdef1234');
    expect(res.status).toBe(200);
  });
});

// ─── NHÓM B3 – Bật requireUppercase ──────────────────────────────────────────

describe('NHÓM B3 – Bật/tắt requireUppercase', () => {
  it('PWPOL-04/CHPWD-10: bật requireUppercase → mật khẩu không có chữ hoa bị từ chối', async () => {
    vi.mocked(db.dbGetPasswordPolicy).mockResolvedValue({
      ...DEFAULT_PASSWORD_POLICY,
      requireUppercase: true,
    });
    const res = await changePassword('correctOldPass', 'abcdef123');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('chữ cái in hoa');
  });

  it('PWPOL-05: bật requireUppercase → mật khẩu có chữ hoa được chấp nhận', async () => {
    vi.mocked(db.dbGetPasswordPolicy).mockResolvedValue({
      ...DEFAULT_PASSWORD_POLICY,
      requireUppercase: true,
    });
    const res = await changePassword('correctOldPass', 'Abcdef123');
    expect(res.status).toBe(200);
  });

  it('PWPOL-12: tắt requireUppercase → mật khẩu không có chữ hoa vẫn được chấp nhận', async () => {
    vi.mocked(db.dbGetPasswordPolicy).mockResolvedValue({
      ...DEFAULT_PASSWORD_POLICY,
      requireUppercase: false,
    });
    const res = await changePassword('correctOldPass', 'abcdef123');
    expect(res.status).toBe(200);
  });
});

// ─── NHÓM B4 – Bật requireNumbers ────────────────────────────────────────────

describe('NHÓM B4 – Bật requireNumbers', () => {
  it('PWPOL-06/CHPWD-11: bật requireNumbers → mật khẩu không có số bị từ chối', async () => {
    vi.mocked(db.dbGetPasswordPolicy).mockResolvedValue({
      ...DEFAULT_PASSWORD_POLICY,
      requireNumbers: true,
    });
    const res = await changePassword('correctOldPass', 'AbcdefGHI');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('chữ số');
  });

  it('PWPOL-07: bật requireNumbers → mật khẩu có số được chấp nhận', async () => {
    vi.mocked(db.dbGetPasswordPolicy).mockResolvedValue({
      ...DEFAULT_PASSWORD_POLICY,
      requireNumbers: true,
    });
    const res = await changePassword('correctOldPass', 'Abcdef123');
    expect(res.status).toBe(200);
  });
});

// ─── NHÓM B5 – Bật requireSpecialChars ───────────────────────────────────────

describe('NHÓM B5 – Bật requireSpecialChars', () => {
  it('PWPOL-08/CHPWD-12: bật requireSpecialChars → mật khẩu không có ký tự đặc biệt bị từ chối', async () => {
    vi.mocked(db.dbGetPasswordPolicy).mockResolvedValue({
      ...DEFAULT_PASSWORD_POLICY,
      requireSpecialChars: true,
    });
    const res = await changePassword('correctOldPass', 'Abcdef123');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('ký tự đặc biệt');
  });

  it('PWPOL-09: bật requireSpecialChars → mật khẩu có ký tự đặc biệt được chấp nhận', async () => {
    vi.mocked(db.dbGetPasswordPolicy).mockResolvedValue({
      ...DEFAULT_PASSWORD_POLICY,
      requireSpecialChars: true,
    });
    const res = await changePassword('correctOldPass', 'Abcdef1@');
    expect(res.status).toBe(200);
  });
});

// ─── NHÓM B6 – Bật requireLowercase ──────────────────────────────────────────

describe('NHÓM B6 – Bật requireLowercase', () => {
  it('PWPOL-13: bật requireLowercase → mật khẩu toàn chữ hoa bị từ chối', async () => {
    vi.mocked(db.dbGetPasswordPolicy).mockResolvedValue({
      ...DEFAULT_PASSWORD_POLICY,
      requireLowercase: true,
    });
    const res = await changePassword('correctOldPass', 'ABCDEF123');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('chữ cái thường');
  });
});

// ─── NHÓM B7 – Kết hợp tất cả quy tắc ───────────────────────────────────────

describe('NHÓM B7 – Kết hợp tất cả quy tắc mật khẩu', () => {
  const FULL_POLICY = {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
  };

  it('PWPOL-10: bật tất cả quy tắc → mật khẩu "Abc1!" bị từ chối do quá ngắn (< 8 ký tự)', async () => {
    vi.mocked(db.dbGetPasswordPolicy).mockResolvedValue(FULL_POLICY);
    const res = await changePassword('correctOldPass', 'Abc1!');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('ít nhất 8 ký tự');
  });

  it('PWPOL-11: bật tất cả quy tắc → "Abcdef1!" đủ điều kiện → 200', async () => {
    vi.mocked(db.dbGetPasswordPolicy).mockResolvedValue(FULL_POLICY);
    const res = await changePassword('correctOldPass', 'Abcdef1!');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
