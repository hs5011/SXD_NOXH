// Một lần (2026-10-06): mốc liên kết của quy trình p3 theo danh mục "Cấu hình Giai đoạn & Mốc Milestone".
//   ps20 "Chấp thuận chủ trương đầu tư"          → "Chấp thuận chủ trương"
//   ps22 "Thẩm định báo cáo nghiên cứu khả thi"  → "BC NCKT"
//   ps23 "Cấp Giấy phép xây dựng"                → "GPXD"
//   ps24 (thủ tục cho thuê, cho thuê mua NOXH)   → bỏ liên kết
//
//   npx tsx scripts/fix-p3-milestones.mts           chạy thử (READ ONLY), in thay đổi
//   npx tsx scripts/fix-p3-milestones.mts --apply   ghi; cấu hình cũ lưu vào _backups/
//   npx tsx scripts/fix-p3-milestones.mts --restore <file>   ghi lại cấu hình cũ từ file backup
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import pg from 'pg';

dotenv.config();
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const RESTORE = args.includes('--restore') ? args[args.indexOf('--restore') + 1] : '';
const CHANGES: Record<string, { from: string; to: string | null }> = {
  ps20: { from: 'Chấp thuận chủ trương đầu tư', to: 'Chấp thuận chủ trương' },
  ps22: { from: 'Thẩm định báo cáo nghiên cứu khả thi', to: 'BC NCKT' },
  ps23: { from: 'Cấp Giấy phép xây dựng', to: 'GPXD' },
  ps24: { from: 'Cấp Giấy phép xây dựng', to: null }
};

const url = String(process.env.DATABASE_URL || '').trim();
if (!url || url.includes('MY_DATABASE_URL')) throw new Error('DATABASE_URL chưa được cấu hình.');
const u = new URL(url);
const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
const sslOff = u.searchParams.get('sslmode') === 'disable';
u.searchParams.delete('sslmode');
const pool = new pg.Pool({ connectionString: u.toString(), ssl: local || sslOff ? false : { rejectUnauthorized: false }, max: 1 });
const client = await pool.connect();
try {
  await client.query(APPLY || RESTORE ? 'BEGIN' : 'BEGIN TRANSACTION READ ONLY');
  const row = (await client.query(`SELECT parent_steps FROM db_processes WHERE id = 'p3'${APPLY || RESTORE ? ' FOR UPDATE' : ''}`)).rows[0];
  if (!row) throw new Error('Không có quy trình p3.');
  const current: any[] = typeof row.parent_steps === 'string' ? JSON.parse(row.parent_steps) : row.parent_steps;

  if (RESTORE) {
    const old = JSON.parse(fs.readFileSync(RESTORE, 'utf8'));
    await client.query("UPDATE db_processes SET parent_steps = $1 WHERE id = 'p3'", [JSON.stringify(old)]);
    await client.query('COMMIT');
    console.log('Đã ghi lại cấu hình p3 từ', RESTORE);
  } else {
    const catalog = (await client.query('SELECT milestones FROM db_project_stages')).rows
      .flatMap(r => (typeof r.milestones === 'string' ? JSON.parse(r.milestones) : r.milestones) || []);
    const next = current.map(ps => {
      const c = CHANGES[ps.id];
      if (!c) return ps;
      if (String(ps.milestoneName ?? '') !== c.from) {
        throw new Error(`${ps.id}: mốc hiện tại "${ps.milestoneName}" khác "${c.from}" – dừng, không sửa gì.`);
      }
      if (c.to && !catalog.includes(c.to)) throw new Error(`"${c.to}" không có trong danh mục mốc.`);
      const { milestoneName, ...rest } = ps;
      console.log(`${ps.id} ${String(ps.name).slice(0, 60)}\n   "${milestoneName}" → ${c.to ? `"${c.to}"` : '(bỏ liên kết)'}`);
      return c.to ? { ...rest, milestoneName: c.to, isMilestone: true } : { ...rest, isMilestone: false };
    });
    if (APPLY) {
      const dir = path.join('_backups', '2026-10-06_4_cau-hinh-p3');
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, 'p3_parent_steps_truoc-sua.json');
      fs.writeFileSync(file, JSON.stringify(current, null, 2), 'utf8');
      await client.query("UPDATE db_processes SET parent_steps = $1 WHERE id = 'p3'", [JSON.stringify(next)]);
      await client.query('COMMIT');
      console.log('Đã ghi. Cấu hình cũ:', file);
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
