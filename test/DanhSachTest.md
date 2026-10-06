# Danh Sách Test — Hệ thống NOXH

> **Cập nhật**: 05/10/2026 — đồng bộ toàn bộ test với source sau đợt rà soát phân quyền theo role,
> thống nhất ngày dd/MM/yyyy và bổ sung kiểm tra dữ liệu đầu vào. Vitest **1248/1248 pass**.
> Các mục chi tiết bên dưới (1.x–4.x) giữ nguyên từ đợt 08/07/2026; thay đổi của đợt này ở mục
> **0** ngay dưới đây.
> **Công cụ**: Vitest (unit/integration/component) + Playwright (E2E)

---

## Tổng quan nhanh

| Nhóm | Công cụ | Số file | Số tests | Trạng thái (05/10/2026) |
|------|---------|---------|---------|---------|
| Unit | Vitest | 6 | 125 | ✅ Pass 100% |
| Integration | Vitest | 9 | 385 | ✅ Pass 100% |
| Component | Vitest | 18 | 738 | ✅ Pass 100% |
| E2E chỉ đọc (DB thật) | Playwright | 4 | 85 | ✅ Pass 100% |
| E2E có ghi dữ liệu (dữ liệu thử) | Playwright | 4 | 89 | ✅ Pass 100% |
| **Tổng** | | **41** | **1422** | |

---

## Chạy tests

```bash
# Vitest (unit + integration + component) – không cần DB, luôn chạy In-Memory
npm test

# E2E CHỈ ĐỌC trên DB thật: server bản build ở cổng 3004 (launch.json "dist-realdb-3004")
npx playwright test --config playwright.realdb-readonly.config.ts

# E2E CÓ GHI dữ liệu: KHÔNG BAO GIỜ chạy với DB thật (DB dùng chung với trang live).
# Chạy với server dữ liệu thử ở cổng 3006 (launch.json "e2e-memory-3006", mật khẩu mẫu 123456)
npx playwright test --config playwright.memory-write.config.ts
```

---

## 0. ĐỢT 05/10/2026 — rà soát phân quyền theo role

### File test mới
| File | Tests | Nội dung |
|------|-------|----------|
| `test/unit/stepAgency.test.ts` | 17 | Chuẩn hóa tên cơ quan ("UBND xã phường"), xác định bước theo id khi tên bước trùng, bước kế tiếp khi kết thúc bước không chọn bước tiếp theo, ngày dd/MM/yyyy (`toDisplayDate`, `toDisplayDateTime`, `normalizeDatesInText`) |
| `test/integration/role-review-2026-10-05.test.ts` | 20 | Khởi động **chính server.ts** (In-Memory, cổng 3107) và gọi API thật: quyền theo bước (phường / UBND TP), chỉ Sở Xây dựng đổi thông tin chung, danh mục trùng / đang dùng, cấu hình, kiểm tra dữ liệu đầu vào |

### Test đã sửa cho khớp source (lý do ghi trong comment từng test)
| File | Thay đổi |
|------|----------|
| HousingUpdateView, ProjectDetail, ProjectGanttDetail, CreateProject, DashboardApp | `vi.mock` của `projectUtils` / `lucide-react` đổi sang mock một phần (`importOriginal`) — hết lỗi "No 'X' export is defined on the mock" khi source dùng hàm/icon mới |
| UserManagement | Truyền `currentUser` (Admin); test xóa nhắm tài khoản thường (Admin duy nhất bị chặn xóa); thêm 4 test quyền của Sở Xây dựng không phải Admin |
| DashboardApp | Chủ đầu tư không thấy khối "TIẾN ĐỘ NN"; tiến độ không lưu localStorage; ô bước/cơ quan theo bước quy trình (thêm 1 test) |
| GanttDashboardNOXH | Nút đổi tên "Reset tiến độ thực tế" |
| ProjectList, e2e-project-flow | Nút Khởi tạo/Sửa chỉ cho Sở Xây dựng; nhận nút theo title; thông báo "Diện tích không được âm"; ngày 25/05/2026 |
| role-sidebar, e2e permissions.spec 2.4 | Chủ đầu tư không có menu Dashboard App (Sidebar `restrictedForInvestor`) |
| Login, auth (component + e2e) | Khối "Tài khoản thử nghiệm" đang bật (`SHOW_TEST_ACCOUNTS`) — khi chạy chính thức tắt cờ và đổi lại test |
| projectUtils | Kết thúc bước không chọn bước tiếp theo → sang bước kế tiếp (không còn "N/A") |
| e2e gantt-progress G.7, G.9 | Tìm dự án có nút "+ nhập TT" thay vì luôn bấm dòng đầu (trước đây bị skip do dữ liệu) |
| e2e user-management UM.20 | Tài khoản bắt buộc có email → đổi thành kiểm tra tạo tài khoản thiếu email bị chặn |

---

## 1. UNIT TESTS — `test/unit/`

### 1.1 `projectUtils.test.ts` — **48 tests**

**Mô tả**: Kiểm tra các hàm tiện ích xử lý ngày tháng và tính toán trạng thái dự án (`src/lib/projectUtils.ts`)

| Nhóm (describe) | Tests | Nội dung kiểm tra |
|-----------------|-------|-------------------|
| `parseDate` | 15 | Parse định dạng ngày dd/mm/yyyy, yyyy-mm-dd, ISO 8601, các trường hợp invalid |
| `formatDate` | 10 | Format ngày sang dd/mm/yyyy và các edge case |
| `getStepAgency` | 8 | Lấy cơ quan xử lý theo bước và quy trình hiện tại |
| `calculateProjectStatus` | 13 | Tính progress %, xác định currentStep, trạng thái Delayed/On Track, currentAgency |

---

### 1.2 `aiService.test.ts` — **6 tests**

**Mô tả**: Kiểm tra service gọi Google Gemini AI để sinh báo cáo phân tích dự án (`src/lib/aiService.ts`)

| Nhóm (describe) | Tests | Nội dung kiểm tra |
|-----------------|-------|-------------------|
| `generateProjectReport` | 6 | Gọi đúng model, truyền prompt đúng, xử lý response và lỗi API |

---

## 2. INTEGRATION TESTS — `test/integration/`

### 2.1 `api.routes.test.ts` — **187 tests**

**Mô tả**: Kiểm tra tất cả Express API routes bằng Supertest (mock DB layer, không cần PostgreSQL thật)

| Nhóm (describe / endpoint) | Tests | Nội dung kiểm tra |
|----------------------------|-------|-------------------|
| `GET /api/health` | 1 | Trả về status ok |
| `GET /api/db-status` | 4 | Trạng thái kết nối DB, retry |
| `GET /api/data` | 4 | Trả về projects / users / actualProgress / metadata |
| `POST /api/projects` | 3 | Tạo project mới |
| `PUT /api/projects/:id` | 3 | Cập nhật project |
| `DELETE /api/projects/:id` | 3 | Xóa project |
| `GET /api/projects/:id/history` | 2 | Lấy lịch sử thao tác |
| `POST /api/projects/:id/history` | 2 | Tạo bản ghi lịch sử |
| `GET /api/projects/:id/attachments` | 2 | Danh sách file đính kèm |
| `GET /api/attachments/:id/download` | 3 | Download attachment, 404, 400 |
| `GET /api/actual-progress` | 2 | Lấy tiến độ thực tế |
| `PUT /api/actual-progress/:projectId` | 2 | Cập nhật tiến độ |
| `POST /api/actual-progress/reset` | 2 | Reset tiến độ |
| `PUT /api/metadata/:key` | 5 | Cập nhật metadata nhiều loại |
| `GET /api/users` | 2 | Danh sách users |
| `POST /api/users` | 2 | Tạo user mới |
| `PUT /api/users/:id` | 1 | Cập nhật user |
| `DELETE /api/users/:id` | 2 | Xóa user |
| `GET /api/email-config` | 5 | Lấy cấu hình email (ẩn password) |
| `POST /api/email-config` | 3 | Lưu cấu hình SMTP |
| `POST /api/users/:id/recover-password` | 6 | Khôi phục mật khẩu, 404, 400, 500 |

