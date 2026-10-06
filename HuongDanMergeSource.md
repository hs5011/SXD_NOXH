# Hướng Dẫn Merge Source: NOXH_demo → NOXH_ketnoiAPI

> **Mục đích:** Đồng bộ những thay đổi từ môi trường làm việc hàng ngày (`NOXH_demo`) vào source gốc (`NOXH_ketnoiAPI`) một cách an toàn, có kiểm soát conflict.

---

## Tổng quan cách hoạt động

Script `scripts/sync-from-demo.ps1` thực hiện **3-way merge**:
- `.sync-base/` = bản chụp ảnh lần sync trước, làm "điểm so sánh chung"
- So sánh Demo vs Base và Gốc vs Base để phân loại từng file

| Tình huống | Hành động |
|---|---|
| Chỉ Demo thay đổi | Copy thẳng vào gốc |
| Chỉ Gốc thay đổi | Giữ nguyên gốc, không đụng vào |
| **Cả hai cùng sửa** | **CONFLICT → hiện diff, hỏi bạn chọn** |
| File mới ở Demo | Thêm vào gốc |
| Không thay đổi | Bỏ qua |

---

## Cấu trúc thư mục cần có

```
demo\
├── NOXH_demo\          ← nơi bạn chỉnh sửa hàng ngày
└── NOXH_ketnoiAPI\     ← source gốc (có test, scripts, .sync-base)
    ├── scripts\
    │   └── sync-from-demo.ps1
    ├── .sync-base\     ← tạo tự động sau lần sync đầu tiên
    └── .sync-backup\   ← backup tự động trước mỗi lần sync
```

---

## BƯỚC 1 — Kiểm tra cấu trúc thư mục

Mở PowerShell và kiểm tra 2 thư mục nằm cùng cấp:

```powershell
ls "E:\OneDrive - CONG TY CP CONG NGHE VIETINFO\Documents\Sở Xây Dựng\Phòng phát triển đô thị\demo"
```

Kết quả phải thấy cả `NOXH_demo` và `NOXH_ketnoiAPI`.

---

## BƯỚC 2 — Chạy lần đầu tiên (khởi tạo .sync-base)

Lần đầu chưa có `.sync-base/` nên script sẽ coi tất cả file Demo là "mới" và copy thẳng. Từ lần 2 trở đi mới phát hiện được conflict.

Mở PowerShell tại thư mục `NOXH_ketnoiAPI`:

```powershell
cd "E:\OneDrive - CONG TY CP CONG NGHE VIETINFO\Documents\Sở Xây Dựng\Phòng phát triển đô thị\demo\NOXH_ketnoiAPI"

powershell -File scripts\sync-from-demo.ps1
```

Kết quả mong đợi lần đầu:

```
======================================================================
  SYNC: NOXH_demo -> NOXH_ketnoiAPI  (3-way merge)
======================================================================
[INFO] Lan dau chay - chua co .sync-base
       Lan nay se coi tat ca file demo la 'moi', copy thang vao goc.
       Tu lan sau moi co the phat hien conflict.

-- Ket qua phan tich ---
   Khong thay doi             : 45 file
   Chi DEMO doi   -> copy vao : 9 file
   Chi GOC doi    -> giu nguyen: 0 file
   CA HAI cung doi -> CONFLICT : 0 file
   File moi tu demo            : 0 file

Bat dau xu ly 9 file? (y/N): y

   [OK] Da backup 9 file vao .sync-backup\20260617_143000
   COPY  src\App.tsx
   COPY  src\components\GanttDashboardNOXH.tsx
   ...
   [OK] Da cap nhat .sync-base

======================================================================
  SYNC HOAN TAT
======================================================================
```

---

## BƯỚC 3 — Workflow hàng ngày

```
1. Sửa code ở NOXH_demo
           ↓
2. npm run sync:dry-run         ← xem trước có gì thay đổi (không copy)
           ↓
3. npm run sync:from-demo       ← thực hiện sync
           ↓
4. Script tự chạy npm test      ← kiểm tra không có gì bị vỡ
           ↓
5. Script tạo .sync-pending-tests.md  ← danh sách file src/ đã thay đổi
           ↓
6. Nói với Claude Code:         ← Claude tự đọc và bổ sung test
   "vừa merge xong, check và bổ sung test"
```

### Bước 3a — Xem trước (Dry Run)

Luôn chạy dry-run trước để biết mình sắp làm gì:

```powershell
npm run sync:dry-run
```

Ví dụ kết quả:

```
-- Ket qua phan tich ---
   Khong thay doi             : 45 file
   Chi DEMO doi   -> copy vao : 2 file    ← an toàn, copy thẳng
   Chi GOC doi    -> giu nguyen: 1 file   ← bạn đã sửa ở gốc, giữ nguyên
   CA HAI cung doi -> CONFLICT : 1 file   ← cần xử lý thủ công
   File moi tu demo            : 0 file

[DRY RUN] Dung tai day. Bo flag -DryRun de thuc hien.
```

### Bước 3b — Thực hiện sync

```powershell
npm run sync:from-demo
```

Script tự động tiến hành, không hỏi xác nhận.

---

## BƯỚC 4 — Xử lý Conflict (khi cả 2 nơi cùng sửa)

Khi phát hiện conflict, script **dừng lại** và hỏi bạn từng file một:

```
======================================================================
  XU LY CONFLICT (1 file)
======================================================================

  FILE: src\components\GanttDashboardNOXH.tsx
  ----------------------------------------------------------

  [DEMO vs GOC] Nhung gi khac nhau:

  ====== DIFF: GOC  vs  DEMO ======
  @@ -120,7 +120,7 @@
     const loadData = async () => {
  -    const res = await fetch('/api/projects')           ← dòng ĐỎ = bản GỐC
  +    const res = await fetch('/api/projects?limit=50')  ← dòng XANH = bản DEMO
     }

  Chon hanh dong cho file nay:
  [D] Dung ban DEMO   (ghi de len source goc)
  [G] Giu ban GOC     (bo qua thay doi tu demo)
  [M] Mo ca 2 file    (tu merge bang tay)
  [S] Bo qua (skip)   (xu ly sau)
  > Chon [D/G/M/S]:
```

### Các lựa chọn khi conflict

| Nhập | Ý nghĩa | Khi nào dùng |
|------|---------|--------------|
| `D` | Dùng bản Demo | Demo mới hơn, thay đổi ở gốc không cần thiết |
| `G` | Giữ bản Gốc | Thay đổi ở gốc quan trọng hơn, bỏ qua demo |
| `M` | Mở VS Code diff | Cần giữ cả 2 thay đổi → merge tay |
| `S` | Skip | Chưa quyết định, xử lý sau |

### Nếu chọn M (Merge tay)

VS Code sẽ mở 2 file ở 2 cửa sổ (hoặc diff view):
- **Bên trái** = file Gốc (NOXH_ketnoiAPI)
- **Bên phải** = file Demo (NOXH_demo)

Thao tác:
1. Đọc diff để hiểu sự khác nhau
2. Copy thủ công phần cần giữ từ Demo sang Gốc
3. Lưu file Gốc lại
4. Quay lại terminal, nhấn Enter để script tiếp tục

> **Lưu ý:** Nếu không có VS Code, script mở Notepad cho cả 2 file.

---

## BƯỚC 5 — Cập nhật Test sau sync

Sau khi sync xong, nếu có file `src/` thay đổi, script sẽ hiển thị:

```
File src/ da thay doi - can cap nhat test:
   server\db.ts
   src\App.tsx
   src\components\GanttDashboardNOXH.tsx

  [OK] Da ghi .sync-pending-tests.md

  Noi voi Claude Code:
  'vua merge xong, check va bo sung test'
```

### Cách thực hiện

Mở Claude Code, gõ đúng câu này:

```
vừa merge xong, check và bổ sung test
```

Claude sẽ tự động:
1. Đọc file `.sync-pending-tests.md` (danh sách file đã thay đổi)
2. Đọc từng file source để hiểu logic mới
3. So sánh với test hiện tại, phát hiện phần còn thiếu
4. Bổ sung test case vào đúng file test
5. Chạy test để xác nhận pass
6. Xóa file `.sync-pending-tests.md` sau khi hoàn thành

> **Lưu ý:** Bước này chỉ cần làm khi có file `src/` hoặc `server/` thay đổi.
> Nếu chỉ sửa file tĩnh (HTML, CSS, README...) thì bỏ qua.

---

## BƯỚC 7 — Kiểm tra sau sync

Script tự động chạy `npm test` sau khi copy xong. Nếu có test fail:

**Rollback về bản trước** (thay timestamp bằng giá trị thật trong thông báo):

```powershell
# Xem danh sách backup
ls .sync-backup\

# Rollback (ví dụ timestamp 20260617_143000)
Copy-Item ".sync-backup\20260617_143000\*" "." -Recurse -Force
```

---

## Tất cả lệnh hay dùng

