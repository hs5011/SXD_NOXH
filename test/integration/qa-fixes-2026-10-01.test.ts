/**
 * Regression tests: lỗi phát hiện khi kiểm thử QA trên noxh.vietinfo.tech ngày 01/10/2026
 *   - Địa điểm dạng "Phường X, TP.HCM" phải khớp danh mục "Phường X" (form Sửa không bị trống)
 *   - Đổi tên giá trị danh mục cập nhật luôn các dự án đang dùng (không để dự án mồ côi)
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { matchWardLocation } from '../../src/lib/locationMatch';
import { isValidDateInput } from '../../src/lib/dateInput';

// ═════════════════════════════════════════════════════════════════════════════
describe('isValidDateInput – ngày gõ tay (BUG-12)', () => {
  it('chấp nhận ô trống và ngày có thật dạng dd/mm/yyyy', () => {
    expect(isValidDateInput('')).toBe(true);
    expect(isValidDateInput('15/06/2027')).toBe(true);
    expect(isValidDateInput('29/02/2028')).toBe(true);
    expect(isValidDateInput('1/2/2026')).toBe(true);
  });

  it('từ chối ngày không tồn tại và sai định dạng', () => {
    expect(isValidDateInput('32/13/2026')).toBe(false);
    expect(isValidDateInput('31/02/2026')).toBe(false);
    expect(isValidDateInput('29/02/2027')).toBe(false);
    expect(isValidDateInput('2026-06-15')).toBe(false);
    expect(isValidDateInput('abc')).toBe(false);
  });

  it('chỉ nhận năm (yyyy) khi được phép', () => {
    expect(isValidDateInput('2027')).toBe(false);
    expect(isValidDateInput('2027', true)).toBe(true);
  });
});

const ENV_KEYS = ['DATABASE_URL', 'PGHOST', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
const originalEnv: Record<string, string | undefined> = {};
beforeAll(() => { ENV_KEYS.forEach(k => { originalEnv[k] = process.env[k]; delete process.env[k]; }); });
afterAll(() => { ENV_KEYS.forEach(k => { if (originalEnv[k] !== undefined) process.env[k] = originalEnv[k]; else delete process.env[k]; }); });

// ═════════════════════════════════════════════════════════════════════════════
describe('matchWardLocation – khớp địa điểm cũ với danh mục phường/xã', () => {
  const wards = ['Phường Bình Tân', 'Phường Rạch Dừa', 'Xã Hiệp Phước'];

  it('"Phường Bình Tân, TP.HCM" → "Phường Bình Tân"', () => {
    expect(matchWardLocation('Phường Bình Tân, TP.HCM', wards)).toBe('Phường Bình Tân');
  });

  it('giá trị đã đúng danh mục giữ nguyên, không phân biệt hoa thường/khoảng trắng', () => {
    expect(matchWardLocation('Phường Rạch Dừa', wards)).toBe('Phường Rạch Dừa');
    expect(matchWardLocation('  xã hiệp phước ', wards)).toBe('Xã Hiệp Phước');
  });

  it('không khớp thì trả lại nguyên văn, không làm mất dữ liệu', () => {
    expect(matchWardLocation('Phường Không Có, TP.HCM', wards)).toBe('Phường Không Có, TP.HCM');
  });

  it('rỗng/null trả về chuỗi rỗng', () => {
    expect(matchWardLocation('', wards)).toBe('');
    expect(matchWardLocation(null as any, wards)).toBe('');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
async function getDb() {
  vi.resetModules();
  const db = await import('../../server/db.ts');
  await db.initDatabase(true);
  return db;
}

describe('dbRenameCatalogValue (In-Memory) – đổi tên danh mục cập nhật cả dự án', () => {
  it('đổi tên nhóm dự án: dự án đang dùng nhận tên mới, danh mục đổi theo', async () => {
    const db = await getDb();
    await db.dbUpdateMetadata('projectGroups', ['QA Nhóm X', 'QA Nhóm Y']);
    await db.dbCreateProject({ id: 'qa1', code: 'QA-1', name: 'QA 1', projectGroup: 'QA Nhóm X' });
    await db.dbCreateProject({ id: 'qa2', code: 'QA-2', name: 'QA 2', projectGroup: 'QA Nhóm X' });
    await db.dbCreateProject({ id: 'qa3', code: 'QA-3', name: 'QA 3', projectGroup: 'QA Nhóm Y' });

    await db.dbRenameCatalogValue('projectGroups', 'QA Nhóm X', 'QA Nhóm X (mới)');

    const after = await db.dbGetProjects();
    const groupOf = (id: string) => after.find((p: any) => p.id === id)?.projectGroup;
    expect(groupOf('qa1')).toBe('QA Nhóm X (mới)');
    expect(groupOf('qa2')).toBe('QA Nhóm X (mới)');
    expect(groupOf('qa3')).toBe('QA Nhóm Y');
    expect(await db.dbGetMetadata('projectGroups')).toEqual(['QA Nhóm X (mới)', 'QA Nhóm Y']);
  });

  it('đổi tên nguồn vốn (lưu trong extra) cập nhật dự án đang dùng', async () => {
    const db = await getDb();
    await db.dbUpdateMetadata('fundingSources', ['QA Vốn A']);
    await db.dbCreateProject({ id: 'qa4', code: 'QA-4', name: 'QA 4', fundingSource: 'QA Vốn A' });
    await db.dbRenameCatalogValue('fundingSources', 'QA Vốn A', 'QA Vốn B');
    const p = (await db.dbGetProjects()).find((x: any) => x.id === 'qa4');
    expect(p.fundingSource).toBe('QA Vốn B');
  });

  it('danh mục không hỗ trợ hoặc tên rỗng thì không làm gì', async () => {
    const db = await getDb();
    const before = JSON.stringify(await db.dbGetProjects());
    await db.dbRenameCatalogValue('roles', 'Admin', 'X');
    await db.dbRenameCatalogValue('projectGroups', '', 'X');
    await db.dbRenameCatalogValue('projectGroups', 'Nhóm A', '   ');
    expect(JSON.stringify(await db.dbGetProjects())).toBe(before);
  });

  it('CATALOG_PROJECT_FIELDS khai báo đủ 4 danh mục lưu dạng chữ trên dự án', async () => {
    const db = await getDb();
    expect(Object.keys(db.CATALOG_PROJECT_FIELDS).sort()).toEqual(
      ['buildingGrades', 'fundingSources', 'projectCategories', 'projectGroups']
    );
  });
});
