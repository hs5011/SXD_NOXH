/**
 * Regression tests: 7 lỗi nghiêm trọng của đợt kiểm thử chức năng ngày 05/10/2026 (chiều).
 * Chạy CHÍNH server.ts ở chế độ In-Memory, cổng riêng, gọi API thật.
 *
 *   #1 Nhập TT ở Gantt (actual progress) không được mở quyền cho phường / SQHKT với dự án còn ở bước SXD
 *   #3 Không xóa / đổi tên được trạng thái bước mà logic dùng (Hoàn thành, Đã phê duyệt, Đang xử lý)
 *   #4 Không xóa được bước con / thủ tục đang là bước hiện tại của dự án
 *   #5 Không xóa được giai đoạn đang dùng; đổi tên giai đoạn cập nhật cả thủ tục và dự án
 *   #6 Không xóa được vai trò Admin / vai trò đang có tài khoản; tạo tài khoản phải chọn vai trò
 * (#2 lưu trạng thái bước và #7 xuất CSV: test/unit/csv.test.ts và HousingUpdateView.)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, execSync, type ChildProcess } from 'child_process';
import path from 'path';

const PORT = 3108;
const B = `http://127.0.0.1:${PORT}`;
const PW = 'CriticalFix2026';

let server: ChildProcess;
const T: Record<string, string> = {};
let meta: any;
let sxdStep: any;
let wardStep: any;

async function call(token: string | null, method: string, url: string, body?: any) {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = 'Bearer ' + token;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(B + url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  let j: any = null;
  try { j = await r.json(); } catch { /* non-JSON */ }
  return { s: r.status, j, e: j?.error as string | undefined };
}
const login = async (username: string, password = PW) =>
  (await call(null, 'POST', '/api/login', { username, password })).j?.token as string;
const getData = async (token = T.admin) => (await call(token, 'GET', '/api/data')).j;
const project = async (code: string) => {
  const { files, ...rest } = (await getData()).projects.find((p: any) => p.code === code);
  return rest;
};

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
      JWT_SECRET: 'critical-fix-test-secret-0123456789abcdef0123456789'
    },
    stdio: 'ignore'
  });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(B + '/api/health')).ok) break; } catch { /* starting */ }
    await new Promise(r => setTimeout(r, 1000));
  }
  for (const u of ['admin', 'sqhkt']) T[u] = await login(u);
  meta = await getData();
  const steps = meta.processes.find((p: any) => p.id === 'p1').parentSteps.flatMap((ps: any) => ps.childSteps);
  sxdStep = steps[0];
  wardStep = steps.find((c: any) => /UBND cấp xã|UBND xã phường/.test(c.agency));

  const base = { investor: 'Chưa có chủ đầu tư', location: 'Phường Bình Đông', projectCategory: 'Khác', processId: 'p1' };
  await call(T.admin, 'POST', '/api/projects', {
    ...base, code: 'CF-SXD', name: 'Dự án CF-SXD', currentStep: sxdStep.name, currentStepId: sxdStep.id,
    milestones: { [sxdStep.id]: { investor: '2026-11-01', agency: '2026-11-20' } }
  });
  await call(T.admin, 'POST', '/api/projects', {
    ...base, code: 'CF-WARD', name: 'Dự án CF-WARD', currentStep: wardStep.name, currentStepId: wardStep.id,
    milestones: { [wardStep.id]: { agency: '2026-12-01' } }
  });
  await call(T.admin, 'POST', '/api/users', {
    username: 'cf_phuong', fullName: 'CF Phường', email: 'cf_phuong@cf.local', password: PW, roleId: 'Chuyên viên',
    userType: 'agency', agencyId: '6', department: 'Phường Bình Đông', phone: '0912000001'
  });
  T.phuong = await login('cf_phuong');
}, 120_000);

afterAll(() => {
  if (!server?.pid) return;
  if (process.platform === 'win32') {
    try { execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: 'ignore' }); } catch { /* already gone */ }
  } else {
    server.kill('SIGTERM');
  }
});

describe('#1 Bước hồ sơ quyết định phạm vi, không phải TT nhập ở Gantt', () => {
  it('CF-01: sau khi nhập TT mốc Chấp thuận chủ trương, phường vẫn không sửa được dự án ở bước SXD', async () => {
    const p = await project('CF-SXD');
    expect((await call(T.admin, 'PUT', `/api/actual-progress/${p.id}`, { chutruong: { cdtDate: '2026-10-01', nnDate: '2026-10-02' } })).s).toBe(200);
    expect((await call(T.phuong, 'PUT', `/api/projects/${p.id}`, { ...p, progress_status_2026: 'x' })).s).toBe(403);
  });
  it('CF-02: SQHKT không thấy dự án còn ở bước SXD; phường vẫn xem được dự án trong địa bàn', async () => {
    expect((await getData(T.sqhkt)).projects.map((p: any) => p.code)).not.toContain('CF-SXD');
    expect((await getData(T.phuong)).projects.map((p: any) => p.code)).toContain('CF-SXD');
  });
  it('CF-03: phường vẫn cập nhật được dự án ở bước của phường', async () => {
    const p = await project('CF-WARD');
    expect((await call(T.phuong, 'PUT', `/api/projects/${p.id}`, { ...p, progress_status_2026: 'ok' })).s).toBe(200);
  });
});

