# BÁO CÁO KIỂM THỬ - H-NOXH SXD
**Hệ thống Quản lý Nhà Ở Xã Hội TP. Hồ Chí Minh**  
**Phiên bản test:** v2 – Cập nhật theo tính năng & menu mới  
**Ngày cập nhật:** 15/06/2026  
**Người thực hiện:** Claude Code (AI-assisted)

---

## 1. TỔNG QUAN

### 1.1 Phạm vi hệ thống được kiểm thử

| Mục | Thông tin |
|-----|-----------|
| Frontend | React 19 + TypeScript + Vite 6 |
| Backend | Express.js + Node.js + TypeScript |
| Database | PostgreSQL (+ In-Memory Fallback) |
| AI Integration | Google Gemini 2.0 Flash |
| Port mặc định | localhost:3000 |

### 1.2 Cấu trúc menu hệ thống

```
ĐIỀU HÀNH
  ├── Tổng quan (Dashboard)
  └── Dashboard App

QUẢN LÝ TIẾN ĐỘ DA HIỆN TẠI
  ├── Sơ đồ Gantt dự án NOXH
  └── Cập nhật tiến độ năm

QUẢN LÝ
  ├── Danh sách dự án
  └── Sơ đồ Gantt quy trình

HỆ THỐNG [Admin only]
  ├── Danh mục quy trình
  ├── Danh mục CĐT
  ├── Nhóm dự án
  ├── Phân loại dự án
  ├── Cấp công trình
  ├── Trạng thái dự án
  ├── Giai đoạn dự án
  ├── Cơ quan xử lý
  ├── Nguồn vốn
  ├── Trạng thái bước
  └── Quản lý tài khoản
```

### 1.3 Phân quyền theo role

| Role | ĐIỀU HÀNH | QUẢN LÝ TIẾN ĐỘ | QUẢN LÝ | HỆ THỐNG |
|------|-----------|-----------------|---------|----------|
| Admin | ✅ | ✅ | ✅ | ✅ |
| Lãnh đạo | ✅ | ✅ | ✅ | ❌ |
| Chuyên viên | ✅ | ✅ | ✅ | ❌ |
| Chủ đầu tư | ✅ | ✅ | ✅ | ❌ |

---

## 2. THỐNG KÊ TEST CASES

### 2.1 Tổng hợp số lượng test

| Loại test | File | Test cases (v1) | Test cases (v2) | Tăng thêm |
|-----------|------|:-:|:-:|:-:|
| Unit | `projectUtils.test.ts` | 35 | **48** | +13 |
| Unit | `aiService.test.ts` | 6 | 6 | — |
| Integration | `db.test.ts` | 18 | 18 | — |
| Integration | `api.routes.test.ts` | 26 | **57** | +31 |
| Component | `Login.test.tsx` | 12 | 12 | — |
| Component | `Dashboard.test.tsx` | 9 | 9 | — |
| Component | `Sidebar.test.tsx` | 0 | **38** | **+38 MỚI** |
| E2E | `auth.spec.ts` | 4 | **17** | +13 |
| E2E | `projects.spec.ts` | 4 | **17** | +13 |
| E2E | `menu-navigation.spec.ts` | 0 | **34** | **+34 MỚI** |
| API Bash | `test_api.sh` | ~33 | **~47** | +14 |
| **TỔNG** | | **~147** | **~303** | **+156** |

---

## 3. CHI TIẾT TEST CASES

### 3.1 Unit Tests – `projectUtils.test.ts`

#### `parseDate()` (14 test cases)
| # | Test | Mô tả | Kết quả mong đợi |
|---|------|-------|-----------------|
| 1 | null input | Giá trị null | `null` |
| 2 | undefined input | Giá trị undefined | `null` |
| 3 | empty string | Chuỗi rỗng | `null` |
| 4 | "X" | Giá trị marker | `null` |
| 5 | "--" | Giá trị placeholder | `null` |
| 6 | "15/06/2024" | dd/mm/yyyy | Date(2024, 5, 15) |
| 7 | "2024-06-15" | yyyy-mm-dd | Date(2024, 5, 15) |
| 8 | "15/06/24" | dd/mm/yy | Date(2024, 5, 15) |
| 9 | "31/02/2024" | Ngày không hợp lệ | `null` |
| 10 | "khong-phai-ngay" | Chuỗi bất kỳ | `null` |
| 11 | "01/13/2024" | Tháng 13 | `null` |
| 12 | "ab/cd/efgh" | NaN parts | `null` |
| 13 | "01/01/2023" | Ngày đầu tháng | Date(2023, 0, 1) |
| 14 | "30/04/2024" | Ngày cuối tháng | Date(2024, 3, 30) |
| 15 | "31/12/2025" | Ngày cuối năm | Date(2025, 11, 31) |
| 16 | ISO 8601 full | Với timezone | Date object |

