# Hướng dẫn cập nhật DB và kiểm tra trên server thật – Đồng bộ tiến độ (đợt 3)

> Ngày soạn: 06/10/2026. Áp dụng cho bản code có bảng `project_progress` (tiến độ theo bước ↔ theo mốc).
> Các lệnh chạy ở **máy phát triển** (thư mục `NOXH_ketnoiAPI`, PowerShell), trừ bước deploy chạy trên server.

## Tóm tắt thứ tự

| # | Việc | Ghi vào DB? |
|---|---|---|
| 0 | Kiểm tra đang trỏ đúng DB | Không |
| 1 | Backup DB | Không |
| 2 | Chuyển NOXH-HCM-21 sang quy trình p1 | **Có** (1 dự án) |
| 3 | Chạy thử chuyển dữ liệu, đọc báo cáo | Không |
| 4 | Tạm dừng app trên server | Không |
| 5 | Chuyển dữ liệu thật | **Có** (thêm dòng vào bảng mới, không xóa gì; lần chạy 06/10/2026 ghi 467 dòng) |
| 6 | Deploy bản build mới, bật lại app | Có (server tự tạo bảng nếu chưa có) |
| 7 | Kiểm tra sau deploy | Không |

Thời gian app dừng (bước 4 → 6): khoảng 5–10 phút.

---

## Bước 0 – Kiểm tra đang trỏ đúng DB

```powershell
Select-String -Path .env -Pattern '^DATABASE_URL' | ForEach-Object { $_.Line -replace '//.*@', '//***@' }
```
Phải thấy `...@192.168.1.2:5432/NOXH...`. Đồng thời mở `.env` trên **server thật** (vd. `C:\www\noxh\.env`) để chắc server cũng dùng đúng DB này. Nếu khác nhau → dừng lại, báo lại trước khi làm tiếp.

## Bước 1 – Backup DB

Cách A – pgAdmin: chuột phải database **NOXH** → **Backup…** → Format: *Custom* → đặt tên `NOXH_truoc-dot3_20261006.backup` → **Backup**.

Cách B – dòng lệnh (trên máy có cài PostgreSQL, đổi số phiên bản `16` cho đúng):
```powershell
& "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe" -h 192.168.1.2 -U <user_db> -d NOXH -F c -f "NOXH_truoc-dot3_20261006.backup"
```
Kiểm tra file backup có dung lượng > 0 trước khi đi tiếp.

## Bước 2 – Chuyển NOXH-HCM-21 sang quy trình p1

Chạy thử (không ghi):
```powershell
npx tsx scripts/fix-hcm21-process.mts
```
Phải thấy: `quy trình p3 → p1; bước đang lưu "Thẩm định chủ trương đầu tư" = cs3 của p1` và `Chạy thử, không ghi gì.`

Ghi thật:
```powershell
npx tsx scripts/fix-hcm21-process.mts --apply
```
Phải thấy `Đã ghi. Dữ liệu cũ: _backups\2026-10-06_5_hcm21-quy-trinh\NOXH-HCM-21_truoc-sua.json`.

## Bước 3 – Chạy thử chuyển dữ liệu

```powershell
npm run migrate:progress
```
Kết quả mong đợi:
```
Chạy thử xong, không ghi gì. Sẽ ghi <N> dòng (06/10/2026: 467).
Mất TT: 0 · Bước hiện tại đổi: 0 · Lệch (giữ theo bước): 0
```
Mở file `summary.md` trong thư mục báo cáo vừa in ra. Phần **1** phải là ✅, phần **2** phải trống (0 dự án). Phần **4** chỉ còn 2 cảnh báo của HCM-40/41 (đã xác nhận để nguyên).
Nếu số khác với mong đợi → dừng, gửi file `summary.md` để kiểm tra.

## Bước 4 – Tạm dừng app trên server

Trên server:
```powershell
pm2 stop noxh-app
```
(Dừng để không ai nhập tiến độ vào bản cũ trong lúc chuyển dữ liệu.)

## Bước 5 – Chuyển dữ liệu thật

Ở máy phát triển:
```powershell
npx tsx scripts/migrate-progress.ts --apply
```
Phải thấy `Đã ghi <N> dòng vào project_progress. Dòng đầu phải là `Chế độ: apply`.` Script chạy trong 1 transaction: lỗi giữa chừng thì không ghi gì cả.

Kiểm tra lại ngay (chạy thử lần nữa):
```powershell
npm run migrate:progress
```
Phải thấy **`Sẽ ghi 0 dòng`** – nghĩa là toàn bộ dữ liệu đã nằm trong bảng mới.

## Bước 6 – Deploy bản build mới

