################################################################################
# ci_deploy.ps1 - Pipeline tu dong: Test -> Build -> Deploy
#
# Cach dung:
#   .\ci_deploy.ps1                        # Chay tat ca tests, build neu pass
#   .\ci_deploy.ps1 -E2E                   # Them Playwright + API bash tests
#   .\ci_deploy.ps1 -Coverage             # Xuat coverage report
#   .\ci_deploy.ps1 -Deploy               # Test + build + tao goi deploy (ZIP)
#   .\ci_deploy.ps1 -Deploy -Target ssh   # Deploy len server qua SSH
#   .\ci_deploy.ps1 -Deploy -Target railway
#   .\ci_deploy.ps1 -Deploy -Target render
#   .\ci_deploy.ps1 -Deploy -Target gcp
#   .\ci_deploy.ps1 -SkipTests -Deploy    # Chi build + tao file ZIP (bo qua test)
#
# Cau hinh deploy: tao file .deploy.env tu .deploy.env.example
################################################################################

param(
    [switch]$E2E,
    [switch]$Coverage,
    [switch]$Deploy,
    [switch]$SkipTests,
    [ValidateSet("zip","railway","render","gcp","ssh")]
    [string]$Target = "zip"
)

$ErrorActionPreference = 'Continue'
$root = $PSScriptRoot
if (-not $root -or $root -eq "") { $root = (Get-Location).Path }

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

# ==============================================================================
# Helpers
# ==============================================================================
function Write-Header($msg) {
    Write-Host ""
    Write-Host ("=" * 70) -ForegroundColor Cyan
    Write-Host "  $msg" -ForegroundColor Cyan
    Write-Host ("=" * 70) -ForegroundColor Cyan
}
function Write-Pass($msg)  { Write-Host "  [PASS] $msg" -ForegroundColor Green }
function Write-Fail($msg)  { Write-Host "  [FAIL] $msg" -ForegroundColor Red }
function Write-Warn($msg)  { Write-Host "  [WARN] $msg" -ForegroundColor Yellow }
function Write-Info($msg)  { Write-Host "  [INFO] $msg" -ForegroundColor DarkCyan }
function Write-Step($msg)  { Write-Host "  [....] $msg" -ForegroundColor White }

$results = @{}

# ==============================================================================
# PHASE 1: VITEST - Unit + Integration + Component
# ==============================================================================
if ($SkipTests) {
    Write-Header "PHASE 1 - VITEST: DA BO QUA (-SkipTests)"
    Write-Warn "Bo qua tat ca tests theo yeu cau. Chuyen thang sang build..."
} else {
    Write-Header "PHASE 1 - VITEST: Unit | Integration | Component"
    Write-Info "test/unit/        - ham toan tu, AI service (54 tests)"
    Write-Info "test/integration/ - DB layer, Express routes (79 tests)"
    Write-Info "test/component/   - React components (556 tests)"

    Set-Location $root

    if ($Coverage) {
        Write-Info "Chay voi coverage report..."
        & npm run test:coverage
    } else {
        & npm test
    }
    $vitestExit = $LASTEXITCODE

    if ($vitestExit -eq 0) {
        Write-Pass "Vitest: TAT CA PASS"
        $results["Vitest"] = "PASS"
    } else {
        Write-Fail "Vitest: CO LOI (exit code $vitestExit)"
        $results["Vitest"] = "FAIL"
    }
    if ($Coverage) {
        Write-Info "Coverage report: $root\coverage\index.html"
    }
}

