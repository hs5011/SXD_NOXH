/**
 * Regression tests: lỗi High lặp lại ở nhiều role, đợt QA theo role ngày 22/10/2026
 * (QA_BAO_CAO_THEO_ROLE_2026-10-22.md). Chạy CHÍNH server.ts ở chế độ In-Memory, cổng riêng.
 *
 *   H1 PUT /api/projects/:id thiếu trường không được xóa diện tích / chiều cao / số căn hộ
 *   H2 Kế hoạch bước chỉ do bên ghi nhận bước đó đặt (CĐT: phía CĐT; cơ quan: bước của mình);
 *      kế hoạch mốc (cột *_cdt_date / *_nn_date) chỉ Sở Xây dựng
 *   H3 CĐT không tự đặt trạng thái / tiến độ / bước hiện tại
 *   H4 PUT /api/actual-progress/:id không trả dữ liệu dự án ngoài phạm vi
 *   H5 Giao song song (Bước tiếp theo nhiều bước): mọi cơ quan nhận hồ sơ đều thấy và cập nhật được
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, execSync, type ChildProcess } from 'child_process';
import path from 'path';

const PORT = 3110;
const B = `http://127.0.0.1:${PORT}`;
const PW = 'RoleQaHigh2026';
const INVESTOR = 'Công ty CP ĐTXD Xuân Mai Sài Gòn';  // phải có trong danh mục chủ đầu tư

let server: ChildProcess;
const T: Record<string, string> = {};
let steps: any[];

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
const project = async (code: string, token = T.admin) =>
  (await getData(token)).projects.find((p: any) => p.code === code);
const today = () => new Date().toLocaleDateString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh' });

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
      JWT_SECRET: 'role-qa-high-test-secret-0123456789abcdef0123456789'
    },
    stdio: 'ignore'
  });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(B + '/api/health')).ok) break; } catch { /* starting */ }
    await new Promise(r => setTimeout(r, 1000));
  }
  for (const u of ['admin', 'sqhkt', 'snnmt']) T[u] = await login(u);
  steps = (await getData()).processes.find((p: any) => p.id === 'p1').parentSteps.flatMap((ps: any) => ps.childSteps);

  const base = { investor: INVESTOR, location: 'Phường Bình Đông', projectCategory: 'Khác', processId: 'p1' };
  await call(T.admin, 'POST', '/api/projects', {
    ...base, code: 'QH-1', name: 'Dự án QH-1', totalArea: 1000, height: 15, apartmentCount: 100,
    milestones: { [steps[0].id]: { investor: '2026-11-01', agency: '2026-11-20' } }
  });
  await call(T.admin, 'POST', '/api/projects', { ...base, code: 'QH-PAR', name: 'Dự án QH-PAR' });
  await call(T.admin, 'POST', '/api/users', {
    username: 'qh_cdt', fullName: 'QA CĐT', email: 'qh_cdt@qa.local', password: PW, roleId: 'Chuyên viên',
    userType: 'investor', investorId: INVESTOR, phone: '0912000101'
  });
  T.cdt = await login('qh_cdt');
}, 120_000);

afterAll(() => {
  if (!server?.pid) return;
  if (process.platform === 'win32') {
    try { execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: 'ignore' }); } catch { /* already gone */ }
  } else {
    server.kill('SIGTERM');
  }
});

describe('H1 PUT dự án thiếu trường giữ giá trị đã lưu', () => {
  it('H1-01: SXD/Admin gửi chỉ { name } → diện tích, chiều cao, số căn hộ không bị xóa', async () => {
    const p = await project('QH-1');
    expect((await call(T.admin, 'PUT', `/api/projects/${p.id}`, { name: 'Dự án QH-1 (đổi tên)' })).s).toBe(200);
    const after = await project('QH-1');
    expect(after.name).toBe('Dự án QH-1 (đổi tên)');
    expect([after.totalArea, after.height, after.apartmentCount]).toEqual([1000, 15, 100]);
  });
  it('H1-02: CĐT gửi một phần → các trường khác giữ nguyên', async () => {
    const p = await project('QH-1');
    expect((await call(T.cdt, 'PUT', `/api/projects/${p.id}`, { progress_status_2026: 'ghi chú CĐT' })).s).toBe(200);
    const after = await project('QH-1');
    expect([after.totalArea, after.height, after.apartmentCount]).toEqual([1000, 15, 100]);
  });
});

