################################################################################
# run_all.ps1 - Chay toan bo test suite cho he thong NOXH
#
# Cau truc test:
#   test/unit/           - Unit tests (ham toan tu, AI service)
#   test/integration/    - Integration tests (DB layer, API routes mocked)
#   test/component/      - Component tests React (jsdom, Testing Library)
#   test/e2e/            - E2E tests Playwright (browser thuc, can server chay)
#   test/test_api.sh     - E2E API bash script (can server chay)
#
# Cach dung:
#   cd <root du an>
#   .\test\run_all.ps1            # chay unit + integration + component (106 tests)
#   .\test\run_all.ps1 -E2E       # them E2E Playwright + test_api.sh (can npm run dev)
#   .\test\run_all.ps1 -Coverage  # xuat coverage report vao coverage/
################################################################################

param(
    [switch]$E2E,
    [switch]$Coverage
)

$ErrorActionPreference = 'Continue'
$root = Split-Path $PSScriptRoot -Parent

function Write-Header($msg) {
    Write-Host ""
    Write-Host "======================================================" -ForegroundColor Cyan
    Write-Host "  $msg" -ForegroundColor Cyan
    Write-Host "======================================================" -ForegroundColor Cyan
}
function Write-Pass($msg)  { Write-Host "  [PASS] $msg" -ForegroundColor Green }
function Write-Fail($msg)  { Write-Host "  [FAIL] $msg" -ForegroundColor Red }
function Write-Warn($msg)  { Write-Host "  [WARN] $msg" -ForegroundColor Yellow }
function Write-Info($msg)  { Write-Host "  [INFO] $msg" -ForegroundColor DarkCyan }

$results = @{}

# ==============================================================================
# BUOC 1-3: Vitest (Unit + Integration + Component)
# ==============================================================================
Write-Header "VITEST - Unit | Integration | Component Tests"
Write-Info "  test/unit/        - ham toan tu, AI service"
Write-Info "  test/integration/ - DB layer, Express routes (mocked)"
Write-Info "  test/component/   - React components (Login, Dashboard)"

Set-Location $root

if ($Coverage) {
    Write-Info "Chay voi coverage report..."
    $vitestOutput = & npm run test:coverage 2>&1
} else {
    $vitestOutput = & npm test 2>&1
}

$vitestOutput | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) {
    Write-Pass "Vitest: TAT CA PASS"
    $results["Vitest"] = "PASS"
} else {
    Write-Fail "Vitest: CO LOI - xem output o tren"
    $results["Vitest"] = "FAIL"
}

if ($Coverage) {
    Write-Info "Coverage report: $root\coverage\index.html"
}

# ==============================================================================
# BUOC 4+5: E2E tests (Playwright + test_api.sh) - tuy chon
# ==============================================================================
if ($E2E) {

    # --- Kiem tra server ---
    Write-Header "KIEM TRA SERVER"
    $serverRunning = $false
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:3000/api/health" -TimeoutSec 3 -ErrorAction Stop
        if ($resp.StatusCode -eq 200) { $serverRunning = $true }
    } catch {
        $serverRunning = $false
    }

    if (-not $serverRunning) {
        Write-Warn "Server KHONG chay o port 3000."
        Write-Warn "Mo terminal khac va chay: npm run dev"
        Write-Warn "Sau do chay lai: .\test\run_all.ps1 -E2E"
        $results["Playwright E2E"] = "SKIP (server offline)"
        $results["API E2E (bash)"] = "SKIP (server offline)"
    } else {
        Write-Pass "Server dang chay o port 3000"

        # --- Playwright ---
        Write-Header "PLAYWRIGHT E2E - test/e2e/ (browser thuc)"
        Write-Info "  test/e2e/auth.spec.ts     - dang nhap"
        Write-Info "  test/e2e/projects.spec.ts - du an, API data len UI"

        $playwrightOutput = & npx playwright test 2>&1
        $playwrightOutput | ForEach-Object { Write-Host $_ }

        if ($LASTEXITCODE -eq 0) {
            Write-Pass "Playwright: TAT CA PASS"
            $results["Playwright E2E"] = "PASS"
        } else {
            Write-Fail "Playwright: CO LOI"
            $results["Playwright E2E"] = "FAIL"
        }
        Write-Info "HTML report: $root\playwright-report\index.html"

        # --- test_api.sh ---
        Write-Header "API E2E (bash) - test/test_api.sh (33 test cases HTTP)"

        $bashCmd = Get-Command bash -ErrorAction SilentlyContinue
        if ($bashCmd -eq $null) {
            Write-Warn "bash khong tim thay. Hay cai Git for Windows."
            $results["API E2E (bash)"] = "SKIP (bash not found)"
        } else {
            & bash "$PSScriptRoot\test_api.sh" 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Pass "API E2E: TAT CA PASS"
                $results["API E2E (bash)"] = "PASS"
            } else {
                Write-Fail "API E2E: CO LOI"
                $results["API E2E (bash)"] = "FAIL"
            }
        }
    }
}

# ==============================================================================
# KET QUA TONG HOP
# ==============================================================================
Write-Header "KET QUA TONG HOP"

$allPass = $true
foreach ($key in $results.Keys) {
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
if ($allPass) {
    Write-Host "  KET LUAN: [OK] TAT CA TESTS DEU PASS" -ForegroundColor Green
} else {
    Write-Host "  KET LUAN: [!!] CO TEST THAT BAI" -ForegroundColor Red
}

if (-not $E2E) {
    Write-Host ""
    Write-Host "  Them flag -E2E de chay Playwright + API bash tests:" -ForegroundColor DarkCyan
    Write-Host "    .\test\run_all.ps1 -E2E   (can npm run dev truoc)" -ForegroundColor DarkCyan
}
Write-Host ""