---

### 2.2 `db.test.ts` — **20 tests**

**Mô tả**: Kiểm tra DB layer ở chế độ In-Memory fallback (không cần PostgreSQL)

| Nhóm (describe) | Tests | Nội dung kiểm tra |
|-----------------|-------|-------------------|
| `initDatabase – In-Memory mode` | 2 | Xác nhận mode in-memory khi không có config DB |
| `Projects CRUD – In-Memory` | 7 | Tạo, cập nhật, xóa, đếm số lượng project |
| `Users CRUD – In-Memory` | 6 | Tạo, cập nhật, xóa, đếm số lượng user |
| `Actual Progress – In-Memory` | 2 | Lấy và lưu tiến độ thực tế |
| `Metadata – In-Memory` | 3 | Lấy, cập nhật metadata theo key |

---

### 2.3 `api.upload-policy.test.ts` — **30 tests**

**Mô tả**: Kiểm tra luồng thay đổi cấu hình upload file và chính sách mật khẩu, sau đó xác minh hành vi upload/đổi mật khẩu thay đổi theo cấu hình mới (mock DB layer, không cần PostgreSQL thật)

| Nhóm (describe) | Tests | Nội dung kiểm tra |
|-----------------|-------|-------------------|
| `NHÓM A1 – Upload với cấu hình mặc định` | 5 | ATTACH-01→05: PDF hợp lệ, EXE bị từ chối, oversize, thiếu file, gọi dbCreateProjectAttachment |
| `NHÓM A2 – Thay đổi allowedExtensions` | 6 | UPCFG-01→04,08,09: thêm/xóa định dạng, allowedExtensions rỗng, case-insensitive |
| `NHÓM A3 – Thay đổi maxSizeMb` | 3 | UPCFG-05→07: giảm xuống 5MB, tăng lên 20MB, giảm xuống 3MB |
| `NHÓM B1 – Đổi mật khẩu cơ bản` | 3 | CHPWD-08,09,13: sai mật khẩu cũ, mật khẩu mới quá ngắn, đổi thành công |
| `NHÓM B2 – Thay đổi minLength` | 3 | PWPOL-01→03: minLength mặc định 6, tăng lên 10, mật khẩu đủ 10 ký tự |
| `NHÓM B3 – Bật/tắt requireUppercase` | 3 | PWPOL-04,05,12: bật→từ chối không hoa, bật→chấp nhận có hoa, tắt→chấp nhận |
| `NHÓM B4 – Bật requireNumbers` | 2 | PWPOL-06,07: bật→từ chối không số, bật→chấp nhận có số |
| `NHÓM B5 – Bật requireSpecialChars` | 2 | PWPOL-08,09: bật→từ chối không ký tự đặc biệt, bật→chấp nhận có ký tự đặc biệt |
| `NHÓM B6 – Bật requireLowercase` | 1 | PWPOL-13: bật→từ chối mật khẩu toàn chữ hoa |
| `NHÓM B7 – Kết hợp tất cả quy tắc` | 2 | PWPOL-10,11: "Abc1!" quá ngắn, "Abcdef1!" đủ điều kiện |

---

### 2.4 `api.extended.test.ts` — **27 tests**

**Mô tả**: Kiểm tra các nhóm chức năng bổ sung: Login/xác thực, User Uniqueness, Project Isolation edge cases, Metadata API, Recover Password, Security và DB In-Memory Fallback

| Nhóm (describe) | Tests | Nội dung kiểm tra |
|-----------------|-------|-------------------|
| `NHÓM 1 – Login` | 5 | LOGIN-01→05: thiếu field, sai mật khẩu, username không tồn tại, case-insensitive, plain-text DB |
| `NHÓM 4 – User Uniqueness` | 5 | UNIQ-01→05: trùng email/username/SĐT khi tạo, trùng email khi sửa, sửa chính mình không lỗi |
| `NHÓM 5 – Project Isolation` | 4 | ISO-01→04: agency không có agencyId, investor không có investorId, UBND department rỗng, agency sai bước |
| `NHÓM 6 – Metadata API` | 4 | META-01→04: PUT investors, processes, users thành công; agency thường bị 403 |
| `NHÓM 7 – Recover Password` | 3 | PASS-04→06: user không có email, SMTP chưa cấu hình, mật khẩu tạm hợp lệ theo policy |
| `NHÓM 8 – Security` | 4 | SEC-01→04: JWT giả mạo, JWT hết hạn, /api/data ẩn password, /api/email-config mask password |
| `NHÓM 9 – DB In-Memory Fallback` | 2 | MEM-01→02: CRUD hoạt động khi DB ngắt, /api/db-status trả về mode In-Memory |

---

### 2.5 `api.auth.test.ts` — **70 tests**

**Mô tả**: Kiểm tra phân quyền (RBAC) trên toàn bộ API routes — bao gồm `isSxdOrAdmin`
(agency `agencyId='1'` có quyền như Admin, xem `[[project-agency-permission-model]]`),
JWT hợp lệ/hết hạn/giả mạo, và 401/403 cho từng route theo role.

---

## 3. COMPONENT TESTS — `test/component/`

### 3.1 `Login.test.tsx` — **12 tests**

**Mô tả**: Kiểm tra render form đăng nhập và phản hồi khi sai/đúng thông tin (`Login.tsx`)

| Nhóm (describe) | Tests | Nội dung kiểm tra |
|-----------------|-------|-------------------|
| `Login – render` | 5 | Hiển thị tiêu đề, inputs, nút, hint tài khoản mẫu |
| `Login – sai thông tin` | 3 | Hiện lỗi, không gọi onLogin |
| `Login – đăng nhập thành công` | 4 | Gọi onLogin đúng user object, đăng nhập nhiều tài khoản |

---

### 3.2 `Dashboard.test.tsx` — **8 tests**

**Mô tả**: Kiểm tra render Dashboard tổng quan với dữ liệu dự án (`Dashboard.tsx`)

| Nhóm (describe) | Tests | Nội dung kiểm tra |
|-----------------|-------|-------------------|
| `Dashboard – render cơ bản` | 5 | Tiêu đề, các thẻ trạng thái, tổng số dự án |
| `Dashboard – số liệu từ dữ liệu` | 2 | 0 dự án, 1 dự án hoàn thành |
| `Dashboard – click thẻ` | 1 | Gọi onSeeProjects khi click thẻ |

---

### 3.3 `Sidebar.test.tsx` — **35 tests**

**Mô tả**: Kiểm tra sidebar hiển thị đúng menu theo role và xử lý navigation (`Sidebar.tsx`)

