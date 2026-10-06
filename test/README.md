# Hướng dẫn chạy Test

## Cấu trúc thư mục

```
test/
├── unit/                              # Unit tests — hàm toán tử thuần túy
│   ├── projectUtils.test.ts           # parseDate, formatDate, calculateProjectStatus (48 tests)
│   ├── aiService.test.ts              # Gemini AI generateProjectReport (6 tests)
│   └── crypto.test.ts                 # hashPassword SHA-256 (23 tests)
│
├── integration/                       # Integration tests — DB được mock, không cần PostgreSQL thật
│   ├── db.test.ts                     # DB layer CRUD chạy In-Memory (20 tests)
│   ├── api.routes.test.ts             # Express API routes cơ bản (187 tests)
│   ├── api.upload-policy.test.ts      # Upload file + password policy (30 tests)
│   ├── api.extended.test.ts           # Login, uniqueness, isolation, security (27 tests)
│   └── api.auth.test.ts               # Phân quyền RBAC toàn bộ routes (70 tests)
│
├── component/                         # Component tests — React render trong jsdom
│   ├── Login.test.tsx                 # Form đăng nhập: render, lỗi, thành công (12 tests)
│   ├── Dashboard.test.tsx             # Thẻ thống kê, số dự án, click handler (9 tests)
│   ├── Sidebar.test.tsx               # Navigation, role-based menu (35 tests)
│   ├── auth.test.tsx                  # Xác thực, phân quyền (48 tests)
│   ├── UpdateProgress.test.tsx        # Cập nhật tiến độ, modal (19 tests)
│   ├── ProjectList.test.tsx           # Bảng dự án, lọc (SearchableSelect), phân trang (35 tests)
│   ├── CreateProject.test.tsx         # Form tạo/sửa dự án (36 tests)
│   ├── UserManagement.test.tsx        # CRUD tài khoản người dùng (56 tests)
│   ├── AnnualProgressUpdate.test.tsx  # Cập nhật tiến độ năm (20 tests)
│   ├── ProjectGanttDetail.test.tsx    # Sơ đồ Gantt chi tiết dự án (52 tests)
│   ├── ProjectDetail.test.tsx         # Modal chi tiết dự án, 4 tab (51 tests)
│   ├── HousingUpdateView.test.tsx     # Cập nhật hồ sơ NOXH (63 tests)
│   ├── DashboardApp.test.tsx          # Dashboard chính — navigation, filter, detail (106 tests)
│   ├── GanttDashboardNOXH.test.tsx    # Bảng Gantt tổng hợp dự án NOXH (59 tests)
│   ├── e2e-project-flow.test.tsx      # Luồng tích hợp cross-component (61 tests)
│   ├── role-filter.test.ts            # Logic phân quyền lọc dự án + menu (50 tests)
│   └── role-sidebar.test.tsx          # Sidebar render thật theo role (16 tests)
│
├── e2e/                               # E2E tests — Playwright, cần server + DB thật đang sống
│   ├── auth.spec.ts                   # Đăng nhập, đăng xuất, phân quyền menu (21 tests)
│   ├── projects.spec.ts               # Dashboard, Danh sách dự án, DB status (13 tests)
│   ├── menu-navigation.spec.ts        # Điều hướng toàn bộ menu theo role (22 tests)
│   ├── project-lifecycle.spec.ts      # Vòng đời dự án: tạo→chi tiết→cập nhật→tìm kiếm (32 tests)
│   ├── permissions.spec.ts            # Phân quyền dữ liệu 3 nhóm user (29 tests)
│   ├── gantt-progress.spec.ts         # Gantt → chi tiết → cập nhật tiến độ (12 tests)
│   ├── user-management.spec.ts        # Quản lý tài khoản (Admin only) (23 tests)
│   └── profile.spec.ts                # Thông tin cá nhân, đổi mật khẩu (22 tests)
│
├── test_api.sh               # API bash script — gọi HTTP endpoint thực tế (33 tests)
├── setup.ts                  # Setup cho @testing-library/jest-dom
├── run_all.ps1               # Master runner (PowerShell)
├── DanhSachTest.md           # Danh sách chi tiết từng test case theo nhóm
└── README.md                 # File này
```

> **Cập nhật 08/07/2026**: Đã chạy thật **toàn bộ** test suite — `npm test` (1139 Vitest)
> và `npm run test:e2e` (174 Playwright, cả 8 file). Phát hiện + sửa 4 lỗi thật trong test
> khi chạy `HousingUpdateView.test.tsx`, `project-lifecycle.spec.ts`,
> `user-management.spec.ts` (selector/assertion lỗi thời, không phải bug source); 6 file
> Playwright còn lại chạy sạch. **Kết quả cuối: 1139/1139 Vitest + 174/174 Playwright pass
> 100%.** Chi tiết xem `test/DanhSachTest.md` và bộ nhớ Claude (`feedback-playwright-patterns`).
>
> **Cập nhật 07/07/2026**: Đã rà soát lại toàn bộ sau khi phát hiện 2 thay đổi lớn —
> (1) agencyId='1' (Sở Xây dựng) nay có quyền như Admin với menu HỆ THỐNG, và
> (2) nhiều bộ lọc (ProjectList, CreateProject) đã chuyển từ `<select>` sang component
> `SearchableSelect` tự viết. Chi tiết xem `test/DanhSachTest.md` và bộ nhớ Claude
> (`feedback-vitest-component-tests`, `project-agency-permission-model`).

