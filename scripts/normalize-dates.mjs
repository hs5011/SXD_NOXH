// Normalize legacy plan dates ("25/5/26", "4/5/2026") to dd/MM/yyyy through the app's own API.
// Chạy khi server (bản build mới) đang chạy, mặc định http://localhost:3004 (đổi bằng NOXH_URL).
// Đăng nhập bằng tài khoản thử nghiệm admin (đổi bằng NOXH_USER / NOXH_PASS).
//   node scripts/normalize-dates.mjs           → chạy thử, không ghi gì
//   node scripts/normalize-dates.mjs --apply   → sao lưu ra file JSON rồi ghi
// yyyy-MM-dd values (actual dates / computed milestones, the code's internal format) are kept,
// except a malformed one such as "2027-04-4".
import fs from 'fs';
const B = process.env.NOXH_URL || 'http://localhost:3004';
const APPLY = process.argv.includes('--apply');

const login = await fetch(B + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: process.env.NOXH_USER || 'admin', password: process.env.NOXH_PASS || '123456' }) });
if (!login.ok) throw new Error('login failed ' + login.status);
const { token } = await login.json();
const H = { authorization: 'Bearer ' + token, 'content-type': 'application/json' };

const pad = n => String(n).padStart(2, '0');
const validDate = (y, m, d) => { const dt = new Date(y, m - 1, d); return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d; };
// Returns the normalized string, or null when the value must stay as it is
function normalize(v) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) {
    const d = +m[1], mo = +m[2]; let y = +m[3]; if (m[3].length === 2) y += 2000;
    if (!validDate(y, mo, d)) return null;
    const out = `${pad(d)}/${pad(mo)}/${y}`;
    return out === v ? null : out;
  }
  m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);            // malformed ISO like 2027-04-4
  if (m && !/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const y = +m[1], mo = +m[2], d = +m[3];
    return validDate(y, mo, d) ? `${pad(d)}/${pad(mo)}/${y}` : null;
  }
  return null;
}

const ROOT = ['startDate', 'endDate', 'deadline', 'completionDate', 'completion_date',
  'chutruong_cdt_date', 'chutruong_nn_date', 'qh1500_cdt_date', 'qh1500_nn_date', 'qdgiaodat_cdt_date', 'qdgiaodat_nn_date',
  'pccc_cdt_date', 'pccc_nn_date', 'htkt_dtm_cdt_date', 'htkt_dtm_nn_date', 'baocaonckt_cdt_date', 'baocaonckt_nn_date',
  'gpxaydung_cdt_date', 'gpxaydung_nn_date'];

const data = await (await fetch(B + '/api/data', { headers: H })).json();
const plan = [];
for (const p of data.projects) {
  const changes = [];
  const next = JSON.parse(JSON.stringify(p));
  for (const f of ROOT) { const n = normalize(p[f]); if (n) { changes.push(`${f}: ${p[f]} → ${n}`); next[f] = n; } }
  for (const [sid, ms] of Object.entries(p.milestones || {})) {
    if (!ms || typeof ms !== 'object') continue;
    for (const k of ['investor', 'agency', 'actualDate']) { const n = normalize(ms[k]); if (n) { changes.push(`milestones.${sid}.${k}: ${ms[k]} → ${n}`); next.milestones[sid][k] = n; } }
  }
  for (const [sid, ip] of Object.entries(p.implementationPlan || {})) {
    if (!ip || typeof ip !== 'object') continue;
    for (const [k, v] of Object.entries(ip)) { const n = normalize(v); if (n) { changes.push(`plan.${sid}.${k}: ${v} → ${n}`); next.implementationPlan[sid][k] = n; } }
  }
  if (changes.length) plan.push({ id: p.id, code: p.code, changes, next });
}

const total = plan.reduce((n, x) => n + x.changes.length, 0);
console.log(`Dự án cần sửa: ${plan.length}/${data.projects.length}, giá trị ngày cần sửa: ${total}`);
plan.slice(0, 3).forEach(x => console.log(' ', x.code, '\n    ' + x.changes.slice(0, 4).join('\n    ')));
const odd = plan.flatMap(x => x.changes.filter(c => /-\d{1,2}-\d{1,2} →|^\S+: \d{4}-/.test(c)).map(c => x.code + ' ' + c));
if (odd.length) console.log('Giá trị lỗi được sửa:', odd);

if (!APPLY) { console.log('\n(Chạy thử – chưa ghi gì)'); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFile = `backup_projects_before_date_normalize_${stamp}.json`;
fs.writeFileSync(backupFile, JSON.stringify({ takenAt: new Date().toISOString(), projects: data.projects, actualProgress: data.actualProgress }, null, 1));
console.log('Đã sao lưu:', backupFile);

let ok = 0; const failed = [];
for (const x of plan) {
  const { files, ...body } = x.next;               // same as the UI: never send attachments
  const r = await fetch(B + '/api/projects/' + encodeURIComponent(x.id), { method: 'PUT', headers: H, body: JSON.stringify(body) });
  if (r.ok) ok++; else failed.push(x.code + ' ' + r.status + ' ' + (await r.text()).slice(0, 150));
}
console.log(`Đã ghi: ${ok}/${plan.length}`, failed.length ? failed : '');