| Nhóm (describe) | Tests | Nội dung kiểm tra |
|-----------------|-------|-------------------|
| `Sidebar – render cơ bản` | 5 | Logo, các nhóm menu chính |
| `Sidebar – menu ĐIỀU HÀNH` | 2 | Tổng quan, Dashboard App |
| `Sidebar – menu QUẢN LÝ TIẾN ĐỘ` | 2 | Gantt NOXH, Cập nhật tiến độ năm |
| `Sidebar – menu QUẢN LÝ` | 2 | Danh sách dự án, Gantt quy trình |
| `Sidebar – HỆ THỐNG (Admin only)` | 13 | Admin thấy đủ menu, non-Admin ẩn |
| `Sidebar – active tab highlighting` | 3 | Highlight đúng tab đang active |
| `Sidebar – navigation callbacks` | 7 | Mỗi click gọi onNavigate đúng id |
| `Sidebar – chuyên viên` | 4 | Vẫn thấy các nhóm menu chung |

---

### 3.4 `UpdateProgress.test.tsx` — **19 tests**

**Mô tả**: Kiểm tra modal cập nhật trạng thái từng bước quy trình của dự án (`UpdateProgress.tsx`)

| Nhóm (describe) | Tests | Nội dung kiểm tra |
|-----------------|-------|-------------------|
| `UpdateProgress – Render cơ bản` | 4 | Tiêu đề, tên dự án, nút hủy/lưu |
| `UpdateProgress – Danh sách bước quy trình` | 4 | Tên bước, cơ quan, phòng ban, 4 trạng thái |
| `UpdateProgress – Dự án không có bước` | 3 | Thông báo khi processSteps rỗng/undefined |
| `UpdateProgress – Thay đổi trạng thái` | 3 | Click thay đổi không crash |
| `UpdateProgress – Hủy bỏ và đóng modal` | 1 | Gọi onClose |
| `UpdateProgress – Lưu thay đổi` | 4 | Loading state, gọi onSuccess đúng dữ liệu |

---

### 3.5 `auth.test.tsx` — **48 tests**

**Mô tả**: Kiểm tra AuthContext (login/logout/RBAC), component Login và hàm hashPassword SHA-256

| Nhóm (describe) | Tests | Nội dung kiểm tra |
|-----------------|-------|-------------------|
| `1A – Khởi tạo AuthContext` | 3 | Render, trạng thái ban đầu, useAuth ngoài Provider |
| `1B – login()` | 6 | Login các role, ghi đè session cũ |
| `1C – logout()` | 3 | Logout, logout khi chưa login, login lại sau logout |
| `1D – RBAC với RoleGuard` | 7 | Chặn/cho phép truy cập theo role |
| `2A – Giao diện form Login` | 6 | Tiêu đề, inputs, nút, hint tài khoản mẫu |
| `2B – Đăng nhập thành công` | 10 | Nhiều tài khoản, case-insensitive, trim, hash password |
| `2C – Đăng nhập thất bại` | 6 | Sai pass, user không tồn tại, pass rỗng |
| `2D – Logic hashPassword (unit)` | 7 | Độ dài 64 hex, deterministic, SHA-256 chuẩn |

---

### 3.6 `ProjectList.test.tsx` — **35 tests**

> Bộ lọc (Nhóm dự án, Nguồn vốn, Quy trình, Thủ tục...) nay dùng component
> `SearchableSelect` (div click-to-open, không phải `<select>` thật) — tương tác test
> qua `fireEvent.click` thay vì `fireEvent.change` + `getByDisplayValue`. Bộ lọc
> "Trạng thái" (Delayed/On Track) đã bị gỡ khỏi UI, chỉ còn state chết trong code.

**Mô tả**: Kiểm tra danh sách dự án với tìm kiếm, lọc đa tiêu chí và phân trang (`ProjectList.tsx`)

| Nhóm (describe) | Tests | Nội dung kiểm tra |
|-----------------|-------|-------------------|
| `ProjectList – Render cơ bản` | 6 | Tên dự án, mã, đếm số lượng, ô tìm kiếm |
| `ProjectList – Lọc theo từ khóa` | 6 | Tên, mã, nhà đầu tư, case-insensitive |
| `ProjectList – Lọc bằng dropdown select` | 13 | Nhóm dự án, nguồn vốn, phân loại, giai đoạn, trạng thái, địa bàn, kết hợp |
| `ProjectList – Sự kiện người dùng` | 2 | Nút Xuất báo cáo, nút Tạo mới |
| `ProjectList – Nút Cập nhật` | 2 | Hiển thị, gọi onHousingUpdateClick |
| `ProjectList – Phân trang` | 3 | Trang 1, nút trang 2, click sang trang 2 |
| `ProjectList – Lọc theo Quy trình` | 2 | Lọc proc-2, xóa bộ lọc |
| `ProjectList – Lọc theo Thủ tục` | 2 | Lọc bước hiện tại, xóa bộ lọc |

---

### 3.7 `CreateProject.test.tsx` — **36 tests**

> Trường "Địa điểm" (`SearchableSelect`) nay chỉ liệt kê `departments` của agency tên
> đúng `'UBND cấp xã, phường'` (địa bàn dự án gắn với 1 phường/xã cụ thể — xem
> `[[project-agency-permission-model]]`), không còn nhận agency bất kỳ như trước.

**Mô tả**: Kiểm tra form tạo/chỉnh sửa dự án với validation và 2 tabs (`CreateProject.tsx`)

| Nhóm (describe) | Tests | Nội dung kiểm tra |
|-----------------|-------|-------------------|
| `CreateProject – Render chế độ tạo mới` | 6 | Tiêu đề, tabs, mã tự sinh, nút submit |
| `CreateProject – Render chế độ chỉnh sửa` | 4 | Tiêu đề, pre-fill dữ liệu, nút cập nhật |
| `CreateProject – Validation (đồng bộ)` | 6 | Lỗi tên, chủ đầu tư, địa bàn, loại hình, quy trình |
| `CreateProject – Submit hợp lệ` | 3 | Gọi onSuccess, loading state |
| `CreateProject – Tabs` | 3 | Default tab, chuyển tab, quay lại tab 1 |
| `CreateProject – Nút Hủy bỏ` | 1 | Gọi onClose |
| `CreateProject – Checkbox đặc biệt` | 4 | Dự án trọng điểm, chưa có CĐT |
| `CreateProject – Validation số học` | 2 | Diện tích âm |
| `CreateProject – Vùng đính kèm file` | 3 | Trạng thái chưa upload |
| `CreateProject – Tab 2 khi đã chọn quy trình` | 3 | Giai đoạn cha, bước con, header cột |

---

### 3.8 `UserManagement.test.tsx` — **56 tests**

**Mô tả**: Kiểm tra màn hình quản lý tài khoản với CRUD, tìm kiếm, lọc và validation (`UserManagement.tsx`)