#### `formatDate()` (10 test cases)
| # | Test | Input | Kết quả mong đợi |
|---|------|-------|-----------------|
| 1 | null | null | `""` |
| 2 | undefined | undefined | `""` |
| 3 | "X" | "X" | `""` |
| 4 | "--" | "--" | `""` |
| 5 | đã format | "15/06/2024" | "15/06/2024" |
| 6 | ISO format | "2024-06-15" | "15/06/2024" |
| 7 | padding | "2024-01-05" | "05/01/2024" |
| 8 | cuối năm | "2025-12-31" | "31/12/2025" |
| 9 | đầu tháng | "2024-03-01" | "01/03/2024" |
| 10 | không phải ngày | "khong-phai-ngay" | `""` |

#### `getStepAgency()` (9 test cases)
| # | Test | Mô tả |
|---|------|-------|
| 1 | Tìm thấy bước 1 | Trả về đúng agency |
| 2 | Tìm thấy bước 2 | Trả về đúng agency |
| 3 | Không tìm thấy bước | "Chưa xác định" |
| 4 | currentStep rỗng | "Chưa xác định" |
| 5 | processes rỗng | "Chưa xác định" |
| 6 | processId không khớp | "Chưa xác định" |
| 7 | Không có processId | "Chưa xác định" |
| 8 | Nhiều parentSteps | Tìm đúng trong stage 2 |

#### `calculateProjectStatus()` (15 test cases)
| # | Test | Điều kiện | Kết quả mong đợi |
|---|------|-----------|-----------------|
| 1 | Không tìm thấy process | processId sai | progress=0, currentStep="Chưa chọn quy trình" |
| 2 | Chưa hoàn thành bước nào | milestones={} | currentStep=bước đầu, progress=0 |
| 3 | 1/3 bước xong | step-1 có actualDate | progress=33 |
| 4 | 2/3 bước xong | step-1,2 có actualDate | progress=67 |
| 5 | Tất cả bước xong | step-1,2,3 có actualDate | progress=100, currentStep="Hoàn thành" |
| 6 | Delayed | deadline đã qua | status="Delayed" |
| 7 | On Track | deadline tương lai | status="On Track" |
| 8 | currentAgency | Bước đang active | agency của bước active |
| 9 | implementationPlan | agencyActualDate | Tính như completed |
| 10 | milestones null | null input | progress=0, không crash |
| 11 | Agency bước tiếp theo | 1 bước xong | currentAgency=agency bước 2 |
| 12 | 100% completed | Tất cả xong | status="Completed" |
| 13 | processes rỗng | [] | Không crash |

---

### 3.2 Integration Tests – `api.routes.test.ts`

#### Health & DB Status (4 tests)
| Endpoint | Test | Mong đợi |
|----------|------|----------|
| GET /api/health | Trạng thái OK | `{status: "ok"}` |
| GET /api/db-status | connected=true | mode=PostgreSQL |
| GET /api/db-status?retry=true | Gọi initDatabase | initDatabase(true) |
| GET /api/db-status?force=true | Gọi initDatabase | initDatabase(true) |

#### GET /api/data (4 tests)
| Test | Mong đợi |
|------|----------|
| Trả về projects, users, actualProgress | Đủ 3 field |
| Gọi đủ 4 hàm DB | 4 mock calls |
| DB lỗi → 500 | `{error: "DB down"}` |
| Metadata có trong response | investors, projectStatuses |

#### Projects CRUD (9 tests)
| Endpoint | Test | Mong đợi |
|----------|------|----------|
| POST | Tạo project thành công | id='new-proj-id' |
| POST | Gọi dbCreateProject đúng | Mock called |
| POST | DB lỗi → 500 | Error response |
| PUT | Cập nhật thành công | id khớp, progress đúng |
| PUT | Gọi dbUpdateProject đúng | Mock called với id |
| PUT | DB lỗi → 500 | Error response |
| DELETE | Xóa thành công | `{success: true}` |
| DELETE | Gọi dbDeleteProject đúng | Mock called |
| DELETE | DB lỗi → 500 | Error response |

