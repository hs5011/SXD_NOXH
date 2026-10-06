# Hướng Dẫn Deploy — Hệ thống NOXH

> **Cập nhật**: 16/06/2026  
> **Áp dụng cho**: Windows Server + Nginx (đã cài sẵn)

---

## Hiểu đúng kiến trúc trước khi deploy

Source này dùng kiến trúc **Monolithic** — Express.js vừa xử lý API vừa tự phục vụ giao diện React từ **1 process duy nhất trên cổng 3000**.

```
Trình duyệt
     │
     ▼
  Nginx :80 / :443          ← chỉ làm nhiệm vụ proxy, KHÔNG serve file tĩnh
     │
     └── proxy TẤT CẢ → localhost:3000
                                │
                     Node.js (Express) — dist/server.cjs
                          ├── /api/*      → xử lý API
                          └── /*          → trả index.html + assets React
                                │
                           PostgreSQL
```

> **Quan trọng**: Nginx **không** cần trỏ vào thư mục `dist/` để serve file tĩnh.  
> Express đã tự làm điều đó khi `NODE_ENV=production`. Nginx chỉ cần proxy về port 3000.

---

## Mục lục

- [Cách 2 — Node.js trực tiếp + PM2](#cách-2--nodejs-trực-tiếp--pm2)
- [Cách 3 — Dùng script ci_deploy.ps1](#cách-3--dùng-script-ci_deployps1) *(gồm Lệnh 1–8)*
- [Cấu hình Nginx (dùng cho cả 2 cách)](#cấu-hình-nginx-dùng-cho-cả-2-cách)
- [Kiểm tra sau khi deploy](#kiểm-tra-sau-khi-deploy)
- [Quy trình cập nhật khi có code mới](#quy-trình-cập-nhật-khi-có-code-mới)
- [Xử lý sự cố thường gặp](#xử-lý-sự-cố-thường-gặp)

---

## Cách 2 — Node.js trực tiếp + PM2

> **Phù hợp khi**: Muốn kiểm soát từng bước, debug trực tiếp trên máy.

### Bước 2.1 — Cài phần mềm cần thiết (làm 1 lần duy nhất)

Mở **PowerShell với quyền Administrator**:

```powershell
# Kiểm tra Node.js đã cài chưa (cần >= 18)
node -v
# Nếu chưa có: tải tại https://nodejs.org → bản LTS

# Cài PM2 — công cụ quản lý process Node.js
npm install -g pm2

# Cài pm2-windows-startup — tự khởi động PM2 khi Windows reboot
npm install -g pm2-windows-startup
```

### Bước 2.2 — Chuẩn bị thư mục và source

```powershell
# Tạo thư mục chứa app
New-Item -ItemType Directory -Force -Path "C:\www\noxh"

# Cách A: Clone từ Git (khuyến nghị)
cd C:\www
git clone https://your-repo-url.git noxh

# Cách B: Copy từ máy phát triển (OneDrive) sang
Copy-Item -Recurse `
  "E:\OneDrive - CONG TY CP CONG NGHE VIETINFO\Documents\Sở Xây Dựng\Phòng phát triển đô thị\demo\NOXH_ketnoiAPI\*" `
  "C:\www\noxh\" `
  -Exclude "node_modules", "dist", "coverage", "playwright-report", "test-results", "deploy_packages"
```

### Bước 2.3 — Cài đặt PostgreSQL và tạo database

**Nếu PostgreSQL chưa có**:
- Tải tại: https://www.postgresql.org/download/windows/
- Cài mặc định, nhớ mật khẩu cho user `postgres`

**Tạo database và user**:

Mở **pgAdmin** (trong Start Menu) hoặc **SQL Shell (psql)**:

```sql
-- Tạo user cho app
CREATE USER noxh_user WITH ENCRYPTED PASSWORD 'MatKhauManhO@2026';

-- Tạo database
CREATE DATABASE noxh_db OWNER noxh_user;

-- Cấp quyền đầy đủ
GRANT ALL PRIVILEGES ON DATABASE noxh_db TO noxh_user;

-- Thoát
\q
```

Kiểm tra kết nối:
```powershell
# Dùng psql (nằm trong C:\Program Files\PostgreSQL\<version>\bin\)
psql -U noxh_user -d noxh_db -h localhost
# Nhập mật khẩu → thấy prompt noxh_db=# là thành công
\q
```

### Bước 2.4 — Tạo file cấu hình `.env`

```powershell
cd C:\www\noxh

# Tạo file .env (dùng Notepad hoặc VS Code)
notepad .env
```

Điền nội dung sau (thay các giá trị thật vào):

```env
# Môi trường — BẮT BUỘC phải là production
NODE_ENV=production

# Cổng server (mặc định 3000)
PORT=3000

# Kết nối PostgreSQL
# Định dạng: postgresql://username:password@host:port/database
DATABASE_URL=postgresql://noxh_user:MatKhauManhO@2026@localhost:5432/noxh_db

# Gemini AI (lấy tại https://aistudio.google.com/app/apikey)
GEMINI_API_KEY=your_gemini_api_key_here

# Email SMTP — dùng để gửi mật khẩu tạm khi khôi phục tài khoản (tùy chọn)
# Nếu để trống thì tính năng gửi email sẽ tắt, vẫn hiển thị mật khẩu tạm trên màn hình
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password_here
```

> **Lưu ý về Gmail**: Dùng **App Password** (không phải mật khẩu Gmail thường).  
> Tạo tại: Google Account → Security → 2-Step Verification → App Passwords.

### Bước 2.5 — Cài dependencies và build

```powershell
cd C:\www\noxh

# Cài tất cả packages
npm install

# Build frontend (React → dist/assets/) và backend (server.ts → dist/server.cjs)
npm run build
```

Sau khi build xong, kiểm tra các file này phải tồn tại:

```powershell
Test-Path "C:\www\noxh\dist\server.cjs"   # phải là True
Test-Path "C:\www\noxh\dist\index.html"   # phải là True

# Xem nhanh thư mục dist
Get-ChildItem C:\www\noxh\dist\
```

Kết quả mong đợi:
```
dist\
├── server.cjs          ← Node.js backend (Express + API)
├── server.cjs.map      ← source map (debug)
├── index.html          ← entry point React
└── assets\
    ├── index-xxxx.js   ← React bundle
    └── index-xxxx.css  ← CSS
```

### Bước 2.6 — Khởi động server bằng PM2

```powershell
cd C:\www\noxh

# Khởi động — PM2 sẽ tự restart nếu server bị crash
pm2 start dist/server.cjs --name "noxh-app"

# Xem trạng thái
pm2 status
```

Kết quả mong đợi:
```
┌────┬──────────┬─────────┬───────┬──────────┬────────┐
│ id │ name     │ status  │ cpu   │ memory   │ uptime │
├────┼──────────┼─────────┼───────┼──────────┼────────┤
│ 0  │ noxh-app │ online  │ 0%    │ 85.2mb   │ 5s     │
└────┴──────────┴─────────┴───────┴──────────┴────────┘
```

Nếu thấy `status: errored` → xem log để tìm lỗi:
```powershell
pm2 logs noxh-app --lines 30
```

### Bước 2.7 — Cấu hình PM2 tự khởi động sau reboot

```powershell
# Cấu hình startup (chạy 1 lần)
pm2-startup install

# Lưu danh sách process hiện tại
pm2 save
```

> Từ giờ mỗi khi Windows khởi động lại, PM2 sẽ tự chạy lại `noxh-app`.

### Bước 2.8 — Kiểm tra server đang hoạt động

```powershell
# Kiểm tra API health
Invoke-WebRequest -Uri "http://localhost:3000/api/health" | Select-Object -ExpandProperty Content
# Kết quả mong đợi: {"status":"ok"}

# Kiểm tra kết nối database
Invoke-WebRequest -Uri "http://localhost:3000/api/db-status" | Select-Object -ExpandProperty Content
# Kết quả mong đợi: {"connected":true,...}

# Kiểm tra trang web (giao diện React)
Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing | Select-Object -ExpandProperty StatusCode
# Kết quả mong đợi: 200
```

### Bước 2.9 — Cấu hình Nginx

*(Xem phần [Cấu hình Nginx](#cấu-hình-nginx-dùng-cho-cả-2-cách) bên dưới)*

---

## Cách 3 — Dùng script `ci_deploy.ps1`

> **Phù hợp khi**: Deploy production thật sự — script tự động chạy test trước, nếu có test fail thì **dừng ngay, không build, không deploy**. Đảm bảo không bao giờ đưa code lỗi lên production.

### Hiểu pipeline của script

```
Bạn chạy: .\ci_deploy.ps1 -Deploy -Target ssh
                │
                ▼
  ┌─────────────────────────────────────┐
  │ PHASE 1: Chạy npm test (Vitest)     │ ← nếu fail → DỪNG
  │   - Unit tests (47 tests)           │
  │   - Integration tests (83 tests)    │
  │   - Component tests (572 tests)     │
  └────────────────┬────────────────────┘
                   │ pass
                   ▼
  ┌─────────────────────────────────────┐
  │ PHASE 2: E2E Playwright             │ ← chỉ khi có -E2E flag
  │   (cần server đang chạy trước)      │
  └────────────────┬────────────────────┘
                   │
                   ▼
  ┌─────────────────────────────────────┐
  │ PHASE 3: npm run build              │ ← tạo dist/server.cjs + dist/index.html
  └────────────────┬────────────────────┘
                   │
                   ▼
  ┌─────────────────────────────────────┐
  │ PHASE 4: Tạo gói ZIP               │ ← deploy_packages\noxh_deploy_YYYYMMDD.zip
  │   Bao gồm: dist/ + package.json    │
  │   + start.sh + start.bat + README  │
  └────────────────┬────────────────────┘
                   │ (nếu có -Deploy flag)
                   ▼
  ┌─────────────────────────────────────┐
  │ PHASE 5: Deploy lên target          │
  │   ssh: upload ZIP → SSH vào server  │
  │         → giải nén → npm install    │
  │         → pm2 restart              │
  └─────────────────────────────────────┘
```

### Bước 3.1 — Tạo file cấu hình `.deploy.env`

```powershell
cd "E:\OneDrive - CONG TY CP CONG NGHE VIETINFO\Documents\Sở Xây Dựng\Phòng phát triển đô thị\demo\NOXH_ketnoiAPI"

# Copy từ file mẫu
Copy-Item .deploy.env.example .deploy.env

# Mở để chỉnh sửa
notepad .deploy.env
```

Nội dung `.deploy.env` — chỉnh theo server của bạn:

```env
# Target mặc định khi chạy .\ci_deploy.ps1 -Deploy
# Giá trị hợp lệ: zip | ssh | railway | render | gcp
DEPLOY_TARGET=ssh

# ── SSH / VPS ──────────────────────────────────────────────────────────────
# SSH_HOST: user@IP hoặc user@domain của server
SSH_HOST=deploy@123.45.67.89

# Cổng SSH (mặc định 22)
SSH_PORT=22

# Thư mục trên server để deploy app vào
SSH_APP_DIR=/home/deploy/noxh-app

# Đường dẫn private key SSH trên máy Windows của bạn
# Để trống nếu đã dùng SSH agent hoặc dùng mật khẩu
SSH_KEY_PATH=C:\Users\SonDH\.ssh\id_rsa

# ── Railway (nếu dùng target railway) ─────────────────────────────────────
# RAILWAY_TOKEN=your_railway_token_here

# ── Render.com (nếu dùng target render) ───────────────────────────────────
# RENDER_DEPLOY_HOOK=https://api.render.com/deploy/srv-xxxxx?key=yyyy

# ── Google Cloud Run (nếu dùng target gcp) ────────────────────────────────
# GCP_PROJECT_ID=your-gcp-project-id
# GCP_SERVICE_NAME=noxh-api
# GCP_REGION=asia-southeast1
```

> **Bảo mật**: File `.deploy.env` đã được thêm vào `.gitignore`. Không commit file này lên Git vì chứa thông tin nhạy cảm.

### Bước 3.2 — Các lệnh chạy script

Tất cả lệnh dưới đây chạy từ **thư mục gốc dự án** trong PowerShell:

```powershell
cd "E:\OneDrive - CONG TY CP CONG NGHE VIETINFO\Documents\Sở Xây Dựng\Phòng phát triển đô thị\demo\NOXH_ketnoiAPI"
```

---

#### Lệnh 1 — Chỉ test + build (không deploy, dùng để kiểm tra)

```powershell
.\ci_deploy.ps1
```

Output mẫu khi thành công:
```
======================================================================
  PHASE 1 - VITEST: Unit | Integration | Component
======================================================================
  [INFO] test/unit/        - ham toan tu, AI service (54 tests)
  [INFO] test/integration/ - DB layer, Express routes (79 tests)
  [INFO] test/component/   - React components (556 tests)
  [PASS] Vitest: TAT CA PASS

======================================================================
  KET QUA TESTS TONG HOP
======================================================================
  [PASS] Vitest : PASS

  [OK] TAT CA TESTS PASS - Chuyen sang build...

======================================================================
  PHASE 3 - BUILD PRODUCTION
======================================================================
  [....] Chay: npm run build...
  [PASS] Build thanh cong
  [INFO]   dist/server.cjs  - Backend (Node.js)
  [INFO]   dist/index.html  - Frontend entry
  [INFO]   dist/assets/     - Frontend JS/CSS

  Goi deploy san sang. De tu dong deploy, them flag -Deploy:
    .\ci_deploy.ps1 -Deploy                  # tao ZIP (mac dinh)
    .\ci_deploy.ps1 -Deploy -Target ssh      # VPS qua SSH
    .\ci_deploy.ps1 -Deploy -Target railway  # Railway
    .\ci_deploy.ps1 -Deploy -Target render   # Render.com
    .\ci_deploy.ps1 -Deploy -Target gcp      # Google Cloud Run
```

---

#### Lệnh 2 — Test + Build + tạo gói ZIP (không deploy lên server)

```powershell
.\ci_deploy.ps1 -Deploy
```

> Sử dụng khi muốn copy thủ công gói ZIP lên server.

Tạo ra file:
```
deploy_packages\
└── noxh_deploy_20260616_143022.zip   ← timestamp theo ngày giờ
```

Bên trong ZIP:
```
├── dist\               ← toàn bộ app đã build (backend + frontend)
├── package.json        ← để npm install trên server
├── package-lock.json
├── .env.example        ← mẫu file .env
├── uploads\            ← thư mục file đính kèm (rỗng)
├── start.sh            ← script khởi động trên Linux/macOS
├── start.bat           ← script khởi động trên Windows
└── DEPLOY_README.md    ← hướng dẫn ngắn gọn
```

---

#### Lệnh 3 — Test + Build + Deploy lên VPS/Server qua SSH

```powershell
.\ci_deploy.ps1 -Deploy -Target ssh
```

Script tự động làm các việc sau:
1. Chạy toàn bộ Vitest tests — nếu fail thì dừng
2. Build ứng dụng
3. Tạo file ZIP
4. Upload ZIP lên server qua **SCP**
5. SSH vào server, thực hiện:
   - Giải nén ZIP vào `SSH_APP_DIR`
   - Kiểm tra file `.env` (tạo từ `.env.example` nếu chưa có)
   - Chạy `npm install --omit=dev`
   - Restart bằng PM2: `pm2 restart noxh-app` hoặc start mới nếu chưa có
6. In địa chỉ truy cập

**Yêu cầu trước khi chạy lệnh này**:

Server Linux phải đã cài:
```bash
# Trên server (chạy 1 lần duy nhất)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
pm2 startup   # chạy lệnh được in ra
```

SSH key phải đã được thêm vào server:
```powershell
# Trên máy Windows — nếu chưa có SSH key thì tạo
ssh-keygen -t rsa -b 4096 -f C:\Users\SonDH\.ssh\id_rsa

# Copy public key lên server
type C:\Users\SonDH\.ssh\id_rsa.pub | ssh deploy@server-ip "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
```

---

#### Lệnh 4 — Test + Build + Deploy lên Railway (cloud)

```powershell
# Cài Railway CLI (1 lần)
npm install -g @railway/cli
railway login   # mở trình duyệt đăng nhập

# Deploy
.\ci_deploy.ps1 -Deploy -Target railway
```

---

#### Lệnh 5 — Test + Build + Deploy lên Render.com (cloud, có free tier)

```powershell
# Lấy Deploy Hook URL từ:
# Render Dashboard → Service → Settings → Deploy Hook → Copy URL
# Điền vào .deploy.env: RENDER_DEPLOY_HOOK=https://api.render.com/deploy/...

.\ci_deploy.ps1 -Deploy -Target render
```

---

#### Lệnh 6 — Bao gồm cả E2E Playwright (đầy đủ nhất)

```powershell
# Mở terminal 1: khởi động server dev
npm run dev

# Mở terminal 2: chạy toàn bộ pipeline
.\ci_deploy.ps1 -E2E -Deploy -Target ssh
```

Script sẽ chạy thêm 163 Playwright tests trước khi build và deploy.

---

#### Lệnh 7 — Chạy kèm coverage report

```powershell
.\ci_deploy.ps1 -Coverage
```

Sau khi chạy, mở báo cáo:
```powershell
Start-Process ".\coverage\index.html"
```

---

#### Lệnh 8 — Chỉ build + tạo file ZIP (bỏ qua test)

```powershell
.\ci_deploy.ps1 -SkipTests -Deploy
```

> **Dùng khi nào**: Muốn đóng gói nhanh để copy lên server thủ công mà không cần chờ chạy hết test. Thường dùng khi bạn vừa chạy test riêng trước đó và chắc chắn code đang sạch.

> ⚠️ **Lưu ý**: Flag `-SkipTests` bỏ qua toàn bộ kiểm tra chất lượng. Không nên dùng cho lần deploy production quan trọng.

Script sẽ bỏ qua Phase 1 (Vitest) và chạy thẳng:

```
PHASE 1 - VITEST: DA BO QUA (-SkipTests)
  [WARN] Bo qua tat ca tests theo yeu cau...

PHASE 3 - BUILD PRODUCTION
  [....] Chay: npm run build...
  [PASS] Build thanh cong

PHASE 4 - TAO GOI DEPLOY
  + dist/
  + package.json
  ...
  [PASS] Tao ZIP thanh cong: deploy_packages\noxh_deploy_YYYYMMDD_HHmmss.zip
```

Kết quả tạo ra file tại:
```
deploy_packages\
└── noxh_deploy_20260619_143022.zip
```

---

### Bước 3.3 — Sau khi deploy SSH xong

Trên server, kiểm tra app đang chạy:

```bash
# Xem trạng thái
pm2 status

# Xem log realtime
pm2 logs noxh-app

# Kiểm tra API
curl http://localhost:3000/api/health
```

---

## Cấu hình Nginx (dùng cho cả 2 cách)

Mở file `C:\nginx\conf\nginx.conf`:

```powershell
notepad C:\nginx\conf\nginx.conf
```

**Xóa toàn bộ nội dung cũ**, thay bằng:

```nginx
worker_processes 1;

events {
    worker_connections 1024;
}

http {
    include      mime.types;
    default_type application/octet-stream;

    sendfile   on;
    gzip       on;
    gzip_types text/plain text/css application/json application/javascript image/svg+xml;

    # Giới hạn kích thước upload (10MB — khớp với server)
    client_max_body_size 10M;

    # Timeout
    proxy_connect_timeout  10s;
    proxy_send_timeout     60s;
    proxy_read_timeout     60s;

    server {
        listen      80;
        server_name localhost;   # ← thay bằng domain thật nếu có, ví dụ: noxh.sxd.tphcm.gov.vn

        # Proxy TẤT CẢ request về Express (port 3000)
        # Express tự xử lý cả API lẫn file tĩnh React
        location / {
            proxy_pass         http://127.0.0.1:3000;
            proxy_http_version 1.1;
            proxy_set_header   Host              $host;
            proxy_set_header   X-Real-IP         $remote_addr;
            proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
            proxy_set_header   X-Forwarded-Proto $scheme;
            proxy_set_header   Connection        "";
        }
    }
}
```

Áp dụng cấu hình:

```powershell
cd C:\nginx

# Kiểm tra syntax trước
.\nginx.exe -t
# Phải thấy: configuration file ... syntax is ok
#             configuration file ... test is successful

# Nếu Nginx chưa chạy: khởi động
.\nginx.exe

# Nếu Nginx đang chạy: reload (không gián đoạn)
.\nginx.exe -s reload
```

---

### Cấu hình Nginx tự khởi động cùng Windows

```powershell
# Chạy PowerShell với quyền Administrator
$action    = New-ScheduledTaskAction -Execute "C:\nginx\nginx.exe" -WorkingDirectory "C:\nginx"
$trigger   = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
$settings  = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 0)

Register-ScheduledTask `
    -TaskName  "Nginx-NOXH" `
    -Action    $action `
    -Trigger   $trigger `
    -Principal $principal `
    -Settings  $settings `
    -Force
```

---

## Kiểm tra sau khi deploy

Chạy lần lượt các lệnh sau để xác nhận hệ thống hoạt động đúng:

```powershell
# 1. PM2 đang chạy?
pm2 status
# → noxh-app phải là "online"

# 2. Nginx đang chạy?
tasklist | findstr nginx
# → phải thấy "nginx.exe"

# 3. API health check
Invoke-WebRequest "http://localhost:3000/api/health" | Select-Object -ExpandProperty Content
# → {"status":"ok"}

# 4. Database kết nối?
Invoke-WebRequest "http://localhost:3000/api/db-status" | Select-Object -ExpandProperty Content
# → {"connected":true, ...}

# 5. Trang web qua Nginx (port 80)
Invoke-WebRequest "http://localhost" -UseBasicParsing | Select-Object StatusCode, StatusDescription
# → StatusCode: 200

# 6. API qua Nginx
Invoke-WebRequest "http://localhost/api/health" | Select-Object -ExpandProperty Content
# → {"status":"ok"}

# 7. Mở trình duyệt kiểm tra giao diện
Start-Process "http://localhost"
```

---

## Quy trình cập nhật khi có code mới

### Dùng Cách 2 (thủ công)

```powershell
cd C:\www\noxh

# 1. Lấy code mới
git pull origin main

# 2. Cài dependencies mới (nếu package.json thay đổi)
npm install

# 3. Build lại
npm run build

# 4. Restart — không gián đoạn (PM2 tự xử lý)
pm2 restart noxh-app

# 5. Kiểm tra
pm2 status
pm2 logs noxh-app --lines 20
```

### Dùng Cách 3 (script tự động)

```powershell
cd "E:\OneDrive - ...\NOXH_ketnoiAPI"

# Chỉ 1 lệnh — tự test rồi deploy
.\ci_deploy.ps1 -Deploy -Target ssh
```

---

## Xử lý sự cố thường gặp

### 1. Port 80 bị chiếm — Nginx không khởi động được

```powershell
# Tìm process đang dùng port 80
netstat -ano | findstr ":80"

# Nếu là IIS (World Wide Web Publishing Service)
net stop w3svc
Set-Service -Name w3svc -StartupType Disabled

# Nếu là Skype hoặc app khác — tìm PID rồi kill
taskkill /PID <PID_từ_netstat> /F

# Sau đó khởi động lại Nginx
cd C:\nginx && .\nginx.exe
```

---

### 2. PM2 báo `errored` — app không khởi động được

```powershell
# Xem chi tiết lỗi
pm2 logs noxh-app --lines 50

# Nguyên nhân thường gặp và cách fix:

# Lỗi: Cannot find module 'dist/server.cjs'
# → Chưa build: chạy npm run build

# Lỗi: ECONNREFUSED — kết nối PostgreSQL thất bại
# → Kiểm tra DATABASE_URL trong .env
# → Kiểm tra PostgreSQL service đang chạy:
Get-Service postgresql*

# Lỗi: Port 3000 already in use
# → Có process khác dùng port 3000:
netstat -ano | findstr ":3000"
taskkill /PID <PID> /F

# Sau khi fix, restart:
pm2 restart noxh-app
```

---

### 3. Nginx báo `502 Bad Gateway`

Nghĩa là Nginx không kết nối được với Express (port 3000).

```powershell
# Kiểm tra PM2 có đang chạy không
pm2 status

# Nếu không chạy → start lại
pm2 start C:\www\noxh\dist\server.cjs --name "noxh-app"

# Nếu đang chạy mà vẫn 502 → xem log tìm crash
pm2 logs noxh-app --lines 30
```

---

### 4. Nginx báo `404 Not Found` khi vào trang

Kiểm tra Nginx config có proxy đúng chưa:

```powershell
# Xem config đang dùng
Get-Content C:\nginx\conf\nginx.conf

# Test config
cd C:\nginx && .\nginx.exe -t

# Nếu đúng rồi nhưng vẫn lỗi → reload
.\nginx.exe -s reload
```

---

### 5. Database `connected: false` — In-Memory mode

```powershell
# Kiểm tra file .env đúng chưa
Get-Content C:\www\noxh\.env

# Kiểm tra PostgreSQL service đang chạy
Get-Service postgresql*
# Nếu Stopped → Start lại:
Start-Service postgresql*

# Retry kết nối DB (không cần restart app)
Invoke-WebRequest "http://localhost:3000/api/db-status?retry=true"
```

---

### 6. Script `ci_deploy.ps1` bị lỗi "Execution Policy"

```powershell
# Chạy PowerShell với quyền Administrator
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Thử lại
.\ci_deploy.ps1
```

---

### 7. SCP/SSH lỗi khi deploy Target ssh

```powershell
# Kiểm tra SSH kết nối được không
ssh -p 22 deploy@123.45.67.89

# Nếu dùng key — kiểm tra key đúng chưa
ssh -i C:\Users\SonDH\.ssh\id_rsa deploy@123.45.67.89

# Nếu lần đầu kết nối — accept fingerprint (yes)
# Sau đó thêm vào .deploy.env đường dẫn key
```

---

## Lệnh PM2 hay dùng hàng ngày

```powershell
pm2 status                      # Xem trạng thái tất cả process
pm2 logs noxh-app               # Xem log realtime (Ctrl+C để thoát)
pm2 logs noxh-app --lines 50    # Xem 50 dòng log gần nhất
pm2 restart noxh-app            # Restart (áp dụng code mới, ~0 downtime)
pm2 reload noxh-app             # Graceful reload (0 downtime tuyệt đối)
pm2 stop noxh-app               # Dừng server
pm2 delete noxh-app             # Xóa khỏi PM2
pm2 monit                       # Dashboard giám sát CPU/RAM realtime
pm2 save                        # Lưu danh sách process (sau khi thêm/xóa)
```

## Lệnh Nginx hay dùng hàng ngày

```powershell
cd C:\nginx
.\nginx.exe              # Khởi động
.\nginx.exe -t           # Kiểm tra config hợp lệ
.\nginx.exe -s reload    # Reload config không gián đoạn
.\nginx.exe -s quit      # Dừng sau khi xong request hiện tại
.\nginx.exe -s stop      # Dừng ngay lập tức
tasklist | findstr nginx # Kiểm tra đang chạy chưa
```

---

*Cập nhật lần cuối: 16/06/2026 — NOXH v1.0*