| Nhóm (describe) | Tests | Nội dung kiểm tra |
|-----------------|-------|-------------------|
| `UserManagement – Render cơ bản` | 7 | Tiêu đề, nút, cột bảng, danh sách users |
| `UserManagement – Tìm kiếm` | 5 | Tên, email, SĐT, xóa tìm kiếm, empty state |
| `UserManagement – Lọc loại tài khoản` | 3 | Agency, investor, tất cả |
| `UserManagement – Modal thêm mới` | 3 | Mở modal, form, đóng modal |
| `UserManagement – Xóa người dùng` | 5 | Dialog xác nhận, hủy, xóa vĩnh viễn |
| `UserManagement – Chỉnh sửa user` | 2 | Mở modal sửa, pre-fill dữ liệu |
| `Email validation` | 2 | Regex kiểm tra email |
| `Phone validation` | 3 | Regex kiểm tra SĐT |
| `Duplicate detection` | 4 | Phát hiện trùng username, email, SĐT |
| `UserManagement – Modal Cấu hình Email` | 2 | Mở, đóng modal SMTP |
| `UserManagement – Modal Danh mục vai trò` | 2 | Mở, đóng modal |
| `UserManagement – Validation khi Lưu` | 2 | Toast lỗi, đóng toast |
| `UserManagement – Badge trong bảng` | 2 | Badge loại tài khoản, người theo dõi |
| `UserManagement – Khôi phục mật khẩu` | 3 | Dialog xác nhận, nút xác nhận/hủy |
| `UserManagement – Khôi phục MK – API` | 3 | Fetch thành công, lỗi network |
| `UserManagement – Cấu hình Email – Lưu` | 2 | Input SMTP, click lưu |
| `UserManagement – Lọc kết hợp` | 3 | Tìm kiếm + lọc loại kết hợp |
| `UserManagement – Điền form thêm mới` | 3 | Input, dropdown, nút |

---

### 3.9 `AnnualProgressUpdate.test.tsx` — **19 tests**

**Mô tả**: Kiểm tra bảng cập nhật mốc tiến độ năm cho tất cả dự án (`AnnualProgressUpdate.tsx`)

| Nhóm (describe) | Tests | Nội dung kiểm tra |
|-----------------|-------|-------------------|
| `AnnualProgressUpdate – Render cơ bản` | 7 | Tiêu đề, ô tìm kiếm, danh sách, edge cases |
| `AnnualProgressUpdate – Tìm kiếm` | 3 | Lọc tên, mã, xóa tìm kiếm |
| `AnnualProgressUpdate – Toggle phân trang` | 3 | Nút toggle, đổi trạng thái |
| `AnnualProgressUpdate – Nút xuất Excel` | 2 | Hiển thị, không crash khi click |
| `AnnualProgressUpdate – Modal chỉnh sửa mốc` | 2 | Ẩn ban đầu, click mở modal |
| `AnnualProgressUpdate – Modal cập nhật tiến độ` | 3 | Ẩn ban đầu, mở modal, click Lưu gọi onUpdateProject |

---

### 3.10 `ProjectGanttDetail.test.tsx` — **52 tests**

**Mô tả**: Kiểm tra màn hình Gantt chi tiết tiến độ thực hiện một dự án (`ProjectGanttDetail.tsx`)

| Nhóm (describe) | Tests | Nội dung kiểm tra |
|-----------------|-------|-------------------|
| `ProjectGanttDetail – Render cơ bản` | 6 | Tiêu đề, tên/CĐT/số căn hộ, modal ẩn |
| `ProjectGanttDetail – Legend trạng thái` | 5 | Các nhãn trong legend |
| `ProjectGanttDetail – Nút quay lại` | 1 | Gọi onBack |
| `ProjectGanttDetail – Modal nhập tiến độ` | 2 | Ẩn ban đầu, nút Hủy trong modal |
| `ProjectGanttDetail – localStorage` | 2 | Đọc từ localStorage, trống không crash |
| `ProjectGanttDetail – Props đặc biệt` | 4 | actualProgress từ props, currentUser |
| `ProjectGanttDetail – localStorage error handling` | 3 | JSON lỗi, null, object lồng |
| `ProjectGanttDetail – Props project đặc biệt` | 4 | processId undefined, totalArea=0 |
| `ProjectGanttDetail – Modal nhập tiến độ – tìm và mở` | 3 | Click không crash, nút Hủy |
| `ProjectGanttDetail – Modal với currentUser có quyền` | 9 | Investor/Admin click "+nhập TT", mở modal, nhập ngày, lưu, localStorage |
| `ProjectGanttDetail – Admin và SXD phân quyền` | 5 | Xem/nhập tiến độ theo role |
| `ProjectGanttDetail – Tất cả phase hoàn thành` | 4 | Render 7/7, ẩn nút nhập |
| `ProjectGanttDetail – Actual progress hiển thị` | 4 | Render với dữ liệu thực tế từ props |

---

### 3.10b `ProjectDetail.test.tsx` — **51 tests** *(mới, chưa có trong bản trước)*

**Mô tả**: Kiểm tra modal chi tiết dự án (`ProjectDetail.tsx`) — 4 tab điều hướng, hồ sơ
đính kèm, lịch sử xử lý, badge trạng thái/trọng điểm. Nút "Tải tất cả" (không còn hậu tố
"(.zip)" như bản cũ).

---

### 3.11 `HousingUpdateView.test.tsx` — **63 tests**

> **Bug test đã sửa (2026-07-08)**: 3 test trong nhóm "Ngày hoàn thành dự kiến" dùng
> `document.querySelector('input[type="date"]')`, nhưng component thật dùng
> `react-datepicker` (`<DatePicker>`) render ra `<input type="text" placeholder="dd/mm/yyyy">`
> — selector cũ luôn trả về `null`. Đổi sang `input[placeholder="dd/mm/yyyy"]` và giá trị
> fire event sang định dạng `dd/mm/yyyy`. Đồng thời bổ sung mock `formatLocalDate` còn thiếu
> trong `vi.mock('../../src/lib/projectUtils', ...)` — vì trước đó selector sai khiến nhánh
> `onChange` thật chưa từng được test kích hoạt.

**Mô tả**: Kiểm tra màn hình cập nhật hồ sơ/lịch sử xử lý từng bước quy trình (`HousingUpdateView.tsx`)

| Nhóm (describe) | Tests | Nội dung kiểm tra |
|-----------------|-------|-------------------|
| `HousingUpdateView – Render cơ bản` | 6 | Tên/mã/CĐT, edge cases |
| `HousingUpdateView – Nút Quay lại` | 3 | Hiển thị, gọi onBack, ẩn khi không có prop |
| `HousingUpdateView – Fetch API khi mount` | 4 | Gọi fetch attachments & history, lỗi network |
| `HousingUpdateView – Tabs Hồ sơ / Lịch sử` | 3 | Tab hiển thị, click không crash |
| `HousingUpdateView – Nội dung và lưu` | 3 | Nút lưu, textarea, nhập nội dung |
| `HousingUpdateView – Danh sách bước quy trình` | 3 | Tên quy trình, giai đoạn |
| `HousingUpdateView – Bước con trong quy trình` | 5 | Tên bước con, click không crash |
| `HousingUpdateView – initialStepId prop` | 4 | Hợp lệ, không tồn tại |
| `HousingUpdateView – Props currentUser và stepStatuses` | 4 | Các loại user và status |
| `HousingUpdateView – Attachments từ API` | 4 | Fetch thành công, nhiều processes |
| `HousingUpdateView – Lưu cập nhật (handleSave)` | 5 | Không crash, loading state, gọi onSuccess, fetch upload |
| `HousingUpdateView – Select trạng thái` | 4 | Select tồn tại, thay đổi không crash |
| `HousingUpdateView – Ngày hoàn thành dự kiến` | 3 | Input tồn tại, thay đổi, lưu sau đổi |
| `HousingUpdateView – Bước tiếp theo (nextStepIds)` | 4 | Placeholder, chọn bước |
| `HousingUpdateView – Textarea nội dung` | 3 | Tồn tại, nhập dài, xóa nội dung |
| `HousingUpdateView – Milestones và implementationPlan` | 5 | Các trạng thái dự án, badge "Chậm tiến độ" |