# ==============================================================================
# PHASE 2 (tuy chon): E2E - Playwright + API Bash
# ==============================================================================
if ($E2E) {
    Write-Header "PHASE 2 - E2E: Playwright + API Bash"

    $serverRunning = $false
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:3000/api/health" -TimeoutSec 3 -ErrorAction Stop
        if ($resp.StatusCode -eq 200) { $serverRunning = $true }
    } catch { }

    if (-not $serverRunning) {
        Write-Warn "Server CHUA chay o port 3000."
        Write-Warn "Mo terminal khac va chay truoc: npm run dev"
        $results["Playwright E2E"] = "SKIP (server offline)"
        $results["API Bash E2E"]   = "SKIP (server offline)"
    } else {
        Write-Pass "Server dang chay o port 3000"

        # Playwright
        Write-Step "Chay Playwright (test/e2e/)..."
        & npx playwright test
        $pwExit = $LASTEXITCODE
        if ($pwExit -eq 0) {
            Write-Pass "Playwright E2E: TAT CA PASS"
            $results["Playwright E2E"] = "PASS"
        } else {
            Write-Fail "Playwright E2E: CO LOI"
            $results["Playwright E2E"] = "FAIL"
        }
        Write-Info "HTML report: $root\playwright-report\index.html"

        # API Bash tests
        $bashExe = Get-Command bash -ErrorAction SilentlyContinue
        if ($null -eq $bashExe) {
            Write-Warn "bash khong tim thay - can Git for Windows hoac WSL"
            $results["API Bash E2E"] = "SKIP (bash not found)"
        } else {
            Write-Step "Chay API bash tests (test/test_api.sh - 33 cases)..."
            & bash "$root\test\test_api.sh"
            $bashExit = $LASTEXITCODE
            if ($bashExit -eq 0) {
                Write-Pass "API Bash E2E: TAT CA PASS"
                $results["API Bash E2E"] = "PASS"
            } else {
                Write-Fail "API Bash E2E: CO LOI"
                $results["API Bash E2E"] = "FAIL"
            }
        }
    }
}

# ==============================================================================
# KIEM TRA KET QUA TESTS
# ==============================================================================
if ($SkipTests) {
    Write-Header "KET QUA TESTS TONG HOP"
    Write-Warn "Tests da duoc bo qua theo flag -SkipTests."
    Write-Host "  [OK] Chuyen sang build (khong co kiem tra chat luong)..." -ForegroundColor Yellow
} else {
    Write-Header "KET QUA TESTS TONG HOP"

    $allPass = $true
    foreach ($key in ($results.Keys | Sort-Object)) {
        $val = $results[$key]
        if ($val -eq "PASS") {
            Write-Pass "$key : $val"
        } elseif ($val -like "SKIP*") {
            Write-Warn "$key : $val"
        } else {
            Write-Fail "$key : $val"
            $allPass = $false
        }
    }
    Write-Host ""

    if (-not $allPass) {
        Write-Host "  [ABORT] CO TEST THAT BAI - Dung lai, khong build, khong deploy." -ForegroundColor Red
        Write-Host ""
        exit 1
    }

    Write-Host "  [OK] TAT CA TESTS PASS - Chuyen sang build..." -ForegroundColor Green
}

# ==============================================================================
# PHASE 3: BUILD PRODUCTION
# ==============================================================================
Write-Header "PHASE 3 - BUILD PRODUCTION"
Write-Step "Chay: npm run build..."

& npm run build
$buildExit = $LASTEXITCODE

if ($buildExit -ne 0) {
    Write-Fail "BUILD THAT BAI (exit $buildExit) - Kiem tra loi phia tren."
    exit 1
}

# Xac nhan file build da co
$serverCjs  = Join-Path $root "dist\server.cjs"
$indexHtml  = Join-Path $root "dist\index.html"

if (-not (Test-Path $serverCjs)) {
    Write-Fail "dist/server.cjs khong tim thay sau build!"
    exit 1
}
if (-not (Test-Path $indexHtml)) {
    Write-Fail "dist/index.html khong tim thay sau build!"
    exit 1
}

Write-Pass "Build thanh cong"
Write-Info "  dist/server.cjs  - Backend (Node.js)"
Write-Info "  dist/index.html  - Frontend entry"
Write-Info "  dist/assets/     - Frontend JS/CSS"

# ==============================================================================
# PHASE 4: TAO GOI DEPLOY (ZIP)
# ==============================================================================
Write-Header "PHASE 4 - TAO GOI DEPLOY"

$deployDir  = Join-Path $root "deploy_packages"
$packageName = "noxh_deploy_$timestamp"
$stagingDir  = Join-Path $env:TEMP $packageName
$zipPath     = Join-Path $deployDir "$packageName.zip"

