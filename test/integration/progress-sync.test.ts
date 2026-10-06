/**
 * Đồng bộ tiến độ theo bước (① Danh sách dự án → Cập nhật) ↔ theo mốc (② Sơ đồ Gantt → "+ nhập TT").
 * Chạy CHÍNH server.ts ở chế độ In-Memory, cổng riêng, gọi API thật. Liên kết mốc của quy trình p1 được
 * cấu hình giống DB thật (danh mục mốc tên ngắn "Chấp thuận chủ trương", "QH 1/500"...).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, execSync, type ChildProcess } from 'child_process';
import path from 'path';

const PORT = 3109;
const B = `http://127.0.0.1:${PORT}`;
const PW = 'ProgressSync2026';
const LT = 'Công ty TNHH Thương mại – Xây dựng Lê Thành';
const MILESTONES = ['Chấp thuận chủ trương', 'QH 1/500', 'QĐ Giao đất', 'HTKT/ĐTM', 'BC NCKT', 'PCCC', 'GPXD'];
const LINKS: Record<string, string> = { ps1: 'Chấp thuận chủ trương', ps2: 'QH 1/500', ps3: 'QĐ Giao đất', ps14: 'BC NCKT', ps11: 'PCCC', ps4: 'GPXD' };

let server: ChildProcess;
const T: Record<string, string> = {};
let PID = '';

async function call(token: string | null, method: string, url: string, body?: any) {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = 'Bearer ' + token;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(B + url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  let j: any = null;
  try { j = await r.json(); } catch { /* non-JSON */ }
  return { s: r.status, j, e: j?.error as string | undefined };
}
const login = async (u: string) => (await call(null, 'POST', '/api/login', { username: u, password: PW })).j?.token as string;
const data = async (token = T.admin) => (await call(token, 'GET', '/api/data')).j;
const project = async (token = T.admin) => (await data(token)).projects.find((p: any) => p.id === PID);
const milestone = async (name: string, token = T.admin) => (await data(token)).milestoneProgress?.[PID]?.[name];
const step = (body: any, token = T.admin) => call(token, 'POST', `/api/projects/${PID}/progress/step`, body);
const quick = (changes: any[], token = T.admin) => call(token, 'POST', `/api/projects/${PID}/progress/milestone`, { changes });
const close = (stepId: string, date: string, nextStepIds: string[] = [], token = T.admin) =>
  step({ stepId, side: 'nn', status: 'Hoàn thành', date, nextStepIds }, token);

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
      JWT_SECRET: 'progress-sync-test-secret-0123456789abcdef0123456789'
    },
    stdio: 'ignore'
  });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(B + '/api/health')).ok) break; } catch { /* starting */ }
    await new Promise(r => setTimeout(r, 1000));
  }
  for (const u of ['admin', 'sqhkt', 'cdt', 'snnmt']) T[u] = await login(u);

  // Danh mục mốc + liên kết thủ tục ↔ mốc như DB thật
  const d = await data();
  const stages = d.projectStages.map((s: any) => s.name === 'CHUẨN BỊ ĐẦU TƯ' ? { ...s, milestones: MILESTONES } : { ...s, milestones: [] });
  expect((await call(T.admin, 'PUT', '/api/metadata/projectStages', stages)).s).toBe(200);
  const processes = d.processes.map((p: any) => p.id !== 'p1' ? p : {
    ...p, parentSteps: p.parentSteps.map((ps: any) => ({ ...ps, milestoneName: LINKS[ps.id] || undefined, isMilestone: !!LINKS[ps.id] }))
  });
  expect((await call(T.admin, 'PUT', '/api/metadata/processes', processes)).s).toBe(200);

  const created = await call(T.admin, 'POST', '/api/projects', {
    code: 'PS-01', name: 'Dự án đồng bộ tiến độ', investor: LT, location: 'Phường Bình Đông',
    projectCategory: 'Khác', processId: 'p1', startDate: '01/01/2026', endDate: '31/12/2028',
    milestones: {
      cs1: { investor: '2026-02-01', agency: '2026-02-20' },
      cs3: { investor: '2026-02-21', agency: '2026-03-10' },
      cs2: { investor: '2026-03-11', agency: '2026-04-01' }
    }
  });
  PID = created.j.id;
  await call(T.admin, 'POST', '/api/users', {
    username: 'ps_phuong', fullName: 'PS Phường', email: 'ps_phuong@ps.local', password: PW, roleId: 'Chuyên viên',
    userType: 'agency', agencyId: '6', department: 'Phường Bình Đông', phone: '0913000001'
  });
  T.phuong = await login('ps_phuong');
}, 120_000);