---

### 3.12 `DashboardApp.test.tsx` — **106 tests**

**Mô tả**: Kiểm tra toàn diện màn hình Dashboard App công khai với navigation, tìm kiếm, lọc và modal cập nhật tiến độ (`DashboardApp.tsx`)

| Nhóm (describe) | Tests | Nội dung kiểm tra |
|-----------------|-------|-------------------|
| `DashboardApp – Render cơ bản` | 8 | Tiêu đề, các section, edge cases |
| `DashboardApp – Thống kê thủ tục` | 4 | Các thủ tục, số liệu chậm tiến độ |
| `DashboardApp – Thống kê cơ quan` | 2 | Dữ liệu cơ quan xử lý |
| `DashboardApp – Số liệu dự án` | 2 | Badge "Dự án đã công bố", tổng số |
| `DashboardApp – Điều hướng` | 3 | Click agency, thủ tục, quay lại |
| `DashboardApp – localStorage` | 2 | Rỗng, có dữ liệu cũ |
| `DashboardApp – View search-results` | 3 | Render search results view |
| `DashboardApp – View projects` | 3 | Render projects view |
| `DashboardApp – View departments, child-steps, detail` | 3 | Các view con |
| `DashboardApp – Props đặc biệt` | 5 | Agencies/investors/locations rỗng, currentUser null |
| `DashboardApp – Điều hướng từ overview` | 4 | Click từ trang tổng quan |
| `DashboardApp – Stat buttons điều hướng` | 4 | "KH bị chậm", "CQNN đang xử lý" |
| `DashboardApp – Metric cards điều hướng` | 4 | Click card thủ tục |
| `DashboardApp – Projects view → Detail view` | 7 | Click dự án, detail view, quay lại |
| `DashboardApp – goBack navigation` | 4 | Back từ nhiều view |
| `DashboardApp – Filter panel trong projects view` | 7 | Filter agency, CĐT, xóa bộ lọc |
| `DashboardApp – Local search trong projects view` | 5 | Tìm kiếm, empty state |
| `DashboardApp – Search trong SearchResults view` | 8 | Input, Enter, lọc, empty state |
| `DashboardApp – Delayed projects` | 2 | Projects chậm tiến độ |
| `DashboardApp – currentUser investor và agency` | 4 | Các loại user khác nhau |
| `DashboardApp – StageStatsTable với parentStep` | 6 | Click stage header, subStep, goBack |
| `DashboardApp – Detail view với investor currentUser` | 3 | Quyền xem của CĐT |
| `DashboardApp – Detail view modal (Cập nhật tiến độ)` | 11 | Mở modal, nhập ngày, lưu, gọi onUpdateActualProgress, localStorage |

---

### 3.13 `e2e-project-flow.test.tsx` — **61 tests**

**Mô tả**: Kiểm tra luồng đầu-cuối xuyên 7 component: Tạo dự án → Gantt → Danh sách → Tiến độ năm → Cập nhật bước → Gantt sau cập nhật → Chi tiết (chạy bằng Vitest, không dùng browser)

| Nhóm (describe) | Tests | Nội dung kiểm tra |
|-----------------|-------|-------------------|
| `Bước 1 – Tạo dự án mới (CreateProject)` | 8 | Form, validation, submit, chỉnh sửa |
| `Bước 2 – GanttDashboardNOXH hiển thị dự án vừa tạo` | 8 | Render, tìm kiếm, onProjectClick |
| `Bước 3 – ProjectList hiển thị dự án vừa tạo` | 8 | Render, tìm kiếm, edit click |
| `Bước 4 – AnnualProgressUpdate` | 6 | Render, cột, tìm kiếm, mở modal |
| `Bước 5 – UpdateProgress` | 9 | Render, bước, thay đổi trạng thái, lưu, hủy |
| `Bước 6 – GanttDashboardNOXH sau khi cập nhật tiến độ` | 5 | actualProgress prop |
| `Bước 7 – ProjectDetail` | 14 | Render, 4 tabs, số liệu quy mô, tab Tiến độ, đóng modal |
| `Luồng tích hợp – Nhất quán dữ liệu` | 3 | INT-1, INT-2, INT-3 cross-component |

---

### 3.14 `role-filter.test.ts` — **50 tests**

> Bao gồm nhóm mới "Phần 5B – UBND cấp xã, phường" (agencyId='6'): lọc dự án theo địa
> bàn khớp `department` của user VÀ bước hiện tại thuộc `'UBND cấp xã, phường'` hoặc
> `'Sở Quy hoạch Kiến trúc'`. Menu HỆ THỐNG: agencyId='1' (Sở Xây dựng) giờ cũng thấy
> như Admin dù không phải role Admin.

**Mô tả**: Kiểm tra thuần logic phân quyền lọc dự án và menu sidebar theo từng nhóm user — **không render DOM**, chạy ở môi trường node

| Nhóm (describe) | Tests | Nội dung kiểm tra |
|-----------------|-------|-------------------|
| `Nhóm quyền 1: Admin và Sở Xây dựng thấy tất cả` | 5 | Admin/SXD thấy 4/4 dự án |
| `Nhóm quyền 2: Chủ đầu tư chỉ thấy dự án của mình` | 6 | CDT_ALPHA/BETA chỉ thấy dự án mình |
| `Nhóm quyền 3: Cơ quan phối hợp chỉ thấy bước của mình` | 7 | QHKT, PCCC, NNMT |
| `Chuyển bước dự án → cập nhật phạm vi hiển thị động` | 5 | Dự án chuyển bước thay đổi quyền xem |
| `Sidebar menu: Admin thấy HỆ THỐNG, non-admin không thấy` | 10 | Kiểm tra 4 nhóm menu |
| `Quy tắc kiểm tra chung` | 8 | Cross-cutting, không rò rỉ quyền |

---

### 3.15 `role-sidebar.test.tsx` — **16 tests**

> Đã tách case agencyId='1' (Sở Xây dựng) ra riêng — VẪN thấy nhóm HỆ THỐNG dù không
> phải Admin — khỏi nhóm "agency khác agencyId=1" (sqhkt/pccc/cdt) — KHÔNG thấy.

**Mô tả**: Kiểm tra render thật component Sidebar phân quyền menu cho 4 loại user (Admin, SXD, SQHKT, PCCC, CĐT)

> ⚠️ **Lưu ý**: KHÔNG mock `lucide-react` bằng `new Proxy(...)` — gây deadlock khi fork trên Windows với `pool: 'forks'`