#### Project History (4 tests)
| Endpoint | Test | Mong đợi |
|----------|------|----------|
| GET history | Trả về mảng | Array with actionType |
| GET history | Gọi DB đúng | Mock called với projectId |
| POST history | Tạo entry mới | id=99 |
| POST history | Gọi DB đúng params | 6 params đúng |

#### Attachments (5 tests)
| Endpoint | Test | Mong đợi |
|----------|------|----------|
| GET list | Trả về mảng | [{name: 'file.pdf'}] |
| GET list | Gọi DB đúng | Mock called |
| GET download | Attachment tồn tại | 200, id=1 |
| GET download | Không tồn tại | 404 |
| GET download | ID không phải số | 400 |

#### Actual Progress (6 tests)
| Endpoint | Test | Mong đợi |
|----------|------|----------|
| GET | Trả về object | cdtDate='2024-01-01' |
| GET | DB lỗi → 500 | Error response |
| PUT | Cập nhật và trả về | cdtDate mới |
| PUT | Gọi DB đúng | Mock called với projectId |
| POST reset | success=true | `{success: true}` |
| POST reset | Gọi DB một lần | Mock called once |

#### Metadata (5 tests)
| Key | Test | Mong đợi |
|-----|------|----------|
| investors | Cập nhật list | Trả về list |
| projectStatuses | Gọi đúng key | Mock called |
| processingAgencies | Cấu trúc phức tạp | Array of objects |
| locations | ward+oldArea | Array |
| processes | Quy trình | Array |

#### Users CRUD (9 tests)
| Endpoint | Test | Mong đợi |
|----------|------|----------|
| GET | Trả về danh sách | [{email: 'admin@...'}] |
| GET | DB lỗi → 500 | Error response |
| POST | Tạo user thành công | id='new-user-id' |
| POST | Gọi dbCreateUser đúng | Mock called |
| PUT | Cập nhật thành công | id, fullName đúng |
| DELETE | Xóa thành công | `{success: true}` |
| DELETE | Gọi DB đúng | Mock called với id |

#### **Email Config [MỚI]** (7 tests)
| Endpoint | Test | Mong đợi |
|----------|------|----------|
| GET | Password được ẩn | "●●●●●●●●" |
| GET | Có đủ fields | host, port, username, fromName, fromEmail |
| GET | Ẩn khi có password | Không lộ "secret123" |
| GET | Rỗng khi không có password | "" |
| GET | DB lỗi → 500 | Error response |
| POST | Lưu config mới | dbSaveEmailConfig called |
| POST | Giữ password cũ khi placeholder | Dùng password từ DB |
| POST | DB lỗi → 500 | Error response |

#### **Password Recovery [MỚI]** (6 tests)
| Endpoint | Test | Mong đợi |
|----------|------|----------|
| POST/:id | User không tồn tại | 404 |
| POST/:id | User có email | 200, success=true |
| POST/:id | Gọi dbResetUserPassword | Mock called với userId |
| POST/:id | emailSent=false (chưa SMTP) | emailSent: false |
| POST/:id | User không có email | 400 |
| POST/:id | dbResetUserPassword fail | 500 |

---

### 3.3 Component Tests – `Sidebar.test.tsx` [MỚI]

#### Render cơ bản (5 tests)
- Logo "H-NOXH SXD" hiển thị
- "TP. Hồ Chí Minh" hiển thị
- Nhóm ĐIỀU HÀNH hiển thị
- Nhóm QUẢN LÝ TIẾN ĐỘ hiển thị
- Nhóm QUẢN LÝ hiển thị

#### Menu items ĐIỀU HÀNH (2 tests)
- "Tổng quan"
- "Dashboard App"

#### Menu items QUẢN LÝ TIẾN ĐỘ (2 tests)
- "Sơ đồ Gantt dự án NOXH"
- "Cập nhật tiến độ năm"

#### Menu items QUẢN LÝ (2 tests)
- "Danh sách dự án"
- "Sơ đồ Gantt quy trình"