Copy source mới lên server (như mục *Quy trình cập nhật khi có code mới* trong `HuongDanDeploy.md`), rồi trên server:
```powershell
cd C:\www\noxh
npm install
npm run build
pm2 restart noxh-app
pm2 logs noxh-app --lines 30
```
Trong log phải có `Successfully connected to PostgreSQL database at 192.168.1.2...` và không có dòng lỗi đỏ.

## Bước 7 – Kiểm tra trên server thật

Đăng nhập bằng tài khoản Admin/SXD rồi kiểm tra theo bảng sau.

### 7.1 Danh sách dự án – cột "Bước hiện tại"
| Dự án | Bước hiện tại mong đợi |
|---|---|
| NOXH-HCM-02 | Chấp thuận chủ trương đầu tư |
| NOXH-HCM-12 | Chấp thuận chủ trương đầu tư |
| NOXH-HCM-14 | Phê duyệt / có ý kiến địa phương trường hợp dự án có NOXH có bố trí 20% diện tích đất làm nhà ở Thương mại |
| NOXH-HCM-21 | Thẩm định chủ trương đầu tư (quy trình p1) |
| NOXH-HCM-40 | Cấp giấy phép xây dựng |

Các dự án khác: bước hiện tại phải **giống hệt trước khi deploy**.

> Cập nhật 08/10/2026: bảng trên theo giá trị đang lưu trong DB thật (đã kiểm tra sau khi chạy migration: "Bước hiện tại đổi: 0").
> Lưu ý PowerShell: `npm run ... -- --apply` làm mất cờ `--apply` (script chạy ở chế độ chạy thử). Luôn gọi thẳng `npx tsx scripts/migrate-progress.ts --apply`.

### 7.2 Sơ đồ Gantt (combobox giai đoạn = CHUẨN BỊ ĐẦU TƯ)
| Dự án | Mốc | Mong đợi |
|---|---|---|
| NOXH-HCM-02 | QH 1/500 | TT CĐT 25/04/2026 · TT CQNN 03/05/2026 (xanh – đã xong) |
| NOXH-HCM-02 | Chấp thuận chủ trương | KH 04/05/2026 → 12/06/2026, chưa có TT |
| NOXH-HCM-12 | QH 1/500 | TT 19/11/2016 · 16/12/2016 |
| NOXH-HCM-12 | HTKT/ĐTM | TT 17/12/2016 · 06/01/2017 |
| NOXH-HCM-14 | Chấp thuận chủ trương | TT 10/04/2026 · 09/07/2026 |
| NOXH-HCM-14 | QH 1/500 | TT 25/09/2023 · 13/10/2023 |
| NOXH-HCM-21 | Chấp thuận chủ trương | KH 28/04/2026 → 22/05/2026 |

Tổng số dự án có ít nhất một mốc đã có TT CQNN: **26** (như trước).

### 7.3 Đồng bộ 2 chiều – chọn 1 dự án để thử (vd. NOXH-HCM-02), ghi nhớ để hoàn tác
1. Sơ đồ Gantt → chi tiết NOXH-HCM-02 → mốc **Chấp thuận chủ trương** → "+ nhập TT" → nhập ngày CĐT nộp hôm nay → Lưu.
2. Danh sách dự án → **Cập nhật** NOXH-HCM-02 → card "Tiến độ chủ đầu tư" ở bước đầu thủ tục chủ trương phải hiện đúng ngày vừa nhập.
3. Xóa ngày vừa nhập (để trống → Lưu) để trả lại như cũ.

### 7.4 Các màn khác mở được, không lỗi
Dashboard điều hành · Dashboard TP.HCM · Cập nhật kế hoạch dự án (cột mốc lấy từ danh mục) · Danh mục Giai đoạn & Mốc (thử xóa mốc "PCCC" → phải bị chặn với thông báo "đang được … thủ tục liên kết").

---

## Nếu có sự cố – hoàn tác

| Tình huống | Cách xử lý |
|---|---|
| Số liệu sau deploy sai, muốn bỏ dữ liệu vừa chuyển | `npx tsx scripts/migrate-progress.ts --revert` (xóa các dòng do lần chuyển ghi; dữ liệu cũ vẫn còn nguyên) rồi deploy lại bản cũ |
| Muốn trả HCM-21 về p3 | `npx tsx scripts/fix-hcm21-process.mts --restore _backups/2026-10-06_5_hcm21-quy-trinh/NOXH-HCM-21_truoc-sua.json` |
| Muốn trả cấu hình mốc p3 về cũ | `npx tsx scripts/fix-p3-milestones.mts --restore _backups/2026-10-06_4_cau-hinh-p3/p3_parent_steps_truoc-sua.json` |
| Hỏng nặng | Khôi phục file backup ở Bước 1 (pgAdmin → Restore) |

**Không xóa** bảng `project_actual_progress` và các cột mốc cũ (`*_cdt_date`, `*_nn_date`) trong đợt này – giữ lại ít nhất vài tuần sau khi chạy ổn định.