afterAll(() => {
  if (!server?.pid) return;
  if (process.platform === 'win32') {
    try { execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: 'ignore' }); } catch { /* already gone */ }
  } else {
    server.kill('SIGTERM');
  }
});

describe('Đọc: mốc tính từ kế hoạch các bước', () => {
  it('PS-01: KH CĐT của mốc = HXL CĐT bước đầu, KH CQNN = HXL CQNN muộn nhất; cột mốc cũ được điền theo', async () => {
    const m = await milestone('Chấp thuận chủ trương');
    expect(m).toMatchObject({ linked: true, cdtPlan: '2026-02-01', nnPlan: '2026-04-01', nnActual: '' });
    const p = await project();
    expect([p.chutruong_cdt_date, p.chutruong_nn_date]).toEqual(['01/02/2026', '01/04/2026']);
    expect(p.currentStepId).toBe('cs1');
  });
  it('PS-02: mốc không có thủ tục liên kết (HTKT/ĐTM) là "mốc riêng"', async () => {
    expect((await milestone('HTKT/ĐTM')).linked).toBe(false);
  });
});

describe('① → ②', () => {
  it('PS-03: trạng thái trung gian được lưu vào bước, không đóng bước', async () => {
    const r = await step({ stepId: 'cs1', side: 'nn', status: 'Chờ bổ sung hồ sơ', date: '15/10/2026', note: 'Thiếu hồ sơ pháp lý' });
    expect(r.s).toBe(200);
    expect(r.j.project.implementationPlan.cs1).toMatchObject({ agencyStatus: 'Chờ bổ sung hồ sơ', agencyExpectedDate: '2026-10-15' });
    expect(r.j.project.currentStepId).toBe('cs1');
  });
  it('PS-04: đóng bước còn bước sau mà không chọn bước tiếp theo → 400; ngày tương lai → 400', async () => {
    expect((await close('cs1', '01/03/2026')).s).toBe(400);
    expect((await close('cs1', '01/01/2099', ['cs3'])).s).toBe(400);
  });
  it('PS-05: đóng bước, chọn bước tiếp theo cùng thủ tục → mốc chưa xong, bước hiện tại chuyển', async () => {
    const r = await close('cs1', '01/03/2026', ['cs3']);
    expect(r.s).toBe(200);
    expect(r.j.project.currentStepId).toBe('cs3');
    expect(r.j.milestones['Chấp thuận chủ trương'].nnActual).toBe('');
    // cs3 đã có HXL CQNN nhập lúc khởi tạo (10/03): giữ nguyên, không bị tính lại theo ngày đóng + 7
    expect(r.j.project.milestones.cs3.agency).toBe('2026-03-10');
    expect(r.j.project.milestones.cs3.agencyAuto).toBeUndefined();
  });
  it('PS-06: CĐT nhập ngày nộp ở bước (①) → mốc có TT CĐT', async () => {
    const r = await step({ stepId: 'cs3', side: 'cdt', date: '02/03/2026', note: 'Nộp hồ sơ thẩm định' }, T.cdt);
    expect(r.s).toBe(200);
    expect(r.j.milestones['Chấp thuận chủ trương']).toMatchObject({ cdtActual: '2026-03-02', cdtNote: 'Nộp hồ sơ thẩm định' });
  });
  it('PS-07: CĐT không được cập nhật trạng thái xử lý của cơ quan', async () => {
    expect((await step({ stepId: 'cs3', side: 'nn', status: 'Đang xử lý', date: '01/03/2026' }, T.cdt)).s).toBe(403);
  });
});

