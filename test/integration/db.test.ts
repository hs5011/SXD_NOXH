/**
 * Integration Tests: DB Layer (In-Memory Fallback mode)
 *
 * Cách hoạt động:
 *   - Xóa DATABASE_URL, PGHOST, PGDATABASE khỏi process.env
 *   - vi.resetModules() + dynamic import → mỗi describe block có module db mới
 *   - initDatabase() phát hiện không có config → dùng In-Memory Fallback
 *   - Toàn bộ CRUD thao tác trên memoryStore (không cần DB thật)
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// Lưu env gốc để restore sau khi test xong
const originalEnv: Record<string, string | undefined> = {};

beforeAll(() => {
  originalEnv.DATABASE_URL = process.env.DATABASE_URL;
  originalEnv.PGHOST = process.env.PGHOST;
  originalEnv.PGDATABASE = process.env.PGDATABASE;
  originalEnv.PGUSER = process.env.PGUSER;
  originalEnv.PGPASSWORD = process.env.PGPASSWORD;

  // Force in-memory mode
  delete process.env.DATABASE_URL;
  delete process.env.PGHOST;
  delete process.env.PGDATABASE;
  delete process.env.PGUSER;
  delete process.env.PGPASSWORD;
});

afterAll(() => {
  // Restore env
  Object.entries(originalEnv).forEach(([k, v]) => {
    if (v !== undefined) process.env[k] = v;
    else delete process.env[k];
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getDb() {
  vi.resetModules();
  const db = await import('../../server/db.ts');
  await db.initDatabase(true);
  return db;
}

const sampleProject = {
  code: 'INTTEST-001',
  name: 'Du an integration test',
  investor: 'Chu dau tu test',
  location: 'Quan 1',
  totalArea: 3000,
  height: 8,
  apartmentCount: 80,
  progress: 0,
  status: 'Chua trien khai',
  projectGroup: 'Nha o xa hoi',
  stage: 'CHUAN BI DAU TU',
  isKeyProject: false,
  isPublicInvestment: false,
  processId: '',
};

const sampleUser = {
  email: 'inttest@example.com',
  password: 'Pass1234',
  fullName: 'Integration Test User',
  roleId: 'Chuyen vien',
  userType: 'agency',
  agencyId: '1',
};

// ═════════════════════════════════════════════════════════════════════════════
// initDatabase
// ═════════════════════════════════════════════════════════════════════════════
describe('initDatabase – In-Memory mode', () => {
  it('trả về mode = "In-Memory Fallback" khi không có config DB', async () => {
    const db = await getDb();
    const result = await db.initDatabase(true);
    expect(result.isDbConnected).toBe(false);
    expect(result.mode).toBe('In-Memory Fallback');
  });

  it('getDbStatus phản ánh trạng thái in-memory', async () => {
    const db = await getDb();
    const status = db.getDbStatus();
    expect(status.connected).toBe(false);
    expect(status.mode).toBe('In-Memory Fallback');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Projects CRUD
// ═════════════════════════════════════════════════════════════════════════════
describe('Projects CRUD – In-Memory', () => {
  // Không còn dự án mẫu: khi không có DB, danh sách dự án rỗng (không hiển thị dữ liệu giả)
  it('dbGetProjects ban đầu trả về mảng RỖNG (không có dự án mẫu)', async () => {
    const db = await getDb();
    const projects = await db.dbGetProjects();
    expect(Array.isArray(projects)).toBe(true);
    expect(projects.length).toBe(0);
  });

  it('dbCreateProject tạo project mới với id tự sinh', async () => {
    const db = await getDb();
    const created = await db.dbCreateProject(sampleProject);
    expect(created.id).toBeTruthy();
    expect(created.code).toBe('INTTEST-001');
    expect(created.name).toBe('Du an integration test');
  });

  it('dbCreateProject thêm vào danh sách', async () => {
    const db = await getDb();
    const before = (await db.dbGetProjects()).length;
    await db.dbCreateProject(sampleProject);
    const after = (await db.dbGetProjects()).length;
    expect(after).toBe(before + 1);
  });

  it('dbCreateProject tôn trọng id nếu được truyền vào', async () => {
    const db = await getDb();
    const created = await db.dbCreateProject({ ...sampleProject, id: 'custom-id-xyz' });
    expect(created.id).toBe('custom-id-xyz');
  });

  it('dbUpdateProject cập nhật đúng trường', async () => {
    const db = await getDb();
    const created = await db.dbCreateProject(sampleProject);
    const updated = await db.dbUpdateProject(created.id, { ...sampleProject, progress: 75, status: 'Dang trien khai' });
    expect(updated.progress).toBe(75);
    expect(updated.status).toBe('Dang trien khai');
    expect(updated.id).toBe(created.id);
  });

  it('dbDeleteProject xóa project và trả về true', async () => {
    const db = await getDb();
    const created = await db.dbCreateProject(sampleProject);
    const result = await db.dbDeleteProject(created.id);
    expect(result).toBe(true);
  });

  it('dbDeleteProject giảm số lượng project', async () => {
    const db = await getDb();
    const created = await db.dbCreateProject(sampleProject);
    const before = (await db.dbGetProjects()).length;
    await db.dbDeleteProject(created.id);
    const after = (await db.dbGetProjects()).length;
    expect(after).toBe(before - 1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Users CRUD
// ═════════════════════════════════════════════════════════════════════════════
describe('Users CRUD – In-Memory', () => {
  it('dbGetUsers trả về dữ liệu ban đầu không rỗng', async () => {
    const db = await getDb();
    const users = await db.dbGetUsers();
    expect(Array.isArray(users)).toBe(true);
    expect(users.length).toBeGreaterThan(0);
  });

  it('dbCreateUser tạo user mới với id', async () => {
    const db = await getDb();
    const created = await db.dbCreateUser(sampleUser);
    expect(created.id).toBeTruthy();
    expect(created.email).toBe('inttest@example.com');
  });

  it('dbCreateUser thêm vào danh sách', async () => {
    const db = await getDb();
    const before = (await db.dbGetUsers()).length;
    await db.dbCreateUser(sampleUser);
    const after = (await db.dbGetUsers()).length;
    expect(after).toBe(before + 1);
  });

  it('dbUpdateUser cập nhật đúng trường', async () => {
    const db = await getDb();
    const created = await db.dbCreateUser(sampleUser);
    const updated = await db.dbUpdateUser(created.id, { ...sampleUser, fullName: 'Updated Name' });
    expect(updated.fullName).toBe('Updated Name');
    expect(updated.id).toBe(created.id);
  });

  it('dbDeleteUser xóa user và trả về true', async () => {
    const db = await getDb();
    const created = await db.dbCreateUser(sampleUser);
    const result = await db.dbDeleteUser(created.id);
    expect(result).toBe(true);
  });

  it('dbDeleteUser giảm số lượng user', async () => {
    const db = await getDb();
    const created = await db.dbCreateUser(sampleUser);
    const before = (await db.dbGetUsers()).length;
    await db.dbDeleteUser(created.id);
    const after = (await db.dbGetUsers()).length;
    expect(after).toBe(before - 1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Actual Progress
// ═════════════════════════════════════════════════════════════════════════════
describe('Actual Progress – In-Memory', () => {
  it('dbGetActualProgress ban đầu trả về object RỖNG (không có tiến độ mẫu)', async () => {
    const db = await getDb();
    const result = await db.dbGetActualProgress();
    expect(typeof result).toBe('object');
    expect(Object.keys(result).length).toBe(0);
  });

  it('dbResetActualProgress xóa sạch tiến độ, không nạp lại dữ liệu mẫu', async () => {
    const db = await getDb();
    await db.dbUpdateActualProgress('p-x', { chutruong: { cdtDate: '01/01/2026' } });
    await db.dbResetActualProgress();
    expect(Object.keys(await db.dbGetActualProgress()).length).toBe(0);
  });

  it('dbUpdateActualProgress lưu và trả về dữ liệu', async () => {
    const db = await getDb();
    const data = { chutruong: { cdtDate: '2024-01-01', nnDate: '2024-02-01' } };
    const result = await db.dbUpdateActualProgress('test-proj-id', data);
    expect(result.chutruong.cdtDate).toBe('2024-01-01');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Metadata
// ═════════════════════════════════════════════════════════════════════════════
describe('Metadata – In-Memory', () => {
  it('dbGetMetadata trả về dữ liệu cho key "investors"', async () => {
    const db = await getDb();
    const result = await db.dbGetMetadata('investors');
    expect(Array.isArray(result)).toBe(true);
  });

  it('dbUpdateMetadata cập nhật và trả về list mới', async () => {
    const db = await getDb();
    const newList = ['Chu dau tu A', 'Chu dau tu B'];
    const result = await db.dbUpdateMetadata('investors', newList);
    expect(result).toEqual(newList);
  });

  it('dbGetAllMetadata trả về object chứa nhiều key', async () => {
    const db = await getDb();
    const result = await db.dbGetAllMetadata();
    expect(typeof result).toBe('object');
    expect(Object.keys(result).length).toBeGreaterThan(0);
  });
});