| Nhóm (describe) | Tests | Nội dung kiểm tra |
|-----------------|-------|-------------------|
| `Sidebar – Admin thấy toàn bộ menu kể cả HỆ THỐNG` | 5 | Admin thấy HỆ THỐNG, các menu chính, navigation |
| `Sidebar – agencyId=1 vẫn thấy HỆ THỐNG như Admin` | 2 | Lãnh đạo SXD (không phải Admin) |
| `Sidebar – Non-Admin, agency khác agencyId=1 KHÔNG thấy HỆ THỐNG` | 9 | 3 loại user × 3 assert |

---

### 3.16 `GanttDashboardNOXH.test.tsx` — **59 tests** *(mới, chưa có trong bản trước)*

**Mô tả**: Kiểm tra bảng Gantt tổng hợp dự án NOXH — bộ lọc, stat cards, legend, toggle
expand/collapse, click dự án, export xlsx, reset dữ liệu (chỉ Admin thấy nút này).

> ⚠️ **Bug thật đã sửa trong source (2026-07-07)**: `GanttDashboardNOXH.tsx` destructure
> `projects: initialProjects = []` — literal `[]` tạo mảng mới mỗi lần render khi prop
> `projects` là `undefined`, khiến `useEffect(..., [initialProjects])` gọi `setState` lặp
> vô hạn (treo cứng, không phải chỉ chậm). Đã sửa bằng hằng số `EMPTY_ARRAY` module-level
> ổn định thay literal `[]`. Xem `[[feedback-vitest-component-tests]]` trong bộ nhớ để
> biết cách bisect khi gặp file test treo tương tự.

| Nhóm (describe) | Tests | Nội dung kiểm tra |
|-----------------|-------|-------------------|
| `Render cơ bản` | 6 | Không crash kể cả projects rỗng/undefined |
| `Stat cards` | 7 | Tổng dự án, CQNN đang xử lý, KH bị chậm |
| `Bộ lọc tìm kiếm` | 4 | Tên, mã dự án, xóa tìm kiếm |
| `Bộ lọc giai đoạn` | 3 | Chọn giai đoạn, "Tất cả giai đoạn" |
| `Bộ lọc trạng thái` | 2 | Click stat card, reset qua "Hiển thị tất cả" |
| `Legend trạng thái` | 5 | 5 nhãn màu |
| `Header bảng Gantt` | 8 | Cột tên/địa điểm/milestone/CĐT/Cơ quan NN |
| `Dữ liệu dự án trong bảng` | 6 | Mã, tên, CĐT, nhãn KH/TT |
| `onClick project` | 3 | Gọi onProjectClick đúng object |
| `Toggle expand/collapse` | 3 | "Xem tất cả" ↔ "Thu gọn" |
| `Nút Reset data` | 5 | Chỉ hiện khi `currentUser.roleId === 'Admin'`; confirm, xóa localStorage |
| `Nút Xuất dữ liệu` | 2 | Export xlsx không crash |
| `actualProgress từ props` | 5 | Props, localStorage, JSON lỗi, badge "Đã xong" |

---

## 4. E2E TESTS — `test/e2e/` (Playwright)

> **Yêu cầu**: Server đang chạy tại `http://localhost:3000` (`npm run dev`)  
> **Tài khoản test mặc định**: `admin / 123456`, `sxd / 123456`, `cdt / 123456`, `snnmt / 123456`

---

### 4.1 `auth.spec.ts` — **21 tests** ✅ chạy thật, pass 100% (2026-07-08)

> Đã sửa: "H-NOXH SXD" → "NOXH SXD" (logo tách "H" và tên riêng); thêm case SXD
> (agencyId=1) VẪN thấy HỆ THỐNG và case Sở NNMT (agencyId=3) mới thực sự bị hạn chế.

**Mô tả**: Kiểm tra E2E toàn bộ luồng đăng nhập, đăng xuất và phân quyền menu trên browser thật

| Nhóm (describe) | Tests | Nội dung kiểm tra |
|-----------------|-------|-------------------|
| `Trang đăng nhập` | 5 | Tiêu đề, inputs, nút, tài khoản mẫu |
| `Đăng nhập thất bại` | 4 | Sai cả hai, sai pass, trống username, không navigate |
| `Đăng nhập thành công` | 4 | Admin, sxd, form ẩn, sidebar xuất hiện |
| `Phân quyền sau đăng nhập` | 6 | Admin thấy HỆ THỐNG, sxd không thấy, mọi user thấy ĐIỀU HÀNH |

---

### 4.2 `projects.spec.ts` — **13 tests** ✅ chạy thật, pass 100% (2026-07-08)

> Đã bỏ describe "Sơ đồ Gantt quy trình" (menu item `process-gantt` đã bị gỡ khỏi
> Sidebar — component `ProcessGanttView` vẫn tồn tại nhưng chỉ điều hướng tới qua
> `handleNavigateToProjects`, không còn qua menu trực tiếp nên test click-menu cũ vô nghĩa).

**Mô tả**: Kiểm tra E2E Dashboard, Danh sách dự án, tạo mới, Gantt, tiến độ năm và API status

| Nhóm (describe) | Tests | Nội dung kiểm tra |
|-----------------|-------|-------------------|
| `Dashboard – dữ liệu API hiển thị lên UI` | 3 | Gọi /api/data, thẻ tổng dự án, không crash |
| `Dashboard App` | 1 | Điều hướng sang Dashboard App |
| `Danh sách dự án` | 4 | Load dữ liệu, tìm kiếm, xóa tìm kiếm |
| `Tạo dự án mới` | 1 | Nút tạo tồn tại |
| `Gantt Dashboard NOXH` | 1 | Điều hướng sang Gantt |
| `Cập nhật tiến độ năm` | 1 | Điều hướng sang trang tiến độ |
| `Sơ đồ Gantt quy trình` | 1 | Điều hướng |
| `Trạng thái kết nối DB` | 3 | /api/db-status, /api/health, /api/data trả về đúng |

---

### 4.3 `menu-navigation.spec.ts` — **22 tests** *(viết lại toàn bộ theo menu thật hiện tại)* ✅ chạy thật, pass 100% (2026-07-08)

**Mô tả**: Kiểm tra E2E Admin điều hướng được toàn bộ menu, SXD (agencyId=1) vẫn thấy
HỆ THỐNG như Admin, và agency khác (agencyId≠1, dùng `snnmt`) bị hạn chế đúng.

> Menu HỆ THỐNG hiện tại (đã đổi tên/gộp/bỏ so với bản cũ): Cấu hình quy trình, Cấu hình
> giai đoạn dự án, CĐT & Cơ quan xử lý, Danh mục dự án, Danh mục trạng thái, Quản lý tài
> khoản. "Tổng quan" và "Sơ đồ Gantt quy trình" đã bị comment out khỏi Sidebar.

| Nhóm (describe) | Tests | Nội dung kiểm tra |
|-----------------|-------|-------------------|
| `Admin – ĐIỀU HÀNH` | 1 | Dashboard App load được |
| `Admin – QUẢN LÝ TIẾN ĐỘ` | 2 | Gantt dự án NOXH, Cập nhật kế hoạch dự án |
| `Admin – QUẢN LÝ` | 1 | Danh sách dự án |
| `Admin – HỆ THỐNG` | 7 | 6 mục HỆ THỐNG load được + QLTK hiển thị đúng |
| `SXD (agencyId=1) vẫn thấy HỆ THỐNG` | 2 | Thấy heading HỆ THỐNG, vào được Quản lý tài khoản |
| `Chuyên viên agency khác (agencyId≠1) – menu bị hạn chế` | 7 | Thấy ĐIỀU HÀNH, không thấy HỆ THỐNG/QLTK/Cấu hình quy trình |
| `Chuyển tab và quay lại` | 2 | Chuyển giữa Dashboard App và Danh sách, giữa các trang HỆ THỐNG |