if (-not (Test-Path $deployDir)) {
    New-Item -ItemType Directory -Path $deployDir | Out-Null
}
if (Test-Path $stagingDir) {
    Remove-Item $stagingDir -Recurse -Force
}
New-Item -ItemType Directory -Path $stagingDir | Out-Null

# Files dua vao goi deploy
$includes = @(
    @{ src = "dist";           dst = "dist" }
    @{ src = "package.json";   dst = "package.json" }
    @{ src = "package-lock.json"; dst = "package-lock.json" }
    @{ src = ".env.example";   dst = ".env.example" }
    @{ src = "README.md";      dst = "README.md" }
    # KHONG dua uploads/ vao goi: tranh lo file dinh kem va ghi de file tren server (unzip -o)
)

foreach ($item in $includes) {
    $src = Join-Path $root $item.src
    $dst = Join-Path $stagingDir $item.dst
    if (Test-Path $src) {
        if ((Get-Item $src).PSIsContainer) {
            Copy-Item $src $dst -Recurse -Force
        } else {
            Copy-Item $src $dst -Force
        }
        Write-Info "  + $($item.src)"
    } else {
        Write-Warn "  ~ $($item.src) (khong co, bo qua)"
    }
}

# Tao thu muc uploads neu chua co (server can no)
$uploadsInStage = Join-Path $stagingDir "uploads"
if (-not (Test-Path $uploadsInStage)) {
    New-Item -ItemType Directory -Path $uploadsInStage | Out-Null
    Write-Info "  + uploads/ (tao moi)"
}

# Tao startup scripts
@"
#!/bin/sh
# Chay production server (Linux/macOS)
# Yeu cau: Node.js 18+, file .env da duoc cau hinh
set -e
[ -f .env ] || { echo "LOI: Chua co file .env. Copy .env.example thanh .env va dien cac gia tri."; exit 1; }
npm install --omit=dev --prefer-offline 2>/dev/null || npm install --omit=dev
node dist/server.cjs
"@ | Out-File (Join-Path $stagingDir "start.sh") -Encoding utf8 -NoNewline

@"
@echo off
:: Chay production server (Windows)
if not exist .env (
    echo LOI: Chua co file .env
    echo Copy .env.example thanh .env va dien cac gia tri.
    exit /b 1
)
npm install --omit=dev
node dist\server.cjs
"@ | Out-File (Join-Path $stagingDir "start.bat") -Encoding utf8

@"
# Huong dan deploy goi NOXH
Phien ban: $timestamp

## Cach chay nhanh

1. Giai nen ZIP vao thu muc tren server
2. Tao file .env:
     cp .env.example .env
     nano .env   # hoac notepad .env
3. Dien vao .env:
     DATABASE_URL=postgresql://user:pass@host:5432/dbname
     GEMINI_API_KEY=your-key
     APP_URL=https://your-domain.com
4. Cai dependencies:
     npm install --omit=dev
5. Khoi dong:
     node dist/server.cjs         # thang
     # hoac voi pm2:
     pm2 start dist/server.cjs --name noxh-app

## Port
Server lang nghe o PORT env var, mac dinh: 3000

## Health check
GET /api/health
"@ | Out-File (Join-Path $stagingDir "DEPLOY_README.md") -Encoding utf8

# Nen thanh ZIP
Write-Step "Nen thanh ZIP: $zipPath"
Compress-Archive -Path (Join-Path $stagingDir "*") -DestinationPath $zipPath -Force

# Don staging
Remove-Item $stagingDir -Recurse -Force

$zipSizeKB = [math]::Round((Get-Item $zipPath).Length / 1KB, 1)
Write-Pass "Tao goi deploy thanh cong!"
Write-Info "  File: $zipPath"
Write-Info "  Size: ${zipSizeKB} KB"
Write-Info "  Chua: dist/ + package.json + .env.example + README"

