// Xóa các bản ghi GIẢ mà phiên bản cũ của server tự nạp vào DB khi bảng còn trống:
//   • project_attachments: 3 tệp mẫu / dự án (không có file thật trong thư mục uploads)
//   • project_history:     2 dòng lịch sử mẫu / dự án ("Trần Văn B", "Hệ thống")
// Dự án, tiến độ thực tế và mọi tệp/lịch sử do người dùng tạo KHÔNG bị động tới.
//
// Cách dùng (chạy từ thư mục gốc dự án, cần kết nối được DB trong .env):
//   node scripts/cleanup-sample-records.cjs           → chỉ XEM TRƯỚC, không xóa gì
//   node scripts/cleanup-sample-records.cjs --apply   → sao lưu ra scripts/backups/…json rồi xóa (1 transaction)
require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const APPLY = process.argv.includes("--apply");
const UPLOADS_DIR = path.join(process.cwd(), "uploads");

// Exact content the old seeding code inserted
const SAMPLE_ATTACHMENTS = [
  { name: "Quyết định phê duyệt quy hoạch 1/500 - Lần 1.pdf", size: "2.4 MB", type: "PDF" },
  { name: "Báo cáo kết quả thẩm định thiết kế cơ sở.pdf", size: "5.1 MB", type: "PDF" },
  { name: "Văn bản nghiệm thu hệ thống PCCC.pdf", size: "1.8 MB", type: "PDF" }
];
const SAMPLE_HISTORY = [
  { user: "Trần Văn B", action: "update_status", text: "Thay đổi trạng thái từ [Chờ bổ sung hồ sơ] sang [Đang xử lý]. Đã nhận đủ hồ sơ bản vẽ điều chỉnh." },
  { user: "Hệ thống", action: "create_project", text: "Khởi tạo hồ sơ thông tin dự án trên hệ thống và liên kết sơ đồ Gantt nhà ở xã hội." }
];

function connectionConfig() {
  const raw = (process.env.DATABASE_URL || "").trim().replace(/^"|"$/g, "");
  if (raw) {
    const url = new URL(raw);
    const noSsl = url.searchParams.get("sslmode") === "disable" || ["localhost", "127.0.0.1"].includes(url.hostname);
    url.searchParams.delete("sslmode");
    return { connectionString: url.toString(), ssl: noSsl ? false : { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 };
  }
  return { connectionTimeoutMillis: 10000 }; // PGHOST/PGUSER/… from the environment
}

(async () => {
  const client = new Client(connectionConfig());
  await client.connect();
  try {
    // Attachments: sample name + size + type, and no real file on disk
    const attRows = [];
    for (const a of SAMPLE_ATTACHMENTS) {
      const r = await client.query(
        "SELECT * FROM project_attachments WHERE name = $1 AND size = $2 AND file_type = $3",
        [a.name, a.size, a.type]
      );
      attRows.push(...r.rows);
    }
    const fakeAttachments = attRows.filter(row => !fs.existsSync(path.join(UPLOADS_DIR, `attachment_${row.id}_${row.name}`)));
    const keptBecauseFileExists = attRows.length - fakeAttachments.length;

    // History: exact sample author + action + text
    const fakeHistory = [];
    for (const h of SAMPLE_HISTORY) {
      const r = await client.query(
        "SELECT * FROM project_history WHERE user_name = $1 AND action_type = $2 AND description = $3",
        [h.user, h.action, h.text]
      );
      fakeHistory.push(...r.rows);
    }

    const totals = {
      attachments: Number((await client.query("SELECT COUNT(*) FROM project_attachments")).rows[0].count),
      history: Number((await client.query("SELECT COUNT(*) FROM project_history")).rows[0].count)
    };
    console.log(JSON.stringify({
      mode: APPLY ? "APPLY" : "DRY-RUN (không xóa gì)",
      attachmentsTotal: totals.attachments,
      sampleAttachmentsFound: fakeAttachments.length,
      sampleAttachmentsKeptBecauseRealFileExists: keptBecauseFileExists,
      historyTotal: totals.history,
      sampleHistoryFound: fakeHistory.length
    }, null, 2));

    if (!APPLY) {
      console.log("→ Chạy lại với --apply để sao lưu và xóa các bản ghi mẫu trên.");
      return;
    }

    const backupDir = path.join(process.cwd(), "scripts", "backups");
    fs.mkdirSync(backupDir, { recursive: true });
    const backupFile = path.join(backupDir, `sample-records-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(backupFile, JSON.stringify({ attachments: fakeAttachments, history: fakeHistory }, null, 2));
    console.log("Đã sao lưu:", backupFile);

    await client.query("BEGIN");
    const delAtt = fakeAttachments.length
      ? await client.query("DELETE FROM project_attachments WHERE id = ANY($1)", [fakeAttachments.map(r => r.id)])
      : { rowCount: 0 };
    const delHist = fakeHistory.length
      ? await client.query("DELETE FROM project_history WHERE id = ANY($1)", [fakeHistory.map(r => r.id)])
      : { rowCount: 0 };
    await client.query("COMMIT");
    console.log(JSON.stringify({ deletedAttachments: delAtt.rowCount, deletedHistory: delHist.rowCount }));
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    throw err;
  } finally {
    await client.end();
  }
})().catch(err => {
  console.error("LỖI:", err.message);
  process.exit(1);
});