---

### 4.4 `project-lifecycle.spec.ts` — **32 tests** ✅ chạy thật, pass 100% (2026-07-08)

> Đã sửa (rà soát tĩnh): `ProjectList.tsx` KHÔNG có `<table>` (layout thẻ `div.cursor-pointer`) —
> Luồng 2 và Luồng 3 trước đó dùng `table tbody tr` nên luôn `test.skip()` âm thầm. Luồng 2 viết
> lại theo trang `ProjectGanttDetail` (không phải modal). Luồng 3 viết lại theo trang
> `HousingUpdateView` (nút "Cập nhật" → "Lưu cập nhật"/"Quay lại", không phải modal
> UpdateProgress với "Lưu thay đổi"/"Hủy bỏ"). Luồng 4: menu đổi tên thành
> "Cập nhật kế hoạch dự án" (không còn "Cập nhật tiến độ năm").
>
> **2 bug selector thật phát hiện khi chạy thật (2026-07-08)** — xem `[[feedback-playwright-patterns]]`:
> 1. `page.locator('div.cursor-pointer').first()` (test 2.2/2.3/2.4) khớp nhầm div trigger của
>    `SearchableSelect` (dropdown filter "Quy trình" trong `ProjectList.tsx`, cũng
>    `div.cursor-pointer` và đứng TRƯỚC thẻ dự án trong DOM) thay vì thẻ dự án thật. Sửa:
>    thêm `:has(h3)` — chỉ thẻ dự án có heading `<h3>` bên trong.
> 2. `page.getByRole('button', { name: 'Cập nhật' })` (test 3.2/3.4, không `exact: true`) khớp
>    theo substring nên bắt trúng nút sidebar "**Cập nhật** kế hoạch dự án" (đứng trước nút
>    "Cập nhật" trên từng thẻ dự án trong DOM) thay vì nút thật cần click. Sửa: thêm
>    `exact: true` ở cả 5 chỗ dùng locator này trong file.

**Mô tả**: Kiểm tra E2E toàn bộ vòng đời dự án: tạo → chi tiết → cập nhật tiến độ bước/năm → tìm kiếm → Gantt → đăng xuất

| Nhóm (describe) | Tests | Nội dung kiểm tra |
|-----------------|-------|-------------------|
| `Luồng 1 – Tạo dự án mới` | 4 | Nút tạo, mở modal, trường bắt buộc, đóng form |
| `Luồng 2 – Xem chi tiết dự án` | 4 | Load dữ liệu, click mở chi tiết, mã NOXH, đóng modal |
| `Luồng 3 – Cập nhật tiến độ bước xử lý hồ sơ` | 5 | Nút cập nhật, mở modal, danh sách bước, nút lưu/hủy |
| `Luồng 4 – Cập nhật tiến độ năm` | 5 | Hiển thị màn hình, ô tìm kiếm, bảng dữ liệu, lọc |
| `Luồng 5 – Tìm kiếm và lọc trong Danh sách dự án` | 5 | Ô tìm kiếm, empty state, xóa tìm kiếm, bộ lọc, xuất Excel |
| `Luồng 6 – Sơ đồ Gantt dự án NOXH` | 5 | Hiển thị, ô tìm kiếm, dữ liệu, header mốc, lọc empty |
| `Luồng 7 – Đăng xuất và bảo vệ phiên đăng nhập` | 4 | Nút đăng xuất, quay về login, không thấy nội dung, login lại |

---

### 4.5 `permissions.spec.ts` — **29 tests** ✅ chạy thật, pass 100% (2026-07-08)

> Đã đảo ngược toàn bộ giả định "SXD (agencyId=1) KHÔNG thấy HỆ THỐNG" thành "VẪN thấy
> như Admin"; đổi các case "hạn chế thật" sang dùng `snnmt` (agencyId=3) thay vì `sxd`.

**Mô tả**: Kiểm tra E2E phân quyền 3 nhóm user và cross-check không rò rỉ dữ liệu

| Nhóm (describe) | Tests | Nội dung kiểm tra |
|-----------------|-------|-------------------|
| `Nhóm quyền 1A – Admin: thấy tất cả menu và toàn bộ dữ liệu` | 7 | HỆ THỐNG, QLTK, dữ liệu dự án |
| `Nhóm quyền 1B – Sở Xây dựng: thấy tất cả dự án nhưng ẩn HỆ THỐNG` | 5 | SXD không thấy HỆ THỐNG, thấy Gantt và danh sách |
| `Nhóm quyền 2 – Chủ đầu tư: chỉ thấy dự án của mình` | 6 | Ẩn HỆ THỐNG, thấy danh sách dự án (đã lọc) |
| `Nhóm quyền 3 – Cơ quan phối hợp: chỉ thấy dự án đang ở bước của mình` | 5 | Sở NNMT, ẩn HỆ THỐNG |
| `Cross-check – Phân quyền không rò rỉ giữa các nhóm` | 5 | Đổi user → menu cập nhật, Admin vs non-Admin, 2 context song song |

---

### 4.6 `gantt-progress.spec.ts` — **12 tests** ✅ chạy thật, pass 100% (2026-07-08)

> Đã viết lại luồng "cập nhật tiến độ" (G.7, G.9, G.11) theo đúng UI thật: click tên dự
> án trong bảng Gantt (`table tbody button`) → trang `ProjectGanttDetail` → nút "+ nhập TT"
> → modal "Nhập tiến độ thực hiện" (DatePicker `dd/mm/yyyy`, nút "Lưu tiến độ"/"Hủy") —
> không phải modal % tiến độ qua "Danh sách dự án" như bản cũ giả định.

**Mô tả**: Kiểm tra E2E mở Gantt, click chi tiết dự án, cập nhật tiến độ thực hiện và verify phản ánh lại Gantt

| Nhóm (describe) | Tests | Nội dung kiểm tra |
|-----------------|-------|-------------------|
| `Gantt – Mở màn hình và điều hướng` | 4 | Hiển thị, hàng dự án, cột tiến độ, tìm kiếm |
| `Gantt – Mở chi tiết dự án từ Gantt` | 2 | Click dự án mở detail, hiển thị thông tin |
| `Gantt – Cập nhật tiến độ và kiểm tra phản ánh lại Gantt` | 3 | Luồng cập nhật đầy đủ (lưu → quay lại Gantt), đóng modal không ảnh hưởng, nút Hủy |
| `Gantt Detail – Cập nhật tiến độ trong modal chi tiết Gantt` | 3 | Click cell Gantt, các bước quy trình trong detail, reload không lỗi 500 |

---

### 4.7 `user-management.spec.ts` — **23 tests** ✅ chạy thật, pass 100% (2026-07-08)