describe('② → ①', () => {
  it('PS-08: CĐT không nhập được phía cơ quan; cơ quan khác bước không nhập được', async () => {
    expect((await quick([{ milestone: 'Chấp thuận chủ trương', side: 'nn', date: '20/03/2026' }], T.cdt)).s).toBe(403);
    expect((await quick([{ milestone: 'Chấp thuận chủ trương', side: 'nn', date: '20/03/2026' }], T.snnmt)).s).toBe(403);
  });
  it('PS-09: ngày cơ quan trước ngày CĐT nộp → 400', async () => {
    const r = await quick([{ milestone: 'Chấp thuận chủ trương', side: 'nn', date: '01/03/2026' }]);
    expect(r.s).toBe(400);
  });
  it('PS-10: SXD nhập TT CQNN cho mốc → các bước còn mở đóng cùng ngày, hồ sơ sang thủ tục QH 1/500', async () => {
    const r = await quick([{ milestone: 'Chấp thuận chủ trương', side: 'nn', date: '20/03/2026', note: 'QĐ chấp thuận số 1' }]);
    expect(r.s).toBe(200);
    const ip = r.j.project.implementationPlan;
    expect(ip.cs1.agencyActualDate).toBe('2026-03-01');
    expect(ip.cs3.agencyActualDate).toBe('2026-03-20');
    expect(ip.cs2.agencyActualDate).toBe('2026-03-20');
    expect(r.j.milestones['Chấp thuận chủ trương']).toMatchObject({ nnActual: '2026-03-20', nnNote: 'QĐ chấp thuận số 1' });
    expect(r.j.project.currentStepId).toBe('cs4');
    // Giá trị cũ cho Dashboard vẫn đồng bộ
    expect(r.j.actualProgress.chutruong).toMatchObject({ cdtDate: '2026-03-02', nnDate: '2026-03-20' });
  });
  it('PS-11: CĐT nhập nhanh ngày nộp mốc QH 1/500 → ghi vào bước đầu của thủ tục', async () => {
    const r = await quick([{ milestone: 'QH 1/500', side: 'cdt', date: '22/03/2026' }], T.cdt);
    expect(r.s).toBe(200);
    expect(r.j.project.implementationPlan.cs4.investorActualDate).toBe('2026-03-22');
  });
});

describe('Phân quyền theo bước sau khi đồng bộ', () => {
  it('PS-12: dự án ở bước của SQHKT → SQHKT thấy và cập nhật được; phường (cùng địa bàn) được cập nhật bước SQHKT', async () => {
    expect((await data(T.sqhkt)).projects.map((p: any) => p.id)).toContain(PID);
    const r = await step({ stepId: 'cs4', side: 'nn', status: 'Đang xử lý', date: '25/04/2026' }, T.phuong);
    expect(r.s).toBe(200);
  });
  it('PS-13: nhánh rẽ — đóng cs5 với bước tiếp theo ngoài thủ tục → mốc QH 1/500 xong, nhánh 01 đơn vị "không áp dụng"', async () => {
    expect((await close('cs4', '05/04/2026', ['cs5'], T.sqhkt)).s).toBe(200);
    const r = await close('cs5', '10/04/2026', ['cs6'], T.sqhkt);
    expect(r.s).toBe(200);
    expect(r.j.milestones['QH 1/500'].nnActual).toBe('2026-04-10');
    expect(r.j.project.implementationPlan.cs41.skipped).toBe(true);
    expect(r.j.project.implementationPlan.cs51.skipped).toBe(true);
    expect(r.j.project.currentStepId).toBe('cs6');
    // Bước của SXD trước đó: SQHKT không còn thấy dự án
    expect((await data(T.sqhkt)).projects.map((p: any) => p.id)).not.toContain(PID);
  });
});

