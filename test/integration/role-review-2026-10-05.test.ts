/**
 * Regression tests: rà soát phân quyền theo role ngày 05/10/2026.
 * Chạy CHÍNH server.ts (không phải bản sao logic) ở chế độ In-Memory, cổng riêng, gọi API thật.
 *
 *   Nghiêm trọng
 *     - Phường cập nhật được bước có cơ quan ghi "UBND xã phường"
 *     - Bước trùng tên giữa UBND TP và phường: quyền theo bước (currentStepId) trong quy trình của dự án
 *     - Tài khoản không phải Sở Xây dựng không đổi được thông tin chung (CĐT, tên, mã, địa điểm…)
 *   Trung bình
 *     - Đổi tên danh mục trùng giá trị khác / lưu danh mục có giá trị trùng → 409
 *     - Xóa cơ quan/quy trình đang dùng → 409
 *     - Cấu hình tải lên / chính sách mật khẩu phải hợp lệ
 *   Nhỏ
 *     - Ngày sai, tên rỗng, số không hợp lệ, tệp 0 byte, tài khoản thiếu thông tin, /me sai định dạng,
 *       mật khẩu mới trùng mật khẩu cũ, id do client gửi bị bỏ qua
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, execSync, type ChildProcess } from 'child_process';
import path from 'path';

const PORT = 3107;
const B = `http://127.0.0.1:${PORT}`;
const PW = 'RoleReview2026';
const LT = 'Công ty TNHH Thương mại – Xây dựng Lê Thành';
const XM = 'Công ty CP ĐTXD Xuân Mai Sài Gòn';
// Tên bước trùng nhau trong quy trình p5: cs55 (UBND TP) và cs551 (UBND cấp xã, phường)
const SAME_NAME_STEP = 'Chấp thuận (Trường hợp đất <2ha thuộc quy hoạch địa giới hành chính của 01 đơn vị hành chính cấp xã)';

let server: ChildProcess;
const T: Record<string, string> = {};
const P: Record<string, string> = {};

async function call(token: string | null, method: string, url: string, body?: any) {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = 'Bearer ' + token;
  let payload: any;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const r = await fetch(B + url, { method, headers, body: payload });
  let j: any = null;
  try { j = await r.json(); } catch { /* non-JSON */ }
  return { s: r.status, j, e: j?.error as string | undefined };
}
const login = async (username: string, password = PW) =>
  (await call(null, 'POST', '/api/login', { username, password })).j?.token as string;
const project = async (code: string) =>
  ((await call(T.admin, 'GET', '/api/data')).j.projects as any[]).find(p => p.code === code);
const fullBody = async (code: string) => { const { files, ...rest } = await project(code); return rest; };

beforeAll(async () => {
  const root = path.resolve(__dirname, '../..');
  server = spawn('npx', ['tsx', 'server.ts'], {
    cwd: root,
    shell: true,
    env: {
      ...process.env,
      DATABASE_URL: 'MY_DATABASE_URL',             // In-Memory: không bao giờ chạm DB thật
      PGHOST: '', PGDATABASE: '',
      NODE_ENV: 'production',                      // không khởi động Vite
      PORT: String(PORT),
      SEED_USER_PASSWORD: PW,
      JWT_SECRET: 'role-review-test-secret-0123456789abcdef0123456789'
    },
    stdio: 'ignore'
  });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(B + '/api/health')).ok) break; } catch { /* starting */ }
    await new Promise(r => setTimeout(r, 1000));
  }
  for (const u of ['admin', 'sxd', 'sqhkt', 'snnmt', 'cdt']) T[u] = await login(u);

  const base = { projectGroup: 'Nhóm B', projectCategory: 'Khác', status: 'Đang xử lý', startDate: '01/01/2026', endDate: '31/12/2027' };
  const defs: [string, string, string, string, string, string?][] = [
    // code, processId, currentStep, investor, location, currentStepId
    ['RR-SXD', 'p1', 'Thẩm định chủ trương đầu tư', LT, 'Phường Bình Đông'],
    ['RR-NNMT', 'p1', 'Cấp Giấy phép môi trường', LT, 'Phường Bình Đông'],
    ['RR-WARD-ALIAS', 'p1', 'Phê duyệt / có ý kiến địa phương trường hợp giao đất / cho thuê đất cho toàn bộ diện tích đất thực hiện dự án NOXH', XM, 'Phường Bình Đông'],
    ['RR-UBNDTP-STEP', 'p5', SAME_NAME_STEP, XM, 'Phường Bình Đông', 'cs55'],
    ['RR-WARD-STEP', 'p5', SAME_NAME_STEP, XM, 'Phường Bình Đông', 'cs551'],
  ];
  for (const [code, processId, currentStep, investor, location, currentStepId] of defs) {
    const r = await call(T.admin, 'POST', '/api/projects', { ...base, code, name: 'Dự án ' + code, processId, currentStep, investor, location, currentStepId });
    P[code] = r.j.id;
  }
  const mk = (username: string, extra: any) => call(T.admin, 'POST', '/api/users', {
    username, fullName: 'RR ' + username, email: `${username}@rr.local`, password: PW, roleId: 'Chuyên viên', ...extra
  });
  await mk('rr_phuong', { userType: 'agency', agencyId: '6', department: 'Phường Bình Đông', phone: '0911000001' });
  await mk('rr_ubndtp', { userType: 'agency', agencyId: '7', phone: '0911000002' });
  T.phuong = await login('rr_phuong');
  T.ubndtp = await login('rr_ubndtp');
}, 120_000);

