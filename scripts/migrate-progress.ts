// Đợt 3 – chuyển tiến độ ở nơi lưu cũ (cột mốc *_cdt_date / *_nn_date, bảng project_actual_progress, JSON
// milestones / implementationPlan của dự án) sang bảng project_progress theo bước (server/progressMigration.ts).
//
//   npx tsx scripts/migrate-progress.ts            chạy thử: chỉ đọc (transaction READ ONLY), xuất báo cáo
//   npx tsx scripts/migrate-progress.ts --apply    ghi vào project_progress (một transaction; không xóa dữ liệu cũ)
//   npx tsx scripts/migrate-progress.ts --revert   xóa các dòng do lần chuyển này ghi (updated_by = MIGRATION_USER)
//
// Tùy chọn: --out <thư mục báo cáo> (mặc định migration-report/<thời điểm>), --project <mã dự án>.
// Kết nối: DATABASE_URL trong .env (hoặc biến môi trường).

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { projectFromRow } from '../server/db.ts';
import { MIGRATION_USER, planProjectMigration, type ProjectMigration } from '../server/progressMigration.ts';
import type { ProgressEntry, ProgressSide, ProjectStepProgress } from '../src/lib/stepProgress.ts';

dotenv.config();
const args = process.argv.slice(2);
const has = (flag: string) => args.includes(flag);
const valueOf = (flag: string) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const MODE = has('--revert') ? 'revert' : has('--apply') ? 'apply' : 'dry-run';
const ONLY = valueOf('--project');
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT = path.resolve(valueOf('--out') || path.join('migration-report', `${stamp}_${MODE}`));