describe('Đường cũ vẫn đi qua quy tắc mới', () => {
  it('PS-14: PUT /api/actual-progress (máy cũ / hàng đợi offline) → ghi xuống bước như nhập nhanh', async () => {
    const r = await call(T.admin, 'PUT', `/api/actual-progress/${PID}`, { giaodat: { cdtDate: '2026-04-11', nnDate: '2026-04-30' } });
    expect(r.s).toBe(200);
    const p = await project();
    expect(p.implementationPlan.cs6.agencyActualDate).toBe('2026-04-30');
    expect((await milestone('QĐ Giao đất')).nnActual).toBe('2026-04-30');
  });
  it('PS-15: "Chỉnh sửa mốc" (cột mốc cũ) → KH CĐT về bước đầu, KH CQNN về bước có HXL muộn nhất', async () => {
    const p = await project();
    const { files, ...body } = p;
    const r = await call(T.admin, 'PUT', `/api/projects/${PID}`, { ...body, pccc_cdt_date: '01/06/2026', pccc_nn_date: '30/06/2026' });
    expect(r.s).toBe(200);
    const after = await project();
    expect(after.milestones.cs81).toMatchObject({ investor: '2026-06-01', agency: '2026-06-30' });
    expect(await milestone('PCCC')).toMatchObject({ cdtPlan: '2026-06-01', nnPlan: '2026-06-30' });
  });
  it('PS-16: modal Kế hoạch sửa HXL một bước → chỉ bước đó đổi', async () => {
    const p = await project();
    const { files, ...body } = p;
    const r = await call(T.admin, 'PUT', `/api/projects/${PID}`, { ...body, milestones: { ...p.milestones, cs8: { investor: '2026-07-01', agency: '2026-07-20' } } });
    expect(r.s).toBe(200);
    expect(await milestone('GPXD')).toMatchObject({ nnPlan: '2026-07-20' });
    expect(await milestone('PCCC')).toMatchObject({ cdtPlan: '2026-06-01', nnPlan: '2026-06-30' });
  });
  it('PS-17: mốc riêng (không liên kết) chỉ SXD/Admin nhập phía cơ quan, lưu theo mốc', async () => {
    expect((await quick([{ milestone: 'HTKT/ĐTM', side: 'nn', date: '01/05/2026' }], T.sqhkt)).s).toBe(403);
    const r = await quick([{ milestone: 'HTKT/ĐTM', side: 'nn', date: '01/05/2026' }]);
    expect(r.s).toBe(200);
    expect(r.j.milestones['HTKT/ĐTM']).toMatchObject({ linked: false, nnActual: '2026-05-01' });
  });
  it('PS-18: lịch sử ghi người cập nhật từ tài khoản đăng nhập', async () => {
    const h = (await call(T.admin, 'GET', `/api/projects/${PID}/history`)).j as any[];
    expect(h.some(x => /Cập nhật tiến độ mốc \[Chấp thuận chủ trương\]/.test(x.description))).toBe(true);
    expect(h.some(x => /Cập nhật tiến độ CĐT ở bước/.test(x.description))).toBe(true);
  });
});