afterAll(() => {
  if (!server?.pid) return;
  if (process.platform === 'win32') {
    try { execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: 'ignore' }); } catch { /* already gone */ }
  } else {
    server.kill('SIGTERM');
  }
});

// ═════════════════════════════════════════════════════════════════════════════
describe('Nghiêm trọng – phạm vi theo bước quy trình', () => {
  it('RR-01: phường cập nhật được bước có cơ quan ghi "UBND xã phường" (cs7)', async () => {
    expect((await call(T.phuong, 'PUT', `/api/projects/${P['RR-WARD-ALIAS']}`, { notes: 'phường' })).s).toBe(200);
  });

  it('RR-02: bước trùng tên thuộc UBND TP → UBND TP sửa được, phường thì không', async () => {
    expect((await call(T.ubndtp, 'PUT', `/api/projects/${P['RR-UBNDTP-STEP']}`, { notes: 'x' })).s).toBe(200);
    expect((await call(T.phuong, 'PUT', `/api/projects/${P['RR-UBNDTP-STEP']}`, { notes: 'x' })).s).toBe(403);
  });

  it('RR-03: bước trùng tên thuộc phường → phường sửa được, UBND TP thì không', async () => {
    expect((await call(T.phuong, 'PUT', `/api/projects/${P['RR-WARD-STEP']}`, { notes: 'x' })).s).toBe(200);
    expect((await call(T.ubndtp, 'PUT', `/api/projects/${P['RR-WARD-STEP']}`, { notes: 'x' })).s).toBe(403);
  });

  it('RR-04: UBND TP chỉ thấy dự án ở bước của mình', async () => {
    const codes = ((await call(T.ubndtp, 'GET', '/api/data')).j.projects as any[]).map(p => p.code);
    expect(codes).toContain('RR-UBNDTP-STEP');
    expect(codes).not.toContain('RR-WARD-STEP');
  });
});