```powershell
# Xem trước (không thay đổi gì)
npm run sync:dry-run

# Sync bình thường (tự động tiến hành, hiện diff khi conflict)
npm run sync:from-demo

# Sync không chạy npm test (nhanh hơn)
powershell -File scripts\sync-from-demo.ps1 -SkipTest

# Sync tự động chọn Demo khi conflict (không hỏi)
powershell -File scripts\sync-from-demo.ps1 -Force

# Kết hợp: Force + không test
powershell -File scripts\sync-from-demo.ps1 -Force -SkipTest
```

---

## Tóm tắt toàn bộ workflow (nhìn nhanh)

```
[NOXH_demo]  Sửa code
      |
      v
npm run sync:dry-run          (1) Xem trước
      |
      v
npm run sync:from-demo        (2) Sync + tự chạy npm test
      |
      +-- Có conflict? ---------> Chọn [D/G/M/S] cho từng file
      |
      v
.sync-pending-tests.md        (3) Script tạo danh sách file thay đổi
      |
      v
"vừa merge xong, check và    (4) Nói với Claude Code
 bổ sung test"                    Claude tự đọc + bổ sung test
      |
      v
[NOXH_ketnoiAPI]  Source gốc + test đã cập nhật
```

---

## Các file bị loại trừ (không bao giờ sync)

Script tự động bỏ qua các file/thư mục sau:

| Loại | Danh sách |
|------|-----------|
| **Thư mục** | `node_modules`, `dist`, `coverage`, `playwright-report`, `test-results`, `deploy_packages`, `.git`, `uploads`, `test`, `.sync-base`, `scripts` |
| **File** | `.env`, `.env.local`, `.deploy.env`, `package-lock.json` |

> **Lý do:** Các file này hoặc được tạo tự động (build, install), hoặc chứa thông tin nhạy cảm (env), hoặc thuộc về source gốc (test scripts).

---

## Thư mục .sync-base — Điểm quan trọng

`.sync-base/` là "trí nhớ" của script — lưu bản chụp ảnh sau mỗi lần sync:

- **Không xóa thư mục này** — nếu xóa, lần sync tiếp theo sẽ coi tất cả là "mới" và copy hết từ Demo vào Gốc
- **Không sửa file trong đây** — script quản lý tự động
- **Có thể commit vào git** — giúp team cùng có baseline chung

---

## Ví dụ tình huống thực tế

### Tình huống 1: Chỉ sửa ở Demo (thường gặp nhất)

```
Demo: sửa GanttDashboardNOXH.tsx (thêm tính năng mới)
Gốc: không đụng vào

→ Script: copy thẳng từ Demo sang Gốc
→ Không hỏi gì, tự động hoàn toàn
```

### Tình huống 2: Vừa sửa Demo vừa sửa test ở Gốc

```
Demo: sửa App.tsx (thêm route mới)
Gốc: sửa test/integration/api.routes.test.ts (thêm test case)

→ App.tsx: chỉ Demo sửa → copy thẳng
→ api.routes.test.ts: chỉ Gốc sửa → giữ nguyên (không đụng vào)
```

### Tình huống 3: Cả 2 cùng sửa ProfileModal

```
Demo: sửa ProfileModal.tsx (sửa UI)
Gốc: sửa ProfileModal.tsx (sửa validation)

→ CONFLICT: script hiện diff và hỏi
→ Bạn chọn [M] → mở VS Code → merge tay cả UI lẫn validation
```

---

## Troubleshooting

### Script báo "Khong tim thay NOXH_demo"

Kiểm tra đường dẫn thực tế của thư mục demo:
```powershell
ls (Split-Path (Get-Location) -Parent)
```
Nếu tên thư mục khác `NOXH_demo`, cần sửa biến `$DEMO_DIR` trong script.

### Không thấy màu sắc trong diff

Git chưa được cài hoặc không có trong PATH. Cài Git for Windows tại https://git-scm.com — script dùng `git diff --no-index` để hiện diff màu.

### npm test fail sau sync

```powershell
# Xem log test để biết test nào fail
npm test

# Nếu cần rollback
ls .sync-backup\
Copy-Item ".sync-backup\<TIMESTAMP>\*" "." -Recurse -Force
```

### Muốn bỏ qua một file khi sync

Thêm tên file vào mảng `$EXCLUDE_FILES` trong `scripts/sync-from-demo.ps1`:

```powershell
$EXCLUDE_FILES = @(".env",".env.local",".deploy.env","package-lock.json","ten-file-muon-bo-qua.ts")
```
