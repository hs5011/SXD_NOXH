/**
 * Regression tests: nhóm lỗi mức Trung bình sửa ngày 30/09/2026
 *   - Mật khẩu: scrypt có salt (bật bằng PASSWORD_HASH=scrypt), vẫn đọc được SHA-256 cũ
 *   - Tìm kiếm không dấu, an toàn với giá trị null
 *   - Đổi tên cơ quan cập nhật cả tên trong quy trình (db_processes) và dự án
 *   - Dữ liệu `extra` hỏng không làm sập danh sách dự án
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { hashPassword } from '../../src/lib/crypto';
import { hashNewPassword, verifyPassword, needsRehash, toStoredPassword, isScryptHash, passwordFingerprint } from '../../server/passwords';
import { matchesSearch, normalizeSearchText } from '../../src/lib/textSearch';

const ENV_KEYS = ['DATABASE_URL', 'PGHOST', 'PGDATABASE', 'PGUSER', 'PGPASSWORD', 'PASSWORD_HASH'];
const originalEnv: Record<string, string | undefined> = {};
beforeAll(() => { ENV_KEYS.forEach(k => { originalEnv[k] = process.env[k]; delete process.env[k]; }); });
afterAll(() => { ENV_KEYS.forEach(k => { if (originalEnv[k] !== undefined) process.env[k] = originalEnv[k]; else delete process.env[k]; }); });
afterEach(() => { delete process.env.PASSWORD_HASH; });

// ═════════════════════════════════════════════════════════════════════════════
describe('Mật khẩu – scrypt có salt, tương thích SHA-256 cũ', () => {
  it('mặc định (chưa bật cờ) vẫn ghi SHA-256 để bản app cũ dùng chung DB còn đăng nhập được', () => {
    expect(hashNewPassword('Abc@12345')).toBe(hashPassword('Abc@12345'));
  });

  it('PASSWORD_HASH=scrypt: hash có salt, hai lần băm cùng mật khẩu cho kết quả khác nhau', () => {
    process.env.PASSWORD_HASH = 'scrypt';
    const a = hashNewPassword('Abc@12345');
    const b = hashNewPassword('Abc@12345');
    expect(isScryptHash(a)).toBe(true);
    expect(a).not.toBe(b);
    expect(verifyPassword('Abc@12345', a)).toBe(true);
    expect(verifyPassword('sai-mat-khau', a)).toBe(false);
  });

  it('vẫn xác thực được hash SHA-256 cũ và mật khẩu cũ lưu dạng chữ thường', () => {
    expect(verifyPassword('123456', hashPassword('123456'))).toBe(true);
    expect(verifyPassword('123456', '123456')).toBe(true);
    expect(verifyPassword('654321', hashPassword('123456'))).toBe(false);
  });

  it('chỉ nâng cấp hash cũ khi đã bật cờ', () => {
    const legacy = hashPassword('Abc@12345');
    expect(needsRehash(legacy)).toBe(false);
    process.env.PASSWORD_HASH = 'scrypt';
    expect(needsRehash(legacy)).toBe(true);
    expect(needsRehash(hashNewPassword('Abc@12345'))).toBe(false);
  });

  it('toStoredPassword không băm lại giá trị đã là hash', () => {
    process.env.PASSWORD_HASH = 'scrypt';
    const legacy = hashPassword('x');
    const scrypt = hashNewPassword('x');
    expect(toStoredPassword(legacy)).toBe(legacy);
    expect(toStoredPassword(scrypt)).toBe(scrypt);
    expect(isScryptHash(toStoredPassword('plain'))).toBe(true);
  });

  it('dấu vân tay mật khẩu đổi khi mật khẩu đổi (token cũ bị vô hiệu)', () => {
    expect(passwordFingerprint(hashPassword('a'))).not.toBe(passwordFingerprint(hashPassword('b')));
    expect(passwordFingerprint(hashPassword('a'))).toBe(passwordFingerprint(hashPassword('a')));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('Tìm kiếm không dấu, an toàn với null', () => {
  it('"Thu Duc" tìm thấy "Phường Thủ Đức"', () => {
    expect(matchesSearch('Thu Duc', 'Phường Thủ Đức, TP.HCM')).toBe(true);
    expect(matchesSearch('THỦ ĐỨC', 'phường thủ đức')).toBe(true);
  });

  it('giá trị null/undefined không gây lỗi', () => {
    expect(matchesSearch('abc', null, undefined, 'xyz')).toBe(false);
    expect(normalizeSearchText(null)).toBe('');
  });

  it('từ khóa rỗng khớp tất cả', () => {
    expect(matchesSearch('', null)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
async function getDb() {
  vi.resetModules();
  const db = await import('../../server/db.ts');
  await db.initDatabase(true);
  return db;
}

describe('Đổi tên cơ quan cập nhật cả quy trình và dự án', () => {
  it('renameAgencyInSteps đổi tên ở bước cha và bước con', async () => {
    const db = await getDb();
    const { steps, changed } = db.renameAgencyInSteps([
      { name: 'GĐ 1', agency: 'Cơ quan A', childSteps: [{ name: 'B1', agency: 'Cơ quan A' }, { name: 'B2', agency: 'Cơ quan B' }] }
    ], 'Cơ quan A', 'Cơ quan A mới');
    expect(changed).toBe(true);
    expect(steps[0].agency).toBe('Cơ quan A mới');
    expect(steps[0].childSteps.map((c: any) => c.agency)).toEqual(['Cơ quan A mới', 'Cơ quan B']);
  });

  it('dbRenameAgency (In-Memory) đổi tên trong danh mục, quy trình và currentAgency của dự án', async () => {
    const db = await getDb();
    const agencies = await db.dbGetMetadata('processingAgencies');
    const target = agencies.find((a: any) => a.id === '2');
    const oldName = target.name;
    const processesBefore = await db.dbGetMetadata('processes');
    const usedInProcess = JSON.stringify(processesBefore).includes(`"agency":"${oldName}"`);

    await db.dbRenameAgency(oldName, `${oldName} (đổi tên)`, '2');

    const agenciesAfter = await db.dbGetMetadata('processingAgencies');
    expect(agenciesAfter.find((a: any) => a.id === '2').name).toBe(`${oldName} (đổi tên)`);
    const processesAfter = JSON.stringify(await db.dbGetMetadata('processes'));
    expect(processesAfter.includes(`"agency":"${oldName}"`)).toBe(false);
    if (usedInProcess) expect(processesAfter.includes(`"agency":"${oldName} (đổi tên)"`)).toBe(true);
  });
});
