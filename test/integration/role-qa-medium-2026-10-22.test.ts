/**
 * Regression tests: lỗi Medium (validate API, tham chiếu danh mục, upload mồ côi) của đợt QA theo role
 * ngày 22/10/2026 (QA_BAO_CAO_THEO_ROLE_2026-10-22.md). Chạy CHÍNH server.ts ở chế độ In-Memory.
 *
 *   M1 PUT /api/metadata/:key: key phải là danh mục có thật, body phải là danh sách hợp lệ
 *   M2 Dự án: tham chiếu danh mục (chủ đầu tư, nhóm, quy trình...), độ dài, khoảng số
 *   M3 Tài khoản: vai trò theo danh mục, tên đăng nhập, chủ đầu tư, trường lạ, mật khẩu, tự đổi cơ quan
 *   M4 Upload: tên quá dài / không có đuôi bị từ chối và không để lại bản ghi mồ côi; tệp nhỏ hiện "n B"
 *   M5 Lịch sử và PM2 không nhận body rỗng
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, execSync, type ChildProcess } from 'child_process';
import path from 'path';

const PORT = 3111;
const B = `http://127.0.0.1:${PORT}`;
const PW = 'RoleQaMedium2026';
const INVESTOR = 'Công ty CP ĐTXD Xuân Mai Sài Gòn';

let server: ChildProcess;
const T: Record<string, string> = {};

async function call(token: string | null, method: string, url: string, body?: any) {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = 'Bearer ' + token;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(B + url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  let j: any = null;
  try { j = await r.json(); } catch { /* non-JSON */ }
  return { s: r.status, j, e: j?.error as string | undefined };
}
async function upload(token: string, projectId: string, name: string, content: string) {
  const form = new FormData();
  form.append('file', new Blob([content]), name);
  const r = await fetch(`${B}/api/projects/${projectId}/attachments/upload`, { method: 'POST', headers: { authorization: 'Bearer ' + token }, body: form });
  let j: any = null;
  try { j = await r.json(); } catch { /* non-JSON */ }
  return { s: r.status, j, e: j?.error as string | undefined };
}
const login = async (username: string, password = PW) =>
  (await call(null, 'POST', '/api/login', { username, password })).j?.token as string;
const getData = async (token = T.admin) => (await call(token, 'GET', '/api/data')).j;

let projectId = '';

beforeAll(async () => {
  const root = path.resolve(__dirname, '../..');
  server = spawn('npx', ['tsx', 'server.ts'], {
    cwd: root,
    shell: true,
    env: {
      ...process.env,
      DATABASE_URL: 'MY_DATABASE_URL',             // In-Memory: không bao giờ chạm DB thật
      PGHOST: '', PGDATABASE: '',
      NODE_ENV: 'production',
      PORT: String(PORT),
      SEED_USER_PASSWORD: PW,
      JWT_SECRET: 'role-qa-medium-test-secret-0123456789abcdef0123456789'
    },
    stdio: 'ignore'
  });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(B + '/api/health')).ok) break; } catch { /* starting */ }
    await new Promise(r => setTimeout(r, 1000));
  }
  for (const u of ['admin', 'sxd']) T[u] = await login(u);
  const c = await call(T.admin, 'POST', '/api/projects', {
    investor: INVESTOR, location: 'Phường Bình Đông', projectCategory: 'Khác', processId: 'p1', code: 'QM-1', name: 'Dự án QM-1'
  });
  projectId = c.j?.id;
}, 120_000);

afterAll(() => {
  if (!server?.pid) return;
  if (process.platform === 'win32') {
    try { execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: 'ignore' }); } catch { /* already gone */ }
  } else {
    server.kill('SIGTERM');
  }
});

