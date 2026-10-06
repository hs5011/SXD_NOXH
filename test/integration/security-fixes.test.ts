/**
 * Regression tests: các lỗi nghiêm trọng đã sửa ngày 29/09/2026
 *   N1 – Dữ liệu trong cột `extra` bị giá trị cũ ghi đè khi lưu
 *   N2 – Cập nhật danh sách user qua metadata (leo quyền Admin)
 *   N4 – Mật khẩu mặc định "123456" cho tài khoản mẫu / tài khoản mới
 *
 * Chạy ở chế độ In-Memory (giống db.test.ts), không cần DB thật.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { hashPassword } from '../../src/lib/crypto';

const ENV_KEYS = ['DATABASE_URL', 'PGHOST', 'PGDATABASE', 'PGUSER', 'PGPASSWORD', 'SEED_USER_PASSWORD'];
const originalEnv: Record<string, string | undefined> = {};

beforeAll(() => {
  ENV_KEYS.forEach(k => { originalEnv[k] = process.env[k]; delete process.env[k]; });
});

afterAll(() => {
  ENV_KEYS.forEach(k => {
    if (originalEnv[k] !== undefined) process.env[k] = originalEnv[k];
    else delete process.env[k];
  });
});

async function getDb() {
  vi.resetModules();
  const db = await import('../../server/db.ts');
  await db.initDatabase(true);
  return db;
}

// ═════════════════════════════════════════════════════════════════════════════
describe('N1 – extractProjectExtra: giá trị mới thắng giá trị extra cũ', () => {
  it('trường cấp trên cùng (vừa sửa) ghi đè p.extra cũ', async () => {
    const db = await getDb();
    const extra = db.extractProjectExtra({
      totalInvestment: 200,
      extra: { totalInvestment: 100, fundingSource: 'Ngân sách' },
    });
    expect(extra.totalInvestment).toBe(200);
    // Trường không gửi ở cấp trên cùng vẫn giữ giá trị trong extra cũ
    expect(extra.fundingSource).toBe('Ngân sách');
  });

  it('bỏ qua key không nằm trong PROJECT_EXTRA_FIELDS', async () => {
    const db = await getDb();
    const extra = db.extractProjectExtra({ extra: { isAdmin: true, investor: 'X', landStatus: 'Sạch' } });
    expect(extra).toEqual({ landStatus: 'Sạch' });
  });

  it('đọc → sửa → đọc lại: giá trị mới còn nguyên sau khi "tải lại"', async () => {
    const db = await getDb();
    const created = await db.dbCreateProject({
      code: 'N1-001', name: 'Dự án kiểm tra extra', investor: 'CĐT test', location: 'Phường 1',
      progress: 0, totalInvestment: 100, fundingSource: 'Vốn tự có',
      implementationPlan: { chutruong: { cdt: '01/01/2026' } },
    });

    // Lần tải đầu: client nhận project kèm `extra`
    const loaded = (await db.dbGetProjects()).find((p: any) => p.id === created.id);
    expect(loaded.totalInvestment).toBe(100);

    // Client gửi lại toàn bộ object (kèm extra cũ) với giá trị đã sửa
    await db.dbUpdateProject(created.id, {
      ...loaded,
      totalInvestment: 200,
      implementationPlan: { chutruong: { cdt: '15/02/2026' } },
    });

    // "F5": đọc lại từ store
    const reloaded = (await db.dbGetProjects()).find((p: any) => p.id === created.id);
    expect(reloaded.totalInvestment).toBe(200);
    expect(reloaded.implementationPlan).toEqual({ chutruong: { cdt: '15/02/2026' } });
    expect(reloaded.fundingSource).toBe('Vốn tự có');

    // Lưu lần hai (sau khi đã tải lại) cũng không bị hoàn nguyên
    await db.dbUpdateProject(created.id, { ...reloaded, fundingSource: 'Ngân sách' });
    const reloaded2 = (await db.dbGetProjects()).find((p: any) => p.id === created.id);
    expect(reloaded2.fundingSource).toBe('Ngân sách');
    expect(reloaded2.totalInvestment).toBe(200);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('N2 – Không cập nhật user hàng loạt qua metadata', () => {
  it('dbUpdateMetadata("users") bị từ chối với statusCode 400', async () => {
    const db = await getDb();
    const attacker = [{ id: 'x', username: 'hacker', email: 'h@x.vn', roleId: 'Admin', password: 'P@ss' }];
    await expect(db.dbUpdateMetadata('users', attacker)).rejects.toMatchObject({ statusCode: 400 });

    const users = await db.dbGetUsers();
    expect(users.find((u: any) => u.username === 'hacker')).toBeUndefined();
  });

  it('các danh mục khác vẫn cập nhật bình thường', async () => {
    const db = await getDb();
    const list = await db.dbUpdateMetadata('investors', ['CĐT A', 'CĐT B']);
    expect(list).toEqual(expect.arrayContaining(['CĐT A', 'CĐT B']));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('N4 – Không còn mật khẩu mặc định "123456"', () => {
  it('tài khoản mẫu (In-Memory) không dùng mật khẩu 123456 khi chưa đặt SEED_USER_PASSWORD', async () => {
    const db = await getDb();
    const admin = (await db.dbGetUsers()).find((u: any) => u.username === 'admin');
    expect(admin).toBeDefined();
    expect(admin.password).toMatch(/^[0-9a-f]{64}$/i);
    expect(admin.password).not.toBe(hashPassword('123456'));
  });

  it('tài khoản mẫu dùng SEED_USER_PASSWORD khi được cấu hình', async () => {
    process.env.SEED_USER_PASSWORD = 'Seed#Test2026';
    try {
      const db = await getDb();
      const admin = (await db.dbGetUsers()).find((u: any) => u.username === 'admin');
      expect(admin.password).toBe(hashPassword('Seed#Test2026'));
    } finally {
      delete process.env.SEED_USER_PASSWORD;
    }
  });

  it('tạo user không kèm mật khẩu → không nhận mật khẩu 123456', async () => {
    const db = await getDb();
    const created = await db.dbCreateUser({
      id: 'n4-user', username: 'n4user', email: 'n4@test.vn', fullName: 'N4 Test',
      roleId: 'Chuyên viên', userType: 'agency', agencyId: '2', phone: '0912000004',
    });
    expect(created.password).toMatch(/^[0-9a-f]{64}$/i);
    expect(created.password).not.toBe(hashPassword('123456'));
  });
});