#### HỆ THỐNG – Admin only (11 tests)
| Test | User | Kết quả |
|------|------|---------|
| Thấy nhóm HỆ THỐNG | Admin | ✅ hiển thị |
| Thấy "Danh mục quy trình" | Admin | ✅ hiển thị |
| Thấy "Quản lý tài khoản" | Admin | ✅ hiển thị |
| Thấy "Cơ quan xử lý" | Admin | ✅ hiển thị |
| Thấy "Nguồn vốn" | Admin | ✅ hiển thị |
| Thấy "Nhóm dự án" | Admin | ✅ hiển thị |
| Thấy "Phân loại dự án" | Admin | ✅ hiển thị |
| Thấy "Cấp công trình" | Admin | ✅ hiển thị |
| Thấy "Danh mục CĐT" | Admin | ✅ hiển thị |
| KHÔNG thấy HỆ THỐNG | Chuyên viên | ❌ ẩn |
| KHÔNG thấy "Quản lý tài khoản" | Chuyên viên | ❌ ẩn |

#### Active tab highlighting (3 tests)
- Tab active tồn tại
- Tab active có class bg-blue
- Tab không active không có bg-blue-600

#### Navigation callbacks (7 tests)
| Click | onNavigate called with |
|-------|----------------------|
| "Tổng quan" | 'dashboard' |
| "Dashboard App" | 'dashboard-app' |
| "Danh sách dự án" | 'projects' |
| "Sơ đồ Gantt dự án NOXH" | 'gantt-dashboard-noxh' |
| "Quản lý tài khoản" | 'user-management' |
| "Sơ đồ Gantt quy trình" | 'process-gantt' |
| "Cập nhật tiến độ năm" | 'annual-update' |

#### Chuyên viên menu (5 tests)
- Vẫn thấy ĐIỀU HÀNH, QUẢN LÝ TIẾN ĐỘ, QUẢN LÝ
- Vẫn thấy "Danh sách dự án"
- Không thấy HỆ THỐNG

---

### 3.4 E2E Tests – `auth.spec.ts` (17 tests)

#### Trang đăng nhập (5 tests)
- Tiêu đề hệ thống hiển thị
- Input tên đăng nhập hiển thị
- Input mật khẩu hiển thị
- Nút Đăng nhập hiển thị
- Thông tin tài khoản mẫu hiển thị

#### Đăng nhập thất bại (4 tests)
- Sai cả username và password → lỗi
- Đúng username, sai password → lỗi
- Để trống username → form không submit
- Không điều hướng sau khi đăng nhập sai

#### Đăng nhập thành công (4 tests)
- admin/123456 → vào màn hình chính
- sxd/123456 → đăng nhập thành công
- Form đăng nhập ẩn sau đăng nhập
- Sidebar xuất hiện sau đăng nhập

#### Phân quyền sau đăng nhập (6 tests)
| Test | User | Kết quả |
|------|------|---------|
| Admin thấy HỆ THỐNG | admin | ✅ |
| Admin thấy "Quản lý tài khoản" | admin | ✅ |
| Chuyên viên không thấy HỆ THỐNG | sxd | ❌ |
| Chuyên viên không thấy "Quản lý tài khoản" | sxd | ❌ |
| Mọi user thấy ĐIỀU HÀNH | sxd | ✅ |
| Mọi user thấy "Danh sách dự án" | sxd | ✅ |

---

### 3.5 E2E Tests – `projects.spec.ts` (17 tests)

#### Dashboard (3 tests)
- Gọi /api/data khi tải trang
- Hiển thị thẻ "Tổng dự án NOXH"
- Không crash khi load xong

#### Dashboard App (1 test)
- Điều hướng thành công

#### Danh sách dự án (3 tests)
- Hiển thị danh sách sau load
- Tìm kiếm lọc theo tên
- Xóa tìm kiếm → danh sách xuất hiện lại

#### Tạo dự án mới (1 test)
- Nút tạo mới tồn tại

#### Gantt Dashboard NOXH (1 test)
- Điều hướng và hiển thị content

#### Cập nhật tiến độ năm (1 test)
- Điều hướng và hiển thị content

#### Sơ đồ Gantt quy trình (1 test)
- Điều hướng và hiển thị content

#### Trạng thái kết nối DB (3 tests)
- /api/db-status trả về đúng cấu trúc
- /api/health trả về ok
- /api/data trả về dữ liệu

---