describe('M1 PUT /api/metadata/:key', () => {
  it('M1-01: key không phải danh mục → 404, không xuất hiện trong /api/data', async () => {
    for (const key of ['foo', 'emailConfig', 'projects', 'actualProgress', 'hackKey']) {
      expect((await call(T.sxd, 'PUT', `/api/metadata/${key}`, ['x'])).s).toBe(404);
    }
    const data = await getData();
    expect(data.foo).toBeUndefined();
    expect(data.hackKey).toBeUndefined();
  });
  it('M1-02: __proto__ / constructor không còn gây 500', async () => {
    for (const key of ['__proto__', 'constructor']) {
      expect([400, 404]).toContain((await call(T.sxd, 'PUT', `/api/metadata/${key}`, ['x'])).s);
    }
  });
  it('M1-03: body không phải danh sách → 400 và danh mục giữ nguyên', async () => {
    const before = (await getData()).projectGroups;
    for (const body of [null, { a: 1 }, 'text', 5]) {
      expect((await call(T.sxd, 'PUT', '/api/metadata/projectGroups', body as any)).s).toBe(400);
    }
    expect((await getData()).projectGroups).toEqual(before);
  });
  it('M1-04: mục rỗng, sai kiểu hoặc quá dài → 400', async () => {
    const before = (await getData()).projectGroups;
    for (const list of [[...before, ''], [...before, 1], [...before, 'x'.repeat(300)]]) {
      expect((await call(T.sxd, 'PUT', '/api/metadata/projectGroups', list)).s).toBe(400);
    }
  });
  it('M1-05: danh mục hợp lệ vẫn lưu được', async () => {
    const before = (await getData()).projectGroups;
    expect((await call(T.sxd, 'PUT', '/api/metadata/projectGroups', [...before, 'Nhóm QA mới'])).s).toBe(200);
    expect((await getData()).projectGroups).toContain('Nhóm QA mới');
  });
});

describe('M2 Dự án: tham chiếu, độ dài, khoảng số', () => {
  const base = { investor: INVESTOR, location: 'Phường Bình Đông', projectCategory: 'Khác' };
  it('M2-01: tạo dự án với quy trình / chủ đầu tư / nhóm / nguồn vốn không có trong danh mục → 400', async () => {
    for (const extra of [{ processId: 'zzz' }, { investor: 'Không có' }, { projectGroup: 'Nhóm Z' }, { fundingSource: 'Nguồn Z' }]) {
      const r = await call(T.admin, 'POST', '/api/projects', { ...base, processId: 'p1', ...extra, code: 'QM-BAD', name: 'x' });
      expect(r.s, JSON.stringify(extra)).toBe(400);
    }
    expect((await getData()).projects.some((p: any) => p.code === 'QM-BAD')).toBe(false);
  });
  it('M2-02: tạo dự án hợp lệ vẫn được', async () => {
    expect((await call(T.admin, 'POST', '/api/projects', { ...base, processId: 'p1', code: 'QM-OK', name: 'QM-OK' })).s).toBe(200);
  });
  it('M2-03: tên / mã quá dài → 400', async () => {
    expect((await call(T.admin, 'POST', '/api/projects', { ...base, processId: 'p1', code: 'QM-L', name: 'x'.repeat(10000) })).s).toBe(400);
    expect((await call(T.admin, 'POST', '/api/projects', { ...base, processId: 'p1', code: 'c'.repeat(1000), name: 'x' })).s).toBe(400);
  });
  it('M2-04: tiến độ 500, diện tích 1e30, chiều cao 99999, tổng mức đầu tư âm → 400', async () => {
    for (const bad of [{ progress: 500 }, { totalArea: 1e30 }, { height: 99999 }, { totalInvestment: -100 }, { apartmentCount: 1.5 }]) {
      expect((await call(T.admin, 'PUT', `/api/projects/${projectId}`, bad)).s, JSON.stringify(bad)).toBe(400);
    }
  });
  it('M2-05: đổi quy trình sang id không tồn tại → 400', async () => {
    expect((await call(T.admin, 'PUT', `/api/projects/${projectId}`, { processId: 'zzz' })).s).toBe(400);
    expect((await call(T.admin, 'PUT', `/api/projects/${projectId}`, { processId: 'p1' })).s).toBe(200);
  });
});