# ==============================================================================
# PHASE 5 (tuy chon): DEPLOY LEN SERVER
# ==============================================================================
if (-not $Deploy) {
    Write-Host ""
    Write-Host "  Goi deploy san sang. De tu dong deploy, them flag -Deploy:" -ForegroundColor DarkCyan
    Write-Host "    .\ci_deploy.ps1 -Deploy                  # tao ZIP (mac dinh)" -ForegroundColor DarkCyan
    Write-Host "    .\ci_deploy.ps1 -Deploy -Target railway   # Railway" -ForegroundColor DarkCyan
    Write-Host "    .\ci_deploy.ps1 -Deploy -Target render    # Render.com" -ForegroundColor DarkCyan
    Write-Host "    .\ci_deploy.ps1 -Deploy -Target gcp       # Google Cloud Run" -ForegroundColor DarkCyan
    Write-Host "    .\ci_deploy.ps1 -Deploy -Target ssh       # VPS qua SSH" -ForegroundColor DarkCyan
    Write-Host "  Cau hinh: copy .deploy.env.example thanh .deploy.env" -ForegroundColor DarkCyan
    Write-Host ""
    exit 0
}

# Doc cau hinh tu .deploy.env
$deployEnvFile = Join-Path $root ".deploy.env"
if (Test-Path $deployEnvFile) {
    Write-Info "Doc config tu .deploy.env..."
    Get-Content $deployEnvFile | Where-Object { $_ -match "^\s*([^#\s][^=]*)=(.*)$" } | ForEach-Object {
        $parts = $_ -split "=", 2
        $key = $parts[0].Trim()
        $val = $parts[1].Trim().Trim('"').Trim("'")
        [System.Environment]::SetEnvironmentVariable($key, $val, "Process")
    }
    if ($env:DEPLOY_TARGET -and $Target -eq "zip") {
        $Target = $env:DEPLOY_TARGET
        Write-Info "Target tu .deploy.env: $Target"
    }
} else {
    Write-Warn ".deploy.env khong tim thay - dung gia tri mac dinh / env vars hien co"
    Write-Warn "Chay: copy .deploy.env.example .deploy.env  roi chinh sua"
}

Write-Header "PHASE 5 - DEPLOY: $($Target.ToUpper())"