### 3.6 E2E Tests – `menu-navigation.spec.ts` [MỚI] (34 tests)

#### Admin – ĐIỀU HÀNH (2 tests)
- Tổng quan load được
- Dashboard App load được

#### Admin – QUẢN LÝ TIẾN ĐỘ (2 tests)
- Sơ đồ Gantt dự án NOXH load được
- Cập nhật tiến độ năm load được

#### Admin – QUẢN LÝ (2 tests)
- Danh sách dự án load được
- Sơ đồ Gantt quy trình load được

#### Admin – HỆ THỐNG (12 tests)
| Menu item | Test |
|-----------|------|
| Danh mục quy trình | Load thành công |
| Danh mục CĐT | Load thành công |
| Nhóm dự án | Load thành công |
| Phân loại dự án | Load thành công |
| Cấp công trình | Load thành công |
| Trạng thái dự án | Load thành công |
| Giai đoạn dự án | Load thành công |
| Cơ quan xử lý | Load thành công |
| Nguồn vốn | Load thành công |
| Trạng thái bước | Load thành công |
| Quản lý tài khoản | Load thành công |
| Quản lý tài khoản | Hiển thị danh sách user |

#### Chuyên viên – menu hạn chế (7 tests)
| Test | Kết quả |
|------|---------|
| Thấy ĐIỀU HÀNH | ✅ |
| Thấy "Tổng quan" và click được | ✅ |
| Thấy "Danh sách dự án" | ✅ |
| Không thấy HỆ THỐNG | ❌ |
| Không thấy "Quản lý tài khoản" | ❌ |
| Không thấy "Danh mục quy trình" | ❌ |
| Không thấy "Cơ quan xử lý" (button) | ❌ |

#### Chuyển tab và quay lại (2 tests)
- Chuyển giữa Dashboard và Danh sách dự án
- Chuyển giữa các trang HỆ THỐNG

---

### 3.7 API Tests – `test_api.sh` (v2, ~47 tests)

| Nhóm | Số test | Ghi chú |
|------|---------|---------|
| Infrastructure (Health, DB Status) | 3 | + retry test |
| GET /api/data | 4 | + metadata check |
| Projects CRUD | 5 | |
| Attachments | 5 | + invalid ID test, not found test |
| Users CRUD | 4 | |
| Actual Progress | 3 | |
| Metadata | 12 | + projectCategories |
| **Email Config [MỚI]** | **3** | GET, POST, POST with placeholder |
| **Password Recovery [MỚI]** | **4** | success, tempPassword, emailSent, not found |
| **TỔNG** | **~47** | |

---

## 4. CÁC TÍNH NĂNG MỚI ĐƯỢC KIỂM THỬ

### 4.1 Email Configuration (SMTP)
| Tính năng | Loại test | Số cases |
|-----------|----------|---------|
| GET config – ẩn password | Integration + API | 4 |
| POST config – lưu | Integration + API | 3 |
| POST config – giữ password cũ (placeholder) | Integration + API | 2 |
| Error handling | Integration | 2 |

### 4.2 Password Recovery
| Tính năng | Loại test | Số cases |
|-----------|----------|---------|
| User không tồn tại → 404 | Integration + API | 2 |
| User không có email → 400 | Integration | 1 |
| Recovery thành công | Integration + API | 4 |
| DB fail → 500 | Integration | 1 |

### 4.3 Attachment Download
| Tính năng | Loại test | Số cases |
|-----------|----------|---------|
| Download hợp lệ | Integration + API | 2 |
| ID không phải số → 400 | Integration + API | 2 |
| Không tìm thấy → 404 | Integration + API | 2 |

### 4.4 Phân quyền menu (Role-based)
| Tính năng | Loại test | Số cases |
|-----------|----------|---------|
| Admin thấy HỆ THỐNG | Component + E2E | 8 |
| Non-Admin không thấy HỆ THỐNG | Component + E2E | 10 |
| Admin có 11 menu items HỆ THỐNG | Component | 9 |
| Callback navigation đúng | Component | 7 |

---

## 5. HƯỚNG DẪN CHẠY TESTS

### 5.1 Unit & Integration Tests (Vitest)

```bash
# Chạy tất cả
npm test

# Chạy riêng unit tests
npx vitest run test/unit/

# Chạy riêng integration tests
npx vitest run test/integration/

# Chạy riêng component tests
npx vitest run test/component/

# Chạy với coverage report
npm run test:coverage

# Watch mode
npm run test:watch
```