describe('M3 Tài khoản', () => {
  const acct = (over: any = {}) => ({
    username: 'qm_user', fullName: 'QM User', email: 'qm_user@qa.local', password: PW, roleId: 'Chuyên viên',
    userType: 'agency', agencyId: '3', phone: '0912000201', ...over
  });
  it('M3-01: vai trò ngoài danh mục (SuperGod, x, admin) → 400', async () => {
    for (const roleId of ['SuperGod', 'x', 'admin ']) {
      expect((await call(T.admin, 'POST', '/api/users', acct({ roleId, username: 'qm_r' + roleId.trim(), email: `r${roleId.trim()}@qa.local`, phone: '0912000299' }))).s, roleId).toBe(400);
    }
  });
  it('M3-02: tên đăng nhập có khoảng trắng / quá dài → 400', async () => {
    expect((await call(T.admin, 'POST', '/api/users', acct({ username: '  sp ace ', email: 'sp@qa.local', phone: '0912000202' }))).s).toBe(400);
    expect((await call(T.admin, 'POST', '/api/users', acct({ username: 'u'.repeat(500), email: 'long@qa.local', phone: '0912000203' }))).s).toBe(400);
  });
  it('M3-03: chủ đầu tư không có trong danh mục → 400', async () => {
    expect((await call(T.admin, 'POST', '/api/users', acct({ username: 'qm_inv', email: 'inv@qa.local', phone: '0912000204', userType: 'investor', agencyId: '', investorId: 'Không tồn tại' }))).s).toBe(400);
  });
  it('M3-04: mật khẩu ngắn (theo chính sách) hoặc quá dài → 400', async () => {
    expect((await call(T.admin, 'POST', '/api/users', acct({ username: 'qm_pw1', email: 'pw1@qa.local', phone: '0912000205', password: '1' }))).s).toBe(400);
    expect((await call(T.admin, 'POST', '/api/users', acct({ username: 'qm_pw2', email: 'pw2@qa.local', phone: '0912000206', password: 'a'.repeat(1000) }))).s).toBe(400);
  });
  it('M3-05: tạo hợp lệ; trường lạ (mustChangePassword, extra) không được lưu', async () => {
    const r = await call(T.admin, 'POST', '/api/users', acct({ mustChangePassword: true, extra: 'x', isFollower: 'abc' }));
    expect(r.s, r.e).toBe(200);
    expect(r.j.extra).toBeUndefined();
    expect(r.j.mustChangePassword).toBeFalsy();
    expect(r.j.isFollower).toBe(false);
  });
  it('M3-06: SXD không tự đổi cơ quan của chính mình (tự khóa quyền)', async () => {
    const me = (await getData(T.sxd)).users.find((u: any) => u.username === 'sxd');
    expect((await call(T.sxd, 'PUT', `/api/users/${me.id}`, { agencyId: '2' })).s).toBe(400);
    expect((await call(T.sxd, 'GET', '/api/data')).s).toBe(200);
  });
  it('M3-07: avatar javascript: bị từ chối ở /api/users/me', async () => {
    expect((await call(T.sxd, 'PUT', '/api/users/me', { avatar: 'javascript:alert(1)' })).s).toBe(400);
  });
});

describe('M4 Upload', () => {
  it('M4-01: tên tệp 300 ký tự → 400 và không có bản ghi mồ côi', async () => {
    const before = (await call(T.admin, 'GET', `/api/projects/${projectId}/attachments`)).j?.length ?? 0;
    expect((await upload(T.admin, projectId, 'a'.repeat(300) + '.pdf', 'x')).s).toBe(400);
    expect((await call(T.admin, 'GET', `/api/projects/${projectId}/attachments`)).j?.length ?? 0).toBe(before);
  });
  it('M4-02: tệp không có phần mở rộng → 400', async () => {
    expect((await upload(T.admin, projectId, 'README', 'x')).s).toBe(400);
  });
  it('M4-03: tệp nhỏ hơn 1 KB hiện số byte, không phải "0 KB"', async () => {
    const r = await upload(T.admin, projectId, 'nho.pdf', '123456789');
    expect(r.s, r.e).toBe(200);
    expect(r.j.size).toBe('9 B');
  });
});

describe('M5 Lịch sử và PM2', () => {
  it('M5-01: lịch sử với body rỗng / mô tả quá dài / sai kiểu → 400', async () => {
    for (const body of [{}, { description: '' }, { description: 'x'.repeat(100000) }, { description: { a: 1 } }]) {
      expect((await call(T.admin, 'POST', `/api/projects/${projectId}/history`, body)).s).toBe(400);
    }
    expect((await call(T.admin, 'POST', `/api/projects/${projectId}/history`, { actionType: 'update_status', description: 'Ghi chú hợp lệ' })).s).toBe(200);
  });
  it('M5-02: PM2 không có thao tác → 400 (không tự restart)', async () => {
    expect((await call(T.admin, 'POST', '/api/pm2/action', {})).s).toBe(400);
    expect((await call(T.admin, 'POST', '/api/pm2/action', { action: 'rm -rf' })).s).toBe(400);
  });
});