describe('H2 Quyền đặt kế hoạch theo bước', () => {
  it('H2-01: CĐT không đặt được kế hoạch CQNN của bước SXD', async () => {
    const p = await project('QH-1');
    const r = await call(T.cdt, 'PUT', `/api/projects/${p.id}`, { milestones: { [steps[0].id]: { agency: '01/01/2030' } } });
    expect(r.s).toBe(403);
    expect((await project('QH-1')).milestones[steps[0].id].agency).toBe('2026-11-20');
  });
  it('H2-02: CĐT vẫn đặt được kế hoạch phía CĐT của dự án mình', async () => {
    const p = await project('QH-1');
    expect((await call(T.cdt, 'PUT', `/api/projects/${p.id}`, { milestones: { [steps[0].id]: { investor: '05/11/2026' } } })).s).toBe(200);
    expect((await project('QH-1')).milestones[steps[0].id].investor).toBe('2026-11-05');
  });
  it('H2-03: CĐT không đổi được kế hoạch mốc qua cột cũ *_nn_date', async () => {
    const p = await project('QH-1');
    expect((await call(T.cdt, 'PUT', `/api/projects/${p.id}`, { chutruong_nn_date: '01/01/2030' })).s).toBe(403);
  });
  it('H2-04: gửi lại nguyên dự án như màn hình đang hiển thị → không bị chặn', async () => {
    const { files, ...p } = await project('QH-1', T.cdt);
    expect((await call(T.cdt, 'PUT', `/api/projects/${p.id}`, { ...p, progress_status_2026: 'gửi lại' })).s).toBe(200);
  });
});

describe('H3 CĐT không tự đặt trạng thái / tiến độ', () => {
  it('H3-01: status, progress, currentStep, stage do server tính, không theo body của CĐT', async () => {
    const before = await project('QH-1');
    expect((await call(T.cdt, 'PUT', `/api/projects/${before.id}`, {
      status: 'Hoàn thành', progress: 100, currentStep: 'zzz', currentStepId: 'zzz', stage: 'zzz'
    })).s).toBe(200);
    const after = await project('QH-1');
    expect([after.status, after.progress, after.currentStep, after.stage])
      .toEqual([before.status, before.progress, before.currentStep, before.stage]);
  });
});

describe('H4 Tiến độ thực tế ngoài phạm vi', () => {
  it('H4-01: SQHKT gửi body rỗng vào dự án ở bước SXD → 403, không trả dữ liệu', async () => {
    const p = await project('QH-1');
    const r = await call(T.sqhkt, 'PUT', `/api/actual-progress/${p.id}`, {});
    expect(r.s).toBe(403);
    expect(r.j?.chutruong).toBeUndefined();
  });
  it('H4-02: Admin vẫn đọc/ghi được', async () => {
    const p = await project('QH-1');
    expect((await call(T.admin, 'PUT', `/api/actual-progress/${p.id}`, {})).s).toBe(200);
  });
});

describe('H5 Giao hồ sơ song song', () => {
  it('H5-01: bước đóng với 2 bước tiếp theo → Sở NNMT thấy và cập nhật được bước của mình', async () => {
    const meta = await getData();
    const snnmtAgency = meta.processingAgencies.find((a: any) => a.id === '3')?.name || '';
    const nnStep = steps.find((s: any) => s.agency === snnmtAgency);
    const otherStep = steps.find((s: any) => s.id !== nnStep?.id && s.id !== steps[0].id && !/Chủ đầu tư/.test(s.agency) && s.agency !== snnmtAgency);
    expect(nnStep && otherStep).toBeTruthy();
    // Bước đứng trước cả hai bước nhận, để "Bước tiếp theo" hợp lệ
    const fromStep = steps[0];
    const p = await project('QH-PAR');
    const close = await call(T.admin, 'POST', `/api/projects/${p.id}/progress/step`, {
      stepId: fromStep.id, side: 'nn', status: 'Hoàn thành', date: today(), nextStepIds: [otherStep.id, nnStep.id]
    });
    expect(close.s, close.e).toBe(200);

    expect((await getData(T.snnmt)).projects.map((x: any) => x.code)).toContain('QH-PAR');
    const upd = await call(T.snnmt, 'POST', `/api/projects/${p.id}/progress/step`, {
      stepId: nnStep.id, side: 'nn', status: 'Đang xử lý', date: today()
    });
    expect(upd.s, upd.e).toBe(200);
  });
  it('H5-02: dự án chỉ có kế hoạch ở bước Sở NNMT (chưa giao) → Sở NNMT vẫn không thấy', async () => {
    expect((await getData(T.snnmt)).projects.map((x: any) => x.code)).not.toContain('QH-1');
  });
});
