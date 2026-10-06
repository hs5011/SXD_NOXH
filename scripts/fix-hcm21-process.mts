// Một lần (2026-10-06): dự án NOXH-HCM-21 chuyển từ quy trình p3 sang p1 (người dùng xác nhận).
// Kế hoạch lưu theo mã bước của p3 (milestones JSON) được bỏ, vì mã bước p3 trùng mã bước khác của p1
// (cs41). Các giá trị này trùng với cột mốc cũ (*_cdt_date / *_nn_date), migration đợt 3 sẽ ghi chúng
// xuống đúng bước của p1.
//
//   npx tsx scripts/fix-hcm21-process.mts            chạy thử (READ ONLY)
//   npx tsx scripts/fix-hcm21-process.mts --apply    ghi; dữ liệu cũ lưu vào _backups/
//   npx tsx scripts/fix-hcm21-process.mts --restore <file>
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import pg from 'pg';

dotenv.config();
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const RESTORE = args.includes('--restore') ? args[args.indexOf('--restore') + 1] : '';
const CODE = 'NOXH-HCM-21';
const P3_KEYS = ['cs35', 'cs41', 'cs44', 'cs46', 'ps20', 'ps22', 'ps23', 'ps24'];

const url = String(process.env.DATABASE_URL || '').trim();
if (!url || url.includes('MY_DATABASE_URL')) throw new Error('DATABASE_URL chưa được cấu hình.');
const u = new URL(url);
const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
const sslOff = u.searchParams.get('sslmode') === 'disable';
u.searchParams.delete('sslmode');
const pool = new pg.Pool({ connectionString: u.toString(), ssl: local || sslOff ? false : { rejectUnauthorized: false }, max: 1 });
const client = await pool.connect();
try {
  const writing = APPLY || !!RESTORE;
  await client.query(writing ? 'BEGIN' : 'BEGIN TRANSACTION READ ONLY');
  const row = (await client.query(`SELECT id, process_id, current_step, milestones FROM projects WHERE code = $1${writing ? ' FOR UPDATE' : ''}`, [CODE])).rows[0];
  if (!row) throw new Error(`Không có dự án ${CODE}.`);

  if (RESTORE) {
    const old = JSON.parse(fs.readFileSync(RESTORE, 'utf8'));
    await client.query('UPDATE projects SET process_id = $1, milestones = $2 WHERE id = $3', [old.process_id, JSON.stringify(old.milestones || {}), row.id]);
    await client.query('COMMIT');
    console.log(`Đã ghi lại quy trình "${old.process_id}" và kế hoạch cũ cho ${CODE}.`);
  } else {
    if (row.process_id !== 'p3') throw new Error(`${CODE} đang ở quy trình "${row.process_id}", không phải p3 – dừng, không sửa gì.`);
    const p1 = (await client.query("SELECT parent_steps FROM db_processes WHERE id = 'p1'")).rows[0];
    const steps = (p1?.parent_steps || []).flatMap((ps: any) => ps.childSteps || []);
    const match = steps.filter((s: any) => s.name === row.current_step);
    if (match.length !== 1) throw new Error(`Bước "${row.current_step}" khớp ${match.length} bước trong p1 – dừng.`);
    const milestones = { ...(row.milestones || {}) };
    P3_KEYS.forEach(k => delete milestones[k]);
    console.log(`${CODE}: quy trình p3 → p1; bước đang lưu "${row.current_step}" = ${match[0].id} của p1`);
    console.log('  bỏ kế hoạch theo mã bước p3:', JSON.stringify(row.milestones));
    console.log('  còn lại:', JSON.stringify(milestones));
    if (APPLY) {
      const dir = path.join('_backups', '2026-10-06_5_hcm21-quy-trinh');
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, 'NOXH-HCM-21_truoc-sua.json');
      fs.writeFileSync(file, JSON.stringify({ process_id: row.process_id, milestones: row.milestones }, null, 2), 'utf8');
      await client.query('UPDATE projects SET process_id = $1, milestones = $2 WHERE id = $3', ['p1', JSON.stringify(milestones), row.id]);
      await client.query(
        'INSERT INTO project_history (project_id, user_name, action_type, description) VALUES ($1, $2, $3, $4)',
        [row.id, 'Quản trị hệ thống', 'UPDATE', 'Chuyển quy trình từ "Quy trình NOXH Vốn đầu tư công" (p3) sang p1 theo xác nhận của Sở Xây dựng; kế hoạch các mốc giữ nguyên.']
      );
      await client.query('COMMIT');
      console.log('Đã ghi. Dữ liệu cũ:', file);
    } else {
      await client.query('ROLLBACK');
      console.log('Chạy thử, không ghi gì.');
    }
  }
} catch (err: any) {
  try { await client.query('ROLLBACK'); } catch { /* none */ }
  console.error('Lỗi:', err?.message || err);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