describe('#3 Trạng thái bước bắt buộc', () => {
  it.each(['Hoàn thành', 'Đã phê duyệt', 'Đang xử lý'])('CF-04: xóa "%s" → 409', async (status) => {
    const r = await call(T.admin, 'PUT', '/api/metadata/stepStatuses', meta.stepStatuses.filter((s: string) => s !== status));
    expect(r.s).toBe(409);
  });
  it('CF-05: xóa trạng thái thường vẫn được', async () => {
    expect((await call(T.admin, 'PUT', '/api/metadata/stepStatuses', meta.stepStatuses.filter((s: string) => s !== 'Tạm dừng'))).s).toBe(200);
    expect((await call(T.admin, 'PUT', '/api/metadata/stepStatuses', meta.stepStatuses)).s).toBe(200);
  });
});

describe('#4 Bước đang là bước hiện tại của dự án', () => {
  const clone = () => JSON.parse(JSON.stringify(meta.processes));
  it('CF-06: xóa bước con hiện tại → 409', async () => {
    const procs = clone();
    const parent = procs.find((p: any) => p.id === 'p1').parentSteps.find((ps: any) => ps.childSteps.some((c: any) => c.id === sxdStep.id));
    parent.childSteps = parent.childSteps.filter((c: any) => c.id !== sxdStep.id);
    const r = await call(T.admin, 'PUT', '/api/metadata/processes', procs);
    expect(r.s).toBe(409);
    expect(r.e).toContain('CF-SXD');
  });
  it('CF-07: xóa cả thủ tục chứa bước hiện tại → 409', async () => {
    const procs = clone();
    const p1 = procs.find((p: any) => p.id === 'p1');
    p1.parentSteps = p1.parentSteps.filter((ps: any) => !ps.childSteps.some((c: any) => c.id === sxdStep.id));
    expect((await call(T.admin, 'PUT', '/api/metadata/processes', procs)).s).toBe(409);
  });
  it('CF-08: xóa bước con không dự án nào đang ở đó vẫn được', async () => {
    const procs = clone();
    const p3 = procs.find((p: any) => p.id === 'p3');
    p3.parentSteps[p3.parentSteps.length - 1].childSteps.pop();
    expect((await call(T.admin, 'PUT', '/api/metadata/processes', procs)).s).toBe(200);
    expect((await call(T.admin, 'PUT', '/api/metadata/processes', meta.processes)).s).toBe(200);
  });
});

describe('#5 Giai đoạn dự án', () => {
  it('CF-09: xóa giai đoạn đang được thủ tục dùng → 409', async () => {
    const r = await call(T.admin, 'PUT', '/api/metadata/projectStages', meta.projectStages.filter((s: any) => s.name !== 'THỰC HIỆN ĐẦU TƯ'));
    expect(r.s).toBe(409);
  });
  // Giai đoạn của dự án được suy ra từ thủ tục của bước hiện tại (src/lib/stepProgress, 05/10/2026)
  it('CF-10: đổi tên giai đoạn cập nhật thủ tục, danh mục và giai đoạn của dự án', async () => {
    expect((await project('CF-SXD')).stage).toBe('CHUẨN BỊ ĐẦU TƯ');
    expect((await call(T.admin, 'POST', '/api/metadata/projectStages/rename', { oldName: 'CHUẨN BỊ ĐẦU TƯ', newName: 'CHUẨN BỊ (MỚI)' })).s).toBe(200);
    const d = await getData();
    const stagesInSteps = new Set(d.processes.flatMap((pr: any) => pr.parentSteps.map((ps: any) => ps.stage)));
    expect(stagesInSteps.has('CHUẨN BỊ (MỚI)')).toBe(true);
    expect(stagesInSteps.has('CHUẨN BỊ ĐẦU TƯ')).toBe(false);
    expect(d.projectStages.map((s: any) => s.name)).toContain('CHUẨN BỊ (MỚI)');
    expect(d.projects.find((x: any) => x.code === 'CF-SXD').stage).toBe('CHUẨN BỊ (MỚI)');
    expect((await call(T.admin, 'POST', '/api/metadata/projectStages/rename', { oldName: 'CHUẨN BỊ (MỚI)', newName: 'CHUẨN BỊ ĐẦU TƯ' })).s).toBe(200);
  });
  it('CF-11: đổi tên trùng giai đoạn khác → 409; tài khoản không phải SXD/Admin → 403', async () => {
    expect((await call(T.admin, 'POST', '/api/metadata/projectStages/rename', { oldName: 'KẾT THÚC ĐẦU TƯ', newName: 'chuẩn bị đầu tư' })).s).toBe(409);
    expect((await call(T.sqhkt, 'POST', '/api/metadata/projectStages/rename', { oldName: 'KẾT THÚC ĐẦU TƯ', newName: 'X' })).s).toBe(403);
  });
});

describe('#6 Vai trò', () => {
  it('CF-12: xóa vai trò Admin → 409', async () => {
    expect((await call(T.admin, 'PUT', '/api/metadata/roles', meta.roles.filter((r: string) => r !== 'Admin'))).s).toBe(409);
  });
  it('CF-13: xóa vai trò đang có tài khoản → 409; vai trò không ai dùng xóa được', async () => {
    expect((await call(T.admin, 'PUT', '/api/metadata/roles', meta.roles.filter((r: string) => r !== 'Chuyên viên'))).s).toBe(409);
    expect((await call(T.admin, 'PUT', '/api/metadata/roles', [...meta.roles, 'CF Vai trò'])).s).toBe(200);
    expect((await call(T.admin, 'PUT', '/api/metadata/roles', meta.roles)).s).toBe(200);
  });
  it('CF-14: tạo tài khoản không chọn vai trò → 400', async () => {
    const r = await call(T.admin, 'POST', '/api/users', {
      username: 'cf_norole', fullName: 'CF', email: 'cf_norole@cf.local', userType: 'agency', agencyId: '3', roleId: ''
    });
    expect(r.s).toBe(400);
  });
});