describe('Đợt 2: Cập nhật kế hoạch dự án theo danh mục mốc', () => {
  it('PS-19: milestonePlans theo tên mốc → ghi xuống bước, không lưu vào hồ sơ dự án', async () => {
    const p = await project();
    const { files, ...body } = p;
    const r = await call(T.admin, 'PUT', `/api/projects/${PID}`, { ...body, milestonePlans: { PCCC: { cdt: '05/06/2026', nn: '25/06/2026' } } });
    expect(r.s).toBe(200);
    expect(r.j.milestonePlans).toBeUndefined();
    const after = await project();
    expect(after.milestones.cs81).toMatchObject({ investor: '2026-06-05', agency: '2026-06-25' });
    expect(await milestone('PCCC')).toMatchObject({ cdtPlan: '2026-06-05', nnPlan: '2026-06-25' });
  });
  it('PS-20: milestonePlans "X" (Đã xong) → lưu ở cột mốc cũ, bỏ X → mất X', async () => {
    const p = await project();
    const { files, ...body } = p;
    await call(T.admin, 'PUT', `/api/projects/${PID}`, { ...body, milestonePlans: { GPXD: { cdt: 'X', nn: 'X' } } });
    expect(await milestone('GPXD')).toMatchObject({ cdtPlan: 'X', nnPlan: 'X' });
    const p2 = await project();
    const { files: _f, ...body2 } = p2;
    await call(T.admin, 'PUT', `/api/projects/${PID}`, { ...body2, milestonePlans: { GPXD: { cdt: '', nn: '' } } });
    const m = await milestone('GPXD');
    expect(m.nnPlan).not.toBe('X');
  });
  it('PS-21: xóa mốc đang được thủ tục liên kết → 409; mốc riêng đã có tiến độ → 409', async () => {
    const d = await data();
    const without = (name: string) => d.projectStages.map((s: any) => s.name === 'CHUẨN BỊ ĐẦU TƯ'
      ? { ...s, milestones: s.milestones.filter((m: string) => m !== name) } : s);
    const linked = await call(T.admin, 'PUT', '/api/metadata/projectStages', without('PCCC'));
    expect(linked.s).toBe(409);
    expect(linked.e).toMatch(/liên kết/);
    const own = await call(T.admin, 'PUT', '/api/metadata/projectStages', without('HTKT/ĐTM'));
    expect(own.s).toBe(409);
    expect(own.e).toMatch(/đã có tiến độ/);
  });
});

describe('Nhánh rẽ: cơ quan của mốc là cơ quan ở "Bước tiếp theo" đã chọn', () => {
  it('PS-22: đóng QH chọn nhánh Sở NNMT (cs61) → bước hiện tại, cơ quan của mốc QĐ Giao đất = Sở NNMT; Sở NNMT nhập nhanh được, phường không', async () => {
    const created = await call(T.admin, 'POST', '/api/projects', {
      code: 'PS-02', name: 'Dự án nhánh rẽ', investor: LT, location: 'Phường Bình Đông',
      projectCategory: 'Khác', processId: 'p1', startDate: '01/01/2026', endDate: '31/12/2028'
    });
    const id = created.j.id;
    const st = (b: any) => call(T.admin, 'POST', `/api/projects/${id}/progress/step`, b);
    for (const [s, n, d] of [['cs1', 'cs3', '01/02/2026'], ['cs3', 'cs2', '02/02/2026'], ['cs2', 'cs4', '03/02/2026'], ['cs4', 'cs5', '04/02/2026'], ['cs5', 'cs61', '05/02/2026']]) {
      expect((await st({ stepId: s, side: 'nn', status: 'Hoàn thành', date: d, nextStepIds: [n] })).s).toBe(200);
    }
    const d = await data();
    expect(d.projects.find((p: any) => p.id === id).currentStepId).toBe('cs61');
    expect(d.milestoneProgress[id]['QĐ Giao đất']).toMatchObject({ currentStepId: 'cs61', agency: 'Sở NNMT' });
    const body = { changes: [{ milestone: 'QĐ Giao đất', side: 'nn', date: '06/02/2026' }] };
    expect((await call(T.phuong, 'POST', `/api/projects/${id}/progress/milestone`, body)).s).toBe(403);
    const r = await call(T.snnmt, 'POST', `/api/projects/${id}/progress/milestone`, body);
    expect(r.s).toBe(200);
    expect(r.j.milestones['QĐ Giao đất'].nnActual).toBe('2026-02-06');
  });
});