describe('Nghiêm trọng – chỉ Sở Xây dựng đổi thông tin chung', () => {
  it('RR-05: chủ đầu tư đổi CĐT của dự án → 403', async () => {
    const r = await call(T.cdt, 'PUT', `/api/projects/${P['RR-SXD']}`, { investor: XM });
    expect(r.s).toBe(403);
    expect((await project('RR-SXD')).investor).toBe(LT);
  });

  it('RR-06: Sở NNMT đổi tên/mã/địa điểm → 403', async () => {
    const r = await call(T.snnmt, 'PUT', `/api/projects/${P['RR-NNMT']}`, { name: 'x', code: 'HACK', location: 'Phường Rạch Dừa' });
    expect(r.s).toBe(403);
    expect(r.e).toMatch(/Mã dự án, Tên dự án, Địa điểm/);
  });

  it('RR-07: Sở NNMT gửi đủ dự án, chỉ đổi diện tích → 200, thông tin chung giữ nguyên', async () => {
    const body = await fullBody('RR-NNMT');
    expect((await call(T.snnmt, 'PUT', `/api/projects/${P['RR-NNMT']}`, { ...body, totalArea: 3.5 })).s).toBe(200);
    const after = await project('RR-NNMT');
    expect(after.totalArea).toBe(3.5);
    expect(after.name).toBe('Dự án RR-NNMT');
  });

  it('RR-08: Sở Xây dựng vẫn đổi được tên dự án', async () => {
    expect((await call(T.sxd, 'PUT', `/api/projects/${P['RR-SXD']}`, { name: 'Đổi bởi SXD' })).s).toBe(200);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('Trung bình – danh mục và cấu hình', () => {
  it('RR-09: đổi tên giá trị danh mục thành giá trị đã có → 409', async () => {
    const r = await call(T.admin, 'POST', '/api/metadata/projectGroups/rename', { oldName: 'Nhóm B', newName: 'nhóm c' });
    expect(r.s).toBe(409);
  });

  it('RR-10: lưu danh mục có giá trị trùng → 409', async () => {
    expect((await call(T.admin, 'PUT', '/api/metadata/projectGroups', ['Nhóm A', 'Nhóm B', 'Nhóm C', ' nhóm a'])).s).toBe(409);
  });

  it('RR-11: xóa cơ quan đang có tài khoản/bước quy trình → 409; cơ quan chưa dùng xóa được', async () => {
    const agencies = (await call(T.admin, 'GET', '/api/data')).j.processingAgencies as any[];
    expect((await call(T.admin, 'PUT', '/api/metadata/processingAgencies', agencies.filter(a => a.id !== '3'))).s).toBe(409);
    expect((await call(T.admin, 'PUT', '/api/metadata/processingAgencies', [...agencies, { id: '99', name: 'Cơ quan thử', displayOrder: 99, departments: [] }])).s).toBe(200);
    expect((await call(T.admin, 'PUT', '/api/metadata/processingAgencies', agencies)).s).toBe(200);
  });

  it('RR-12: xóa quy trình đang có dự án áp dụng → 409', async () => {
    const procs = (await call(T.admin, 'GET', '/api/data')).j.processes as any[];
    expect((await call(T.admin, 'PUT', '/api/metadata/processes', procs.filter(p => p.id !== 'p1'))).s).toBe(409);
  });

  it('RR-13: cấu hình tải lên không hợp lệ → 400; hợp lệ được chuẩn hóa', async () => {
    expect((await call(T.admin, 'POST', '/api/upload-config', { allowedExtensions: '', maxSizeMb: 20 })).s).toBe(400);
    expect((await call(T.admin, 'POST', '/api/upload-config', { allowedExtensions: 'pdf', maxSizeMb: -5 })).s).toBe(400);
    const ok = await call(T.admin, 'POST', '/api/upload-config', { allowedExtensions: '.pdf, docx ,PDF', maxSizeMb: 15 });
    expect(ok.s).toBe(200);
    expect(ok.j.allowedExtensions).toBe('PDF,DOCX');
    await call(T.admin, 'POST', '/api/upload-config', { allowedExtensions: 'JPG,JPEG,PNG,GIF,PDF,DOC,DOCX,XLS,XLSX,ZIP,RAR', maxSizeMb: 20 });
  });

  it('RR-14: độ dài mật khẩu tối thiểu ngoài 4–32 → 400', async () => {
    expect((await call(T.admin, 'POST', '/api/password-policy', { minLength: 0 })).s).toBe(400);
    expect((await call(T.admin, 'POST', '/api/password-policy', { minLength: 33 })).s).toBe(400);
    expect((await call(T.admin, 'POST', '/api/password-policy', { minLength: 6 })).s).toBe(200);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('Nhỏ – kiểm tra dữ liệu đầu vào', () => {
  const base = { processId: 'p1', investor: LT, location: 'Phường Bình Đông', projectCategory: 'Khác' };

  it('RR-15: tạo dự án tên rỗng / ngày sai / diện tích không phải số → 400', async () => {
    expect((await call(T.admin, 'POST', '/api/projects', { ...base, code: 'RR-E1', name: ' ' })).s).toBe(400);
    expect((await call(T.admin, 'POST', '/api/projects', { ...base, code: 'RR-E2', name: 'x', startDate: '31/02/2026' })).s).toBe(400);
    expect((await call(T.admin, 'POST', '/api/projects', { ...base, code: 'RR-E3', name: 'x', totalArea: 'abc' })).s).toBe(400);
  });

  it('RR-16: id do client gửi bị bỏ qua khi tạo và khi sửa', async () => {
    const created = await call(T.admin, 'POST', '/api/projects', { ...base, code: 'RR-ID', name: 'x', id: P['RR-SXD'] });
    expect(created.s).toBe(200);
    expect(created.j.id).not.toBe(P['RR-SXD']);
    const body = await fullBody('RR-ID');
    expect((await call(T.admin, 'PUT', `/api/projects/${created.j.id}`, { ...body, id: 'hijack' })).s).toBe(200);
    expect((await project('RR-ID')).id).toBe(created.j.id);
  });

  it('RR-17: tải lên tệp 0 byte → 400', async () => {
    const f = new FormData();
    f.append('file', new Blob(['']), 'rong.pdf');
    expect((await call(T.admin, 'POST', `/api/projects/${P['RR-SXD']}/attachments/upload`, f)).s).toBe(400);
  });

  it('RR-18: tạo tài khoản thiếu thông tin / phường không chọn phường → 400', async () => {
    expect((await call(T.admin, 'POST', '/api/users', { username: '', email: '', userType: 'agency', roleId: '' })).s).toBe(400);
    const u = { fullName: 'RR', username: 'rr_x', email: 'rr_x@rr.local', roleId: 'Chuyên viên', userType: 'agency', agencyId: '6', department: '' };
    expect((await call(T.admin, 'POST', '/api/users', u)).s).toBe(400);
    expect((await call(T.admin, 'POST', '/api/users', { ...u, agencyId: '3', email: 'sai' })).s).toBe(400);
  });

  it('RR-19: /me email, SĐT sai định dạng hoặc họ tên rỗng → 400', async () => {
    expect((await call(T.phuong, 'PUT', '/api/users/me', { email: 'khong-phai-email' })).s).toBe(400);
    expect((await call(T.phuong, 'PUT', '/api/users/me', { phone: 'abc' })).s).toBe(400);
    expect((await call(T.phuong, 'PUT', '/api/users/me', { fullName: ' ' })).s).toBe(400);
  });

  it('RR-20: mật khẩu mới trùng mật khẩu hiện tại → 400', async () => {
    const r = await call(T.phuong, 'POST', '/api/profile/change-password', { oldPassword: PW, newPassword: PW });
    expect(r.s).toBe(400);
    expect(r.e).toMatch(/khác mật khẩu hiện tại/);
  });
});