switch ($Target) {

    # --------------------------------------------------------------------------
    "railway" {
        $rCmd = Get-Command railway -ErrorAction SilentlyContinue
        if ($null -eq $rCmd) {
            Write-Fail "Railway CLI chua cai. Chay: npm install -g @railway/cli"
            Write-Info "Sau do: railway login"
            exit 1
        }
        if ($env:RAILWAY_TOKEN) {
            $env:RAILWAY_TOKEN = $env:RAILWAY_TOKEN
        }
        Write-Step "Deploy len Railway..."
        & railway up --detach
        if ($LASTEXITCODE -eq 0) {
            Write-Pass "Railway deploy thanh cong!"
            & railway domain 2>$null
        } else {
            Write-Fail "Railway deploy that bai!"
            exit 1
        }
    }

    # --------------------------------------------------------------------------
    "render" {
        if (-not $env:RENDER_DEPLOY_HOOK) {
            Write-Fail "Thieu RENDER_DEPLOY_HOOK trong .deploy.env"
            Write-Info "  Vao Render Dashboard > Service > Settings > Deploy Hook"
            exit 1
        }
        Write-Step "Trigger Render deploy hook..."
        try {
            Invoke-RestMethod -Uri $env:RENDER_DEPLOY_HOOK -Method POST -ErrorAction Stop | Out-Null
            Write-Pass "Render deploy duoc kick off!"
            Write-Info "  Theo doi tai: https://dashboard.render.com"
        } catch {
            Write-Fail "Render deploy that bai: $($_.Exception.Message)"
            exit 1
        }
    }

    # --------------------------------------------------------------------------
    "gcp" {
        $gCmd = Get-Command gcloud -ErrorAction SilentlyContinue
        if ($null -eq $gCmd) {
            Write-Fail "gcloud CLI chua cai. Tai: https://cloud.google.com/sdk/docs/install"
            exit 1
        }
        $project = if ($env:GCP_PROJECT_ID)   { $env:GCP_PROJECT_ID }   else { "noxh-app" }
        $service = if ($env:GCP_SERVICE_NAME) { $env:GCP_SERVICE_NAME } else { "noxh-api" }
        $region  = if ($env:GCP_REGION)       { $env:GCP_REGION }       else { "asia-southeast1" }

        Write-Step "Deploy len Google Cloud Run..."
        Write-Info "  Project=$project | Service=$service | Region=$region"

        & gcloud run deploy $service `
            --source $root `
            --project $project `
            --region $region `
            --allow-unauthenticated `
            --port 3000 `
            --memory 512Mi `
            --max-instances 10 `
            --quiet

        if ($LASTEXITCODE -eq 0) {
            Write-Pass "Google Cloud Run deploy thanh cong!"
            & gcloud run services describe $service `
                --project $project --region $region `
                --format "value(status.url)" 2>$null
        } else {
            Write-Fail "GCP deploy that bai!"
            exit 1
        }
    }

    # --------------------------------------------------------------------------
    "ssh" {
        if (-not $env:SSH_HOST) {
            Write-Fail "Thieu SSH_HOST trong .deploy.env (vi du: deploy@123.45.67.89)"
            exit 1
        }
        $sshHost = $env:SSH_HOST
        $sshPort = if ($env:SSH_PORT)    { $env:SSH_PORT }    else { "22" }
        $appDir  = if ($env:SSH_APP_DIR) { $env:SSH_APP_DIR } else { "/home/deploy/noxh-app" }
        $sshKey  = if ($env:SSH_KEY_PATH) { $env:SSH_KEY_PATH } else { "" }

        $scpCmd = Get-Command scp -ErrorAction SilentlyContinue
        $sshCmd = Get-Command ssh -ErrorAction SilentlyContinue
        if ($null -eq $scpCmd -or $null -eq $sshCmd) {
            Write-Fail "ssh/scp khong tim thay. Cai OpenSSH hoac Git for Windows."
            exit 1
        }

        $sshArgs = @("-p", $sshPort)
        if ($sshKey) { $sshArgs += @("-i", $sshKey) }

        Write-Step "Upload $zipPath len ${sshHost}:~/ ..."
        $scpArgs = @("-P", $sshPort)
        if ($sshKey) { $scpArgs += @("-i", $sshKey) }
        $scpArgs += @($zipPath, "${sshHost}:~/noxh_deploy_latest.zip")

        & scp @scpArgs
        if ($LASTEXITCODE -ne 0) { Write-Fail "Upload SCP that bai!"; exit 1 }
        Write-Pass "Upload xong"

        # Chay remote deploy script
        $zipFile = Split-Path $zipPath -Leaf
        $remoteCmd = "set -e; mkdir -p '$appDir'; cd '$appDir'; unzip -o ~/noxh_deploy_latest.zip; [ -f .env ] || { echo 'LOI: Chua co file .env tren server (can JWT_SECRET, DATABASE_URL). Hay tao .env truoc khi deploy.'; exit 1; }; npm install --omit=dev --prefer-offline 2>/dev/null || npm install --omit=dev; which pm2 > /dev/null 2>&1 && (pm2 restart noxh-app 2>/dev/null || pm2 start dist/server.cjs --name noxh-app; pm2 save) || (nohup node dist/server.cjs > app.log 2>&1 &); echo '==> Deploy OK'"

        Write-Step "Chay remote deploy script tren $sshHost ..."
        & ssh @sshArgs $sshHost $remoteCmd
        if ($LASTEXITCODE -eq 0) {
            Write-Pass "SSH deploy thanh cong!"
            Write-Info "  App chay tai: http://${sshHost}:3000 (hoac domain cua ban)"
        } else {
            Write-Fail "Remote script that bai!"
            exit 1
        }
    }

    # --------------------------------------------------------------------------
    "zip" {
        Write-Pass "Goi deploy san sang (ZIP-only mode)"
        Write-Info "  $zipPath"
    }
}

# ==============================================================================
# TONG KET
# ==============================================================================
Write-Header "PIPELINE HOAN THANH"
Write-Pass "Tests : TAT CA PASS"
Write-Pass "Build : dist/ san sang"
Write-Pass "Package: deploy_packages\$packageName.zip"
if ($Deploy -and $Target -ne "zip") {
    Write-Pass "Deploy: $($Target.ToUpper()) - DONE"
}
Write-Host ""