describe('Kiểm tra dữ liệu khi cập nhật tiến độ / kế hoạch', () => {
  let id = '';
  const st = (b: any, t = T.admin) => call(t, 'POST', `/api/projects/${id}/progress/step`, b);
  const qk = (changes: any[], t = T.admin) => call(t, 'POST', `/api/projects/${id}/progress/milestone`, { changes });
  const putPlans = async (milestonePlans: any, t = T.admin) => {
    const p = (await data()).projects.find((x: any) => x.id === id);
    const { files, ...body } = p;
    return call(t, 'PUT', `/api/projects/${id}`, { ...body, milestonePlans });
  };
  beforeAll(async () => {
    id = (await call(T.admin, 'POST', '/api/projects', {
      code: 'PS-03', name: 'Dự án kiểm tra dữ liệu', investor: LT, location: 'Phường Bình Đông',
      projectCategory: 'Khác', processId: 'p1', startDate: '01/01/2026', endDate: '31/12/2028'
    })).j.id;
  });

  it('PS-23: bước tiếp theo là chính nó → 400; ghi chú quá 2000 ký tự → 400', async () => {
    expect((await st({ stepId: 'cs1', side: 'nn', status: 'Hoàn thành', date: '01/03/2026', nextStepIds: ['cs1'] })).s).toBe(400);
    const r = await st({ stepId: 'cs1', side: 'nn', status: 'Đang xử lý', date: '01/12/2026', note: 'x'.repeat(2001) });
    expect(r.s).toBe(400);
    expect(r.e).toMatch(/2000/);
  });
  it('PS-24: bước nhận hồ sơ không được hoàn thành trước ngày bước trước chuyển sang', async () => {
    expect((await st({ stepId: 'cs1', side: 'nn', status: 'Hoàn thành', date: '01/03/2026', nextStepIds: ['cs3'] })).s).toBe(200);
    const r = await st({ stepId: 'cs3', side: 'nn', status: 'Hoàn thành', date: '28/02/2026', nextStepIds: ['cs2'] });
    expect(r.s).toBe(400);
    expect(r.e).toMatch(/bước trước/);
  });
  it('PS-24b: bước giao hồ sơ không được hoàn thành sau ngày bước nhận đã đóng', async () => {
    expect((await st({ stepId: 'cs1', side: 'nn', status: 'Hoàn thành', date: '01/03/2026', nextStepIds: ['cs3'] })).s).toBe(200);
    expect((await st({ stepId: 'cs3', side: 'nn', status: 'Hoàn thành', date: '05/03/2026', nextStepIds: ['cs2'] })).s).toBe(200);
    const r = await st({ stepId: 'cs1', side: 'nn', status: 'Hoàn thành', date: '10/03/2026', nextStepIds: ['cs3'] });
    expect(r.s).toBe(400);
    expect(r.e).toMatch(/bước tiếp theo/);
    expect((await st({ stepId: 'cs1', side: 'nn', status: 'Hoàn thành', date: '03/03/2026', nextStepIds: ['cs3'] })).s).toBe(200);
  });
  it('PS-25: nhập nhanh TT CQNN trước ngày một bước đã đóng ở ① → 400; sau đó → 200', async () => {
    expect((await qk([{ milestone: 'Chấp thuận chủ trương', side: 'nn', date: '15/02/2026' }])).s).toBe(400);
    expect((await qk([{ milestone: 'Chấp thuận chủ trương', side: 'nn', date: '10/03/2026' }])).s).toBe(200);
  });
  it('PS-26: Chỉnh sửa mốc: mốc lạ / ngày sai / KH CQNN trước KH CĐT → 400; tài khoản không phải SXD → 403', async () => {
    expect((await putPlans({ 'Mốc lạ': { cdt: '01/05/2026' } })).s).toBe(400);
    expect((await putPlans({ PCCC: { cdt: '31/02/2026' } })).s).toBe(400);
    expect((await putPlans({ PCCC: { cdt: '10/06/2026', nn: '01/06/2026' } })).s).toBe(400);
    expect((await putPlans({ PCCC: { cdt: '01/06/2026', nn: '10/06/2026' } }, T.cdt)).s).toBe(403);
    expect((await putPlans({ PCCC: { cdt: '01/06/2026', nn: '10/06/2026' } })).s).toBe(200);
    expect(await (async () => (await data()).milestoneProgress[id].PCCC)()).toMatchObject({ cdtPlan: '2026-06-01', nnPlan: '2026-06-10' });
  });
});