> Đã sửa (rà soát tĩnh) UM.16: cột email thật là "Liên hệ" (index 1, gộp email+SĐT trong 2
> `<span>`), không phải cột index 2 ("Loại tài khoản") như test cũ giả định — trước đó test
> luôn `test.skip()` vì không tìm thấy `@` trong text lấy nhầm cột. Các phần còn lại của file
> (nút, placeholder, tiêu đề modal, `<select>` "Chọn cơ quan/phòng ban") đã khớp source
> hiện tại, không cần sửa.
>
> **1 bug assertion thật phát hiện khi chạy thật (2026-07-08)**: UM.4 kỳ vọng
> `body.toMatch(/Email|email/i)`, nhưng cột trong bảng đã đổi tên thành "Liên hệ" (gộp
> SĐT + email — cùng thay đổi UI đã ghi nhận ở UM.16 phía trên) nên không còn chữ "Email"
> đứng riêng trên trang danh sách (modal Thêm tài khoản vẫn có nhãn "Email" nhưng chưa mở).
> Sửa: đổi assertion sang kiểm tra `/Liên hệ/i`.

**Mô tả**: Kiểm tra E2E Quản lý tài khoản (Admin only): xem danh sách, validation tạo/sửa, khôi phục mật khẩu và đăng nhập tài khoản mới

| Nhóm (describe) | Tests | Nội dung kiểm tra |
|-----------------|-------|-------------------|
| `Quản lý tài khoản – Admin truy cập` | 4 | Trang tải, dữ liệu, nút Thêm, cột email |
| `Tạo tài khoản – Validation bắt buộc và trùng lặp` | 5 | Trống, email sai, SĐT ngắn, username trùng, nút Hủy |
| `Tạo tài khoản – Tạo thành công và đăng nhập` | 2 | Mật khẩu tạm hiển thị, user mới trong danh sách |
| `Sửa tài khoản – Cập nhật thông tin` | 5 | Nút sửa, form pre-fill, lưu thành công, xóa trắng fullName, email trùng |
| `Khôi phục mật khẩu – Admin reset mật khẩu user` | 4 | Nút hiển thị, dialog xác nhận, mật khẩu tạm, user không email → lỗi |
| `Đăng nhập – Tài khoản vừa tạo từ Quản lý tài khoản` | 3 | Đăng nhập tài khoản mới, sai mật khẩu, tài khoản đã sửa vẫn đăng nhập được |

---

### 4.8 `profile.spec.ts` — **22 tests** ✅ chạy thật, pass 100% (2026-07-08)

> Rà soát toàn bộ, không cần sửa gì — mọi placeholder/thông báo lỗi/nút trong
> `ProfileModal.tsx` vẫn khớp chính xác 100%. Tính năng sửa hồ sơ cá nhân không bị ảnh
> hưởng bởi 2 thay đổi lớn của đợt merge này (SearchableSelect, quyền agencyId).

**Mô tả**: Kiểm tra E2E chỉnh sửa thông tin cá nhân, validation, đổi mật khẩu và Admin xác nhận thay đổi trong Quản lý tài khoản

| Nhóm (describe) | Tests | Nội dung kiểm tra |
|-----------------|-------|-------------------|
| `Thông tin cá nhân – Mở modal và xem thông tin` | 6 | Nút header (title="Thông tin cá nhân & Đổi mật khẩu"), mở modal, fields, nút Đóng/Lưu |
| `Thông tin cá nhân – Validation các trường bắt buộc` | 4 | Xóa tên → lỗi, email rỗng → lỗi, email sai định dạng, SĐT < 10 số |
| `Thông tin cá nhân – Lưu thành công` | 2 | Toast "Đã cập nhật thông tin cá nhân thành công!", header hiển thị tên mới |
| `Thông tin cá nhân → Admin xác nhận trong Quản lý tài khoản` | 3 | 2 browser context song song, Admin tìm thấy user đã đổi tên, persist sau logout/login lại |
| `Thông tin cá nhân – Đổi mật khẩu` | 7 | Nút "Yêu cầu đổi mật khẩu", mở section, validation: mật khẩu cũ rỗng/sai, mật khẩu mới < 6 ký tự, xác nhận không khớp, nút "Hủy đổi mật khẩu" |

---

## Tổng kết theo file

| # | File | Thư mục | Loại | Tests | Trạng thái |
|---|------|---------|------|-------|-------|
| 1 | `projectUtils.test.ts` | unit | Unit | 48 | ✅ |
| 2 | `aiService.test.ts` | unit | Unit | 6 | ✅ |
| 3 | `crypto.test.ts` | unit | Unit | 23 | ✅ |
| 4 | `api.routes.test.ts` | integration | Integration | 187 | ✅ |
| 5 | `db.test.ts` | integration | Integration | 20 | ✅ |
| 6 | `api.upload-policy.test.ts` | integration | Integration | 30 | ✅ |
| 7 | `api.extended.test.ts` | integration | Integration | 27 | ✅ |
| 8 | `api.auth.test.ts` | integration | Integration | 70 | ✅ |
| 9 | `Login.test.tsx` | component | Component | 12 | ✅ |
| 10 | `Dashboard.test.tsx` | component | Component | 9 | ✅ |
| 11 | `Sidebar.test.tsx` | component | Component | 35 | ✅ |
| 12 | `UpdateProgress.test.tsx` | component | Component | 19 | ✅ |
| 13 | `auth.test.tsx` | component | Component | 48 | ✅ |
| 14 | `ProjectList.test.tsx` | component | Component | 35 | ✅ |
| 15 | `CreateProject.test.tsx` | component | Component | 36 | ✅ |
| 16 | `UserManagement.test.tsx` | component | Component | 56 | ✅ |
| 17 | `AnnualProgressUpdate.test.tsx` | component | Component | 20 | ✅ |
| 18 | `ProjectGanttDetail.test.tsx` | component | Component | 52 | ✅ |
| 19 | `ProjectDetail.test.tsx` | component | Component | 51 | ✅ |
| 20 | `HousingUpdateView.test.tsx` | component | Component | 63 | ✅ |
| 21 | `DashboardApp.test.tsx` | component | Component | 106 | ✅ |
| 22 | `e2e-project-flow.test.tsx` | component | Component | 61 | ✅ |
| 23 | `role-filter.test.ts` | component | Component | 50 | ✅ |
| 24 | `role-sidebar.test.tsx` | component | Component | 16 | ✅ |
| 25 | `GanttDashboardNOXH.test.tsx` | component | Component | 59 | ✅ |
| 26 | `auth.spec.ts` | e2e | E2E | 21 | ✅ chạy thật 2026-07-08 |
| 27 | `projects.spec.ts` | e2e | E2E | 13 | ✅ chạy thật 2026-07-08 |
| 28 | `menu-navigation.spec.ts` | e2e | E2E | 22 | ✅ chạy thật 2026-07-08 |
| 29 | `project-lifecycle.spec.ts` | e2e | E2E | 32 | ✅ chạy thật 2026-07-08 |
| 30 | `permissions.spec.ts` | e2e | E2E | 29 | ✅ chạy thật 2026-07-08 |
| 31 | `gantt-progress.spec.ts` | e2e | E2E | 12 | ✅ chạy thật 2026-07-08 |
| 32 | `user-management.spec.ts` | e2e | E2E | 23 | ✅ chạy thật 2026-07-08 |
| 33 | `profile.spec.ts` | e2e | E2E | 22 | ✅ chạy thật 2026-07-08 |
| | **TỔNG** | | | **1313** | 1139/1139 Vitest + 174/174 Playwright — toàn bộ đã chạy thật, pass 100% |