function poolConfig() {
  let url = String(process.env.DATABASE_URL || '').replace(/[\r\n]/g, '').trim()
    .replace(/^DATABASE_URL\s*=\s*/i, '').replace(/^["']|["']$/g, '');
  if (!url || url.includes('MY_DATABASE_URL')) {
    throw new Error('DATABASE_URL chưa được cấu hình (hoặc đang là MY_DATABASE_URL = chế độ In-Memory).');
  }
  const u = new URL(url);
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  const sslOff = u.searchParams.get('sslmode') === 'disable';
  u.searchParams.delete('sslmode');
  return {
    target: `${u.hostname}:${u.port || '5432'}/${u.pathname.slice(1)}`,
    config: { connectionString: u.toString(), ssl: local || sslOff ? false : { rejectUnauthorized: false }, max: 1, connectionTimeoutMillis: 20000 }
  };
}

const parseArray = (v: any) => {
  if (Array.isArray(v)) return v;
  try { const x = JSON.parse(v); return Array.isArray(x) ? x : []; } catch { return []; }
};

async function readState(client: pg.PoolClient) {
  const projects = (await client.query('SELECT * FROM projects ORDER BY length(id), id')).rows.map(r => projectFromRow(r));
  const processes = (await client.query('SELECT * FROM db_processes ORDER BY id ASC')).rows
    .map(r => ({ id: r.id, name: r.name, parentSteps: parseArray(r.parent_steps) }));
  const projectStages = (await client.query('SELECT * FROM db_project_stages ORDER BY display_order ASC')).rows
    .map(r => ({ name: r.name, milestones: parseArray(r.milestones), sortOrder: r.display_order }));
  const legacyActual: Record<string, any> = {};
  (await client.query('SELECT project_id, data FROM project_actual_progress')).rows.forEach(r => {
    legacyActual[r.project_id] = typeof r.data === 'string' ? JSON.parse(r.data) : (r.data || {});
  });
  const exists = (await client.query("SELECT to_regclass('public.project_progress') AS t")).rows[0]?.t;
  const rows: Record<string, ProjectStepProgress> = {};
  if (exists) {
    (await client.query('SELECT * FROM project_progress')).rows.forEach(r => {
      const e: ProgressEntry = {};
      if (r.plan_date) e.planDate = r.plan_date;
      if (r.actual_date) e.actualDate = r.actual_date;
      if (r.expected_date) e.expectedDate = r.expected_date;
      if (r.status) e.status = r.status;
      if (r.note) e.note = r.note;
      const atts = parseArray(r.attachments);
      if (atts.length) e.attachments = atts;
      const next = parseArray(r.next_step_ids);
      if (next.length) e.nextStepIds = next.map(String);
      if (r.source) e.source = r.source;
      if (r.updated_by) e.updatedBy = r.updated_by;
      if (r.updated_at) e.updatedAt = new Date(r.updated_at).toISOString();
      const pid = String(r.project_id);
      rows[pid] = rows[pid] || {};
      rows[pid][r.step_key] = { ...(rows[pid][r.step_key] || {}), [r.side]: e };
    });
  }
  return { projects, meta: { processes, projectStages }, legacyActual, rows, progressTableExists: !!exists };
}

// ─── Báo cáo ────────────────────────────────────────────────────────────────────────────────────────
const vn = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso || '');
const csvCell = (v: any) => { const s = String(v ?? ''); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

function writeReport(results: ProjectMigration[], info: { target: string; progressTableExists: boolean; legacyCount: number }) {
  fs.mkdirSync(OUT, { recursive: true });
  const totalRows = results.reduce((n, r) => n + r.rowsToWrite, 0);
  const withActions = results.filter(r => r.milestones.some(m => m.actions.length));
  const conflicts = results.flatMap(r => r.milestones.flatMap(m => m.conflicts.map(c => ({ r, m, c }))));
  const warnings = results.flatMap(r => r.milestones.flatMap(m => m.warnings.filter(w => !w.includes('"Đã xong"')).map(w => ({ r, m, w }))));
  const changed = results.filter(r => r.stepChanged);
  const lost = results.flatMap(r => r.milestones.filter(m =>
    (['cdtActual', 'nnActual'] as const).some(k => m.old[k] && !m.new[k])).map(m => ({ r, m })));

  const md: string[] = [];
  md.push(`# Báo cáo chuyển dữ liệu tiến độ – ${MODE === 'dry-run' ? 'CHẠY THỬ (không ghi)' : 'ĐÃ GHI'}`, '');
  md.push(`- Thời điểm: ${new Date().toLocaleString('vi-VN')}`, `- CSDL: ${info.target}`);
  md.push(`- Bảng project_progress: ${info.progressTableExists ? 'đã có' : 'CHƯA có (sẽ được tạo khi ghi)'}`);
  md.push(`- Số dự án: ${results.length} · có tiến độ thực tế ở bảng cũ: ${info.legacyCount}`);
  md.push(`- Dự án có giá trị mốc được ghi xuống bước: ${withActions.length}`);
  md.push(`- Dự án giữ bước đang lưu bằng trạng thái "Đang xử lý": ${results.filter(r => r.storedStepNote.startsWith('ghi')).length}`);
  md.push(`- Số dòng sẽ ghi vào project_progress: ${totalRows}`, '');
  md.push('## 1. Kiểm tra mất dữ liệu', '');
  md.push(lost.length === 0
    ? '✅ Không mốc nào mất ngày thực tế (TT) so với dữ liệu cũ.'
    : `⚠️ ${lost.length} mốc có TT ở dữ liệu cũ nhưng không hiện sau khi chuyển:`);
  lost.forEach(({ r, m }) => md.push(`- ${r.code} – ${m.name}: cũ TT CĐT ${vn(m.old.cdtActual)} / CQNN ${vn(m.old.nnActual)} → mới ${vn(m.new.cdtActual)} / ${vn(m.new.nnActual)}`));
  md.push('', `## 2. Bước hiện tại thay đổi (${changed.length} dự án)`, '');
  md.push('Bước đang lưu trong hồ sơ dự án so với bước tính từ tiến độ sau khi chuyển.', '');
  if (changed.length) {
    md.push("| Mã | Dự án | Bước đang lưu | Bước sau khi chuyển | Lý do |", "|---|---|---|---|---|");
    changed.forEach(r => md.push(`| ${r.code} | ${r.name} | ${r.storedStep || "—"} | ${r.newStep || "—"} | ${r.storedStepNote} |`));
  }
  md.push('', `## 3. Lệch giữa dữ liệu cũ và dữ liệu theo bước (${conflicts.length}) – giữ theo bước`, '');
  conflicts.forEach(({ r, m, c }) => md.push(`- ${r.code} – ${m.name}: ${c}`));
  md.push('', `## 4. Cảnh báo (${warnings.length})`, '');
  warnings.forEach(({ r, m, w }) => md.push(`- ${r.code} – ${m.name}: ${w}`));
  const noProcess = results.filter(r => !r.processFound);
  if (noProcess.length) {
    md.push('', '## 5. Dự án không tìm thấy quy trình', '');
    noProcess.forEach(r => md.push(`- ${r.code} – ${r.name} (processId "${r.processId}")`));
  }
  md.push('', 'Chi tiết từng mốc: `milestones.csv` (mở bằng Excel); dữ liệu sẽ ghi: `details.json`.');
  fs.writeFileSync(path.join(OUT, 'summary.md'), md.join('\n'), 'utf8');

  const head = ['Mã dự án', 'Tên dự án', 'Quy trình', 'Mốc', 'Liên kết thủ tục',
    'KH CĐT cũ', 'KH CĐT mới', 'KH CQNN cũ', 'KH CQNN mới', 'TT CĐT cũ', 'TT CĐT mới', 'TT CQNN cũ', 'TT CQNN mới',
    'Ghi xuống bước', 'Lệch (giữ theo bước)', 'Cảnh báo'];
  const lines = [head.map(csvCell).join(',')];
  results.forEach(r => r.milestones.forEach(m => {
    if (!Object.values(m.old).some(Boolean) && !Object.values(m.new).some(Boolean)) return;
    lines.push([r.code, r.name, r.processId, m.name, m.linked ? 'Có' : 'Không (mốc riêng)',
      vn(m.old.cdtPlan), vn(m.new.cdtPlan), vn(m.old.nnPlan), vn(m.new.nnPlan),
      vn(m.old.cdtActual), vn(m.new.cdtActual), vn(m.old.nnActual), vn(m.new.nnActual),
      m.actions.join('; '), m.conflicts.join('; '), m.warnings.join('; ')].map(csvCell).join(','));
  }));
  fs.writeFileSync(path.join(OUT, 'milestones.csv'), '﻿' + lines.join('\r\n'), 'utf8');
  fs.writeFileSync(path.join(OUT, 'details.json'), JSON.stringify(results.map(({ before, ...r }) => r), null, 2), 'utf8');
  return { totalRows, lost: lost.length, changed: changed.length, conflicts: conflicts.length };
}

// ─── Ghi ────────────────────────────────────────────────────────────────────────────────────────────
const CREATE_PROGRESS_TABLE = `
  CREATE TABLE IF NOT EXISTS project_progress (
    project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    step_key TEXT NOT NULL,
    side VARCHAR(10) NOT NULL,
    plan_date VARCHAR(10),
    actual_date VARCHAR(10),
    expected_date VARCHAR(10),
    status TEXT,
    note TEXT,
    attachments JSONB DEFAULT '[]'::jsonb,
    next_step_ids JSONB,
    source VARCHAR(20),
    updated_by TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (project_id, step_key, side)
  );
  ALTER TABLE project_progress ADD COLUMN IF NOT EXISTS plan_source VARCHAR(10);`;

async function writeRows(client: pg.PoolClient, r: ProjectMigration) {
  for (const [key, sides] of Object.entries(r.after)) {
    for (const side of ['cdt', 'nn'] as ProgressSide[]) {
      const e = sides?.[side];
      if (!e || e.updatedBy !== MIGRATION_USER) continue;
      if (JSON.stringify(e) === JSON.stringify(r.before[key]?.[side] ?? null)) continue;
      await client.query(`
        INSERT INTO project_progress (project_id, step_key, side, plan_date, actual_date, expected_date, status, note, attachments, next_step_ids, source, updated_by, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, COALESCE($13::timestamp, CURRENT_TIMESTAMP))
        ON CONFLICT (project_id, step_key, side) DO UPDATE SET
          plan_date = EXCLUDED.plan_date, actual_date = EXCLUDED.actual_date, expected_date = EXCLUDED.expected_date,
          status = EXCLUDED.status, note = EXCLUDED.note, attachments = EXCLUDED.attachments,
          next_step_ids = EXCLUDED.next_step_ids, source = EXCLUDED.source, updated_by = EXCLUDED.updated_by,
          updated_at = EXCLUDED.updated_at`, [
        r.id, key, side, e.planDate || null, e.actualDate || null, e.expectedDate || null,
        e.status || null, e.note || null, JSON.stringify(e.attachments || []),
        e.nextStepIds ? JSON.stringify(e.nextStepIds) : null, e.source || null, e.updatedBy || null, e.updatedAt || null
      ]);
    }
  }
}

async function main() {
  const { target, config } = poolConfig();
  console.log(`Chế độ: ${MODE} · CSDL: ${target}`);
  const pool = new pg.Pool(config);
  const client = await pool.connect();
  try {
    if (MODE === 'revert') {
      await client.query('BEGIN');
      const exists = (await client.query("SELECT to_regclass('public.project_progress') AS t")).rows[0]?.t;
      const n = exists ? (await client.query('DELETE FROM project_progress WHERE updated_by = $1', [MIGRATION_USER])).rowCount : 0;
      await client.query('COMMIT');
      console.log(`Đã xóa ${n} dòng do lần chuyển dữ liệu ghi.`);
      return;
    }

    // Chạy thử: mọi câu lệnh trong transaction READ ONLY, PostgreSQL từ chối mọi thao tác ghi
    await client.query(MODE === 'apply' ? 'BEGIN' : 'BEGIN TRANSACTION READ ONLY');
    const state = await readState(client);
    const projects = ONLY ? state.projects.filter(p => p.code === ONLY || String(p.id) === ONLY) : state.projects;
    const results = projects.map(p => planProjectMigration(p, state.meta, state.legacyActual[p.id] || {}, state.rows[p.id]));
    const summary = writeReport(results, {
      target, progressTableExists: state.progressTableExists,
      legacyCount: projects.filter(p => Object.keys(state.legacyActual[p.id] || {}).length > 0).length
    });

    if (MODE === 'apply') {
      // Bản chụp project_progress trước khi ghi
      if (state.progressTableExists) {
        const snap = (await client.query('SELECT * FROM project_progress')).rows;
        fs.writeFileSync(path.join(OUT, 'project_progress_before.json'), JSON.stringify(snap, null, 2), 'utf8');
      }
      await client.query(CREATE_PROGRESS_TABLE);
      for (const r of results) await writeRows(client, r);
      await client.query('COMMIT');
      console.log(`Đã ghi ${summary.totalRows} dòng vào project_progress.`);
    } else {
      await client.query('ROLLBACK');
      console.log(`Chạy thử xong, không ghi gì. Sẽ ghi ${summary.totalRows} dòng.`);
    }
    console.log(`Mất TT: ${summary.lost} · Bước hiện tại đổi: ${summary.changed} · Lệch (giữ theo bước): ${summary.conflicts}`);
    console.log(`Báo cáo: ${OUT}`);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* not in a transaction */ }
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error('Lỗi:', err?.message || err); process.exit(1); });