### 5.2 E2E Tests (Playwright)

```bash
# Bước 1: Khởi động server
npm run dev

# Bước 2: Chạy tất cả E2E
npx playwright test

# Chạy từng file
npx playwright test test/e2e/auth.spec.ts
npx playwright test test/e2e/projects.spec.ts
npx playwright test test/e2e/menu-navigation.spec.ts  # MỚI

# Chạy với UI mode (debug)
npx playwright test --ui

# Chạy với headed browser
npx playwright test --headed
```

### 5.3 API Tests (Bash)

```bash
# Bước 1: Khởi động server
npm run dev

# Bước 2: Chạy test suite
bash test/test_api.sh
```

### 5.4 Chạy tất cả (Master runner)

```powershell
# PowerShell
.\test\run_all.ps1
```

---

## 6. CẤU TRÚC FILE TEST

```
test/
├── unit/
│   ├── projectUtils.test.ts     ← Cập nhật: +13 tests (edge cases)
│   └── aiService.test.ts        ← Không thay đổi
├── integration/
│   ├── api.routes.test.ts       ← Cập nhật: +31 tests (email config, recovery, attachments)
│   └── db.test.ts               ← Không thay đổi
├── component/
│   ├── Login.test.tsx           ← Không thay đổi
│   ├── Dashboard.test.tsx       ← Không thay đổi
│   └── Sidebar.test.tsx         ← MỚI: 38 tests (role-based menu)
├── e2e/
│   ├── auth.spec.ts             ← Cập nhật: +13 tests (phân quyền)
│   ├── projects.spec.ts         ← Cập nhật: +13 tests (navigation, API)
│   └── menu-navigation.spec.ts  ← MỚI: 34 tests (toàn bộ menu)
├── test_api.sh                  ← Cập nhật: +14 tests (email, recovery, attachment)
├── setup.ts                     ← Không thay đổi
├── run_all.ps1                  ← Không thay đổi
└── README.md                    ← Cần cập nhật nếu cần
```

---

## 7. CÁC LƯU Ý VÀ GIỚI HẠN

### 7.1 Pre-existing Issues
- **TypeScript**: Lỗi `Cannot find module 'vitest'` trong IDE là lỗi cấu hình tsconfig cũ của dự án, **không ảnh hưởng runtime** – Vitest chạy độc lập với TypeScript compiler.
- **vitest.config.ts** và **playwright.config.ts** đã được cấu hình sẵn.

### 7.2 E2E Prerequisites
- Server phải đang chạy tại `http://localhost:3000`
- Dữ liệu ban đầu phải được load (users: `admin/123456`, `sxd/123456`)
- Playwright cần browser đã được cài (chạy `npx playwright install` lần đầu)

### 7.3 Tài khoản test
| Username | Password | Role | Ghi chú |
|----------|----------|------|---------|
| admin | 123456 | Admin | Toàn quyền |
| sxd | 123456 | Chuyên viên | Không thấy HỆ THỐNG |

### 7.4 Không được kiểm thử (out of scope)
- **AI Service** (Gemini API): Mock-based, không test real API call
- **Email gửi thật**: Mock nodemailer trong integration tests
- **File upload thực tế**: Chỉ test metadata, không test binary content
- **PostgreSQL thật**: Integration tests dùng In-Memory mode
- **Mobile app** (Flutter): Nằm ngoài phạm vi

---

## 8. ĐỀ XUẤT TIẾP THEO

### Ngắn hạn
1. Thêm test cho `ProfileModal` (đổi mật khẩu cá nhân)
2. Thêm test cho `UpdateProgress` modal
3. Thêm test cho `CreateProject` form validation

### Trung hạn
4. Thêm performance test (response time < 500ms)
5. Thêm accessibility test (a11y) với Playwright
6. Thêm visual regression test (screenshot comparison)

### Dài hạn
7. Load test với k6 hoặc Artillery (100+ concurrent users)
8. Integration test với PostgreSQL thật (Docker)
9. CI/CD pipeline: tự động chạy tests khi push code

---

*Báo cáo được tạo tự động bởi Claude Code – Anthropic*  
*Dự án: H-NOXH SXD | Sở Xây Dựng TP. Hồ Chí Minh*
