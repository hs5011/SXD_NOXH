# Báo cáo QA theo role — 2026-10-22

Test trên server in-memory riêng (cổng 3021–3026), không chạm DB thật. Lỗi do 6 agent tự báo sau khi tái hiện; chưa được kiểm lại độc lập.

| Role | Tài khoản | Critical | High | Medium | Low | Tổng |
|---|---|---|---|---|---|---|
| Admin | admin | 0 | 1 | 10 | 14 | 25 |
| Lãnh đạo SXD | sxd | 0 | 1 | 9 | 11 | 21 |
| Lãnh đạo SNNMT | snnmt | 0 | 2 | 5 | 12 | 19 |
| Chủ đầu tư | cdt | 0 | 2 | 7 | 13 | 22 |
| Phường Bình Đông | phuong_binhdong | 0 | 1 | 4 | 7 | 12 |
| Lãnh đạo SQHKT | sqhkt | 0 | 0 | 5 | 11 | 16 |

## Lỗi lặp lại ở nhiều role (ưu tiên sửa)

1. **PUT /api/projects/:id thiếu trường → totalArea/height/apartmentCount thành null** (progress về 0). Thấy ở: Admin A-01, SXD-04, CĐT-07, Phường W-04. Với PostgreSQL, dbUpdateProject ghi mọi cột. [High]
2. **Kế hoạch bước (applyPlanChanges / milestones / *_cdt_date / *_nn_date) không kiểm quyền từng bước**: role bất kỳ sửa được kế hoạch của cơ quan khác và cột CĐT. SNNMT SN-01 (High), SQHKT SQ-02, CĐT-01 (High), Phường W-03. UI "Kế hoạch" mở cho sửa nhưng server bỏ qua/ghi bậy, lịch sử ghi sai. [High]
3. **CĐT sửa được status/progress/currentStep/stage** của dự án mình (CĐT-02). [High]
4. **PUT /api/actual-progress/:id body {} trả 200 kèm tiến độ dự án ngoài phạm vi** (thiếu requireProjectAccess, server.ts ~1237). Phường W-02, SQHKT SQ-01. [Medium]
5. **Giao song song nextStepIds [cs6, cs61]**: cơ quan có bước đang mở (SNNMT) không thấy dự án và bị 403. SNNMT SN-02 (High), SXD-10. [High]
6. **Chọn bước theo TÊN khi tên trùng** (SQHKT cs54/cs418 vs phường cs541/cs4181): Cập nhật tiến độ chọn sai bước/cơ quan, dropdown "Bước tiếp theo" không ghi cơ quan, id trùng giữa quy trình làm lịch sử ghi sai tên bước. Phường W-01 (High), SQ-03, SQ-06. Dropdown còn liệt kê bước đã hoàn thành (SN-10, SQ-03, SXD-17).
7. **Số liệu "chậm tiến độ" không thống nhất**: màn Cập nhật/API báo Delayed, Dashboard/Gantt/Danh sách báo 0. W-05, SN-04, SXD-09. Cần xác nhận lại trên dữ liệu thật (seed in-memory không liên kết mốc).
8. **Sau khi chuyển bước, tab Hồ sơ/Lịch sử báo "không có" sai** do 403 bị nuốt; dự án biến mất không thông báo. SN-03, SQ-04, SQ-05.
9. **PUT /api/metadata/:key nhận key tùy ý và body sai kiểu**; `__proto__`/`constructor` trả 500. SXD-01 (High), SXD-02, A-11.
10. **POST/PUT dự án và user không kiểm tham chiếu danh mục** (processId 'zzz', chủ đầu tư/nhóm/địa điểm/trạng thái lạ, roleId tùy ý, investorId không tồn tại) → dự án mồ côi quy trình. A-03/05/07, SXD-05/07.
11. **Thiếu validate độ dài/biên**: tên 10.000–100.000 ký tự, totalArea 1e30, progress 500/999, fullName 5000, mật khẩu 100.000 ký tự hoặc '1', avatar `javascript:`, history rỗng/100KB/giả actionType (CĐT-04), mass-assignment trường lạ.
12. **Upload**: tên 300 ký tự → 500 nhưng vẫn tạo bản ghi mồ côi (A-09, CĐT-03); tệp nhỏ hiện "0 KB"; tên "README" bị coi là đuôi.

## Lỗi riêng từng role (Medium trở lên)

**Admin:** A-02 POST /api/pm2/action body rỗng mặc định chạy pm2 restart thật; A-04 mật khẩu '1' được nhận; A-06 username có khoảng trắng lưu không trim → đăng nhập 401 mãi; A-10 đổi tên giai đoạn "CHUẨN BỊ ĐẦU TƯ" → tab "0 mốc" (hard-code ở AnnualProgressUpdate.tsx:389, Dashboard.tsx:98).
**SXD:** SXD-03 đổi tên cơ quan qua PUT không cascade; SXD-06 tự đổi cơ quan của mình → tự khóa quyền; SXD-08 xóa ngày CQNN: lịch sử ghi xóa nhưng nnActual còn.
**CĐT:** CĐT-05 lưu tiến độ trống sinh log trùng + toast sai; CĐT-06 badge "ĐANG XỬ LÝ" cho dự án Hoàn thành (HousingUpdateView.tsx ~1033); CĐT-09 đổi mật khẩu không giới hạn độ dài.
**SQHKT:** SQ-05 đóng mốc QH 1/500 qua /progress/milestone nhảy cả loạt bước sang cs420.
**Phường:** F-00 tài khoản phuong_binhdong không có trong seed in-memory (login 401).

## Lỗi Low phổ biến
Chữ "Công bộ thông tin", "and" thay "và" trong tên thủ tục seed; thông báo 403 lặp "Sở Xây dựng (hoặc Sở Xây dựng)"; huy hiệu "CHẬM TIẾN ĐỘ" màu xanh lá; Recharts warning width(-1); DELETE/rename mục không tồn tại trả 200; /api/db-status không cần token; JWT 7 ngày, CORS `*`, thiếu header bảo mật; cột "Thao tác" bị cắt ở 1366px; khối tài khoản thử nghiệm hiện mật khẩu (có chủ đích).

## Đã kiểm tra, đạt
Cô lập dữ liệu theo cơ quan/CĐT/phường (không tái hiện được IDOR đọc history/attachments/upload/download/PUT/step); endpoint admin 403; JWT alg=none/sửa payload bị từ chối; khóa đăng nhập 429; đổi mật khẩu thu hồi token; chặn trùng username/email/phone; upload chặn .exe/rỗng/>20MB; mobile 375px không tràn ngang.

## Chưa test / không kết luận
Xuất báo cáo/Excel (SXD, SQHKT), ô tìm kiếm header, drill-down Dashboard (SNNMT), mobile sâu (Admin, SQHKT), form Sửa dự án và Cấu hình quy trình bằng UI (Admin, SXD).

## Sự cố do agent test gây ra
Agent Admin đã chạy thật `pm2 restart noxh-app` trên máy dev (tự online lại, không mất dữ liệu) và `taskkill chrome.exe` (có thể đóng Chrome của người dùng). Đã dọn file upload của riêng agent đó.