---

## Yêu cầu môi trường

| Công cụ | Phiên bản | Dùng cho |
|---------|-----------|----------|
| Node.js | 18+ | Chạy tất cả |
| npm | 9+ | Cài package |
| bash (Git for Windows) | bất kỳ | Chạy `test_api.sh` |
| Server (`npm run dev`) | — | E2E tests và `test_api.sh` |

---

## Cách 1 — Dùng Master Runner (Khuyến nghị)

Mở PowerShell, `cd` vào thư mục gốc dự án, rồi chạy:

### Chỉ chạy Unit + Integration + Component (không cần server)

```powershell
.\test\run_all.ps1
```

Kết quả mong đợi:
```
[PASS] Vitest : PASS
KET LUAN: [OK] TAT CA TESTS DEU PASS
```

### Chạy tất cả kể cả E2E (cần server đang chạy)

**Bước 1** — Mở terminal khác, khởi động server:
```powershell
npm run dev
```

**Bước 2** — Quay lại terminal gốc, chạy:
```powershell
.\test\run_all.ps1 -E2E
```

### Chạy tất cả kèm báo cáo coverage

```powershell
.\test\run_all.ps1 -Coverage
```

Sau khi chạy xong, mở file `coverage\index.html` để xem báo cáo chi tiết.

---

## Cách 2 — Chạy từng loại test riêng lẻ

### Unit + Integration + Component (1139 tests)

```powershell
npm test
```

### Chạy ở chế độ watch (tự động chạy lại khi sửa code)

```powershell
npm run test:watch
```

### Chạy kèm coverage report

```powershell
npm run test:coverage
```

### Chạy với giao diện trực quan (Vitest UI)

```powershell
npm run test:ui
```

Mở trình duyệt tại `http://localhost:51204` để xem kết quả.

---

## Cách 3 — Chạy E2E Playwright (cần server)

**Bước 1** — Khởi động server:
```powershell
npm run dev
```

**Bước 2** — Mở terminal khác, chạy Playwright:

```powershell
# Chạy tất cả E2E tests
npm run test:e2e

# Chạy với giao diện trực quan (có thể xem browser trực tiếp)
npm run test:e2e:ui

# Xem HTML report sau khi chạy
npm run test:e2e:report
```

---

## Cách 4 — Chạy API bash script (cần server)

**Bước 1** — Khởi động server:
```powershell
npm run dev
```

**Bước 2** — Chạy script:
```bash
bash test/test_api.sh
```

Script sẽ kiểm tra 33 endpoint HTTP và in kết quả PASS/FAIL theo màu.

---

## Tổng hợp các lệnh

| Lệnh | Mô tả | Cần server? |
|------|-------|-------------|
| `.\test\run_all.ps1` | 1139 tests (unit + integration + component) | Không |
| `.\test\run_all.ps1 -E2E` | 1139 + Playwright + bash API tests | Có |
| `.\test\run_all.ps1 -Coverage` | 1139 tests + xuất coverage | Không |
| `npm test` | Chạy Vitest một lần | Không |
| `npm run test:watch` | Vitest chế độ watch | Không |
| `npm run test:coverage` | Vitest + coverage report | Không |
| `npm run test:e2e` | Playwright E2E tests | Có |
| `npm run test:e2e:ui` | Playwright UI mode | Có |
| `bash test/test_api.sh` | 33 HTTP endpoint tests | Có |

---

## Kết quả mong đợi khi tất cả PASS

```
Test Files  25 passed (25)
     Tests  1139 passed (1139)
```

Xem bảng đầy đủ từng file (33 file, 1313 test) tại [`test/DanhSachTest.md`](DanhSachTest.md#tổng-kết-theo-file).
Tóm tắt theo nhóm:

| Nhóm test | Số file | Số lượng |
|-----------|------|----------|
| Unit (Vitest) | 3 | 77 |
| Integration (Vitest) | 5 | 334 |
| Component (Vitest) | 17 | 728 |
| **Tổng Vitest** | **25** | **1139** |
| E2E (Playwright — đã chạy thật toàn bộ, pass 100%) | 8 | 174 |
| API bash | 1 | 33 |
| **Tổng tất cả** | **34** | **1346** |

---

## Xử lý lỗi thường gặp

### `Cannot connect to database`
Unit và Integration tests không cần DB — chạy bình thường. Chỉ E2E mới cần server và DB.

### `server KHONG chay o port 3000`
Cần chạy `npm run dev` ở terminal riêng trước khi dùng flag `-E2E`.

### `bash khong tim thay`
Cài [Git for Windows](https://git-scm.com/download/win) — bash được đi kèm tự động.

### `Test Files X failed`
Xem output chi tiết ngay trong terminal. Dòng `×` chỉ đúng test bị lỗi và dòng code gây ra.
