# sync-from-demo.ps1
# Dong bo thay doi tu NOXH_demo vao NOXH_ketnoiAPI voi 3-way merge
#
# Cach hoat dong:
#   - .sync-base/  = ban chup anh lan sync truoc (lam "to tien chung")
#   - Chi demo doi  -> copy thang vao goc
#   - Chi goc doi   -> giu nguyen goc (khong ghi de)
#   - Ca hai cung doi -> CONFLICT -> hien diff, hoi nguoi dung chon
#
# Usage:
#   .\scripts\sync-from-demo.ps1              # Sync voi merge
#   .\scripts\sync-from-demo.ps1 -DryRun      # Chi xem diff, khong copy
#   .\scripts\sync-from-demo.ps1 -SkipTest    # Khong chay npm test
#   .\scripts\sync-from-demo.ps1 -Force       # Tu dong chon Demo khi conflict

param(
    [switch]$DryRun,
    [switch]$SkipTest,
    [switch]$Force
)

# --- Duong dan ---
$scriptDir = Split-Path $PSScriptRoot -Parent
$ROOT_DIR  = $scriptDir
$DEMO_DIR  = Join-Path (Split-Path $scriptDir -Parent) "NOXH_demo"
$BASE_DIR  = Join-Path $ROOT_DIR ".sync-base"   # ban chup anh lan sync truoc

$EXCLUDE_DIRS = @(
    "node_modules","dist","coverage","playwright-report",
    "test-results","deploy_packages",".git","uploads",
    "test",".sync-base","scripts"
)
$EXCLUDE_FILES = @(".env",".env.local",".deploy.env","package-lock.json","package.json")

function Should-Exclude($rel) {
    $parts = $rel -split '[/\\]'
    foreach ($d in $EXCLUDE_DIRS) { if ($parts -contains $d) { return $true } }
    $fn = Split-Path $rel -Leaf
    foreach ($f in $EXCLUDE_FILES) { if ($fn -eq $f) { return $true } }
    return $false
}

function Get-MD5($path) {
    if (-not (Test-Path $path)) { return $null }
    return (Get-FileHash $path -Algorithm MD5).Hash
}

function Show-Diff($label1, $file1, $label2, $file2) {
    # Hien thi diff giua 2 file dung git diff --no-index
    Write-Host ""
    Write-Host "  ====== DIFF: $label1  vs  $label2 ======" -ForegroundColor Magenta
    $diffOut = & git diff --no-index --unified=4 $file1 $file2 2>&1
    if ($LASTEXITCODE -ne 0 -and $diffOut) {
        # git diff in ra: dong - la file1, dong + la file2
        foreach ($line in $diffOut) {
            if ($line -match '^\+\+\+|^---') {
                Write-Host "  $line" -ForegroundColor Gray
            } elseif ($line -match '^\+') {
                Write-Host "  $line" -ForegroundColor Green
            } elseif ($line -match '^-') {
                Write-Host "  $line" -ForegroundColor Red
            } elseif ($line -match '^@@') {
                Write-Host "  $line" -ForegroundColor Cyan
            } else {
                Write-Host "  $line" -ForegroundColor DarkGray
            }
        }
    } else {
        Write-Host "  (khong the hien thi diff - git chua duoc cai)" -ForegroundColor Gray
    }
    Write-Host ""
}

function Ask-ConflictChoice($relPath) {
    Write-Host ""
    Write-Host "  Chon hanh dong cho file nay:" -ForegroundColor White
    Write-Host "  [D] Dung ban DEMO   (ghi de len source goc)" -ForegroundColor Green
    Write-Host "  [G] Giu ban GOC     (bo qua thay doi tu demo)" -ForegroundColor Yellow
    Write-Host "  [M] Mo ca 2 file    (tu merge bang tay)" -ForegroundColor Cyan
    Write-Host "  [S] Bo qua (skip)   (xu ly sau)" -ForegroundColor Gray

    while ($true) {
        Write-Host "  > Chon [D/G/M/S]: " -NoNewline -ForegroundColor White
        $choice = [System.Console]::ReadLine()
        switch ($choice.ToUpper()) {
            'D' { return 'demo' }
            'G' { return 'root' }
            'M' { return 'manual' }
            'S' { return 'skip' }
            default { Write-Host "  Nhap D, G, M hoac S" -ForegroundColor Red }
        }
    }
}

# ============================================================
Write-Host ""
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  SYNC: NOXH_demo -> NOXH_ketnoiAPI  (3-way merge)" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

if (-not (Test-Path $DEMO_DIR)) {
    Write-Host "[LOI] Khong tim thay: $DEMO_DIR" -ForegroundColor Red; exit 1
}
if ($DryRun) {
    Write-Host "[DRY RUN] Chi xem ket qua, khong thay doi file nao" -ForegroundColor Yellow
}

$hasBase = Test-Path $BASE_DIR
if (-not $hasBase) {
    Write-Host "[INFO] Lan dau chay - chua co .sync-base" -ForegroundColor Yellow
    Write-Host "       Lan nay se coi tat ca file demo la 'moi', copy thang vao goc." -ForegroundColor Gray
    Write-Host "       Tu lan sau moi co the phat hien conflict." -ForegroundColor Gray
}

Write-Host "  Demo : $DEMO_DIR" -ForegroundColor Gray
Write-Host "  Goc  : $ROOT_DIR" -ForegroundColor Gray
Write-Host "  Base : $BASE_DIR" -ForegroundColor Gray
Write-Host ""

# --- Quet tat ca file tu demo ---
$demoFiles = Get-ChildItem -Path $DEMO_DIR -Recurse -File |
    Where-Object { -not (Should-Exclude ($_.FullName.Substring($DEMO_DIR.Length + 1))) }

# --- Phan loai tung file ---
$onlyDemoChanged  = New-Object System.Collections.Generic.List[string]  # chi demo doi
$onlyRootChanged  = New-Object System.Collections.Generic.List[string]  # chi goc doi
$bothChanged      = New-Object System.Collections.Generic.List[string]  # ca hai doi
$newInDemo        = New-Object System.Collections.Generic.List[string]  # file moi o demo
$unchanged        = 0

foreach ($df in $demoFiles) {
    $rel      = $df.FullName.Substring($DEMO_DIR.Length + 1)
    $rootFile = Join-Path $ROOT_DIR $rel
    $baseFile = Join-Path $BASE_DIR $rel

    $demoHash = Get-MD5 $df.FullName
    $rootHash = Get-MD5 $rootFile
    $baseHash = Get-MD5 $baseFile

    if ($rootHash -eq $null) {
        # File chua co o source goc -> file moi tu demo
        $newInDemo.Add($rel)
    } elseif ($baseHash -eq $null) {
        # Chua co base (lan dau sync) -> coi nhu chi demo doi
        if ($demoHash -ne $rootHash) { $onlyDemoChanged.Add($rel) }
        else { $unchanged++ }
    } else {
        $demoChanged = ($demoHash -ne $baseHash)
        $rootChanged = ($rootHash -ne $baseHash)

        if (-not $demoChanged -and -not $rootChanged) {
            $unchanged++
        } elseif ($demoChanged -and -not $rootChanged) {
            $onlyDemoChanged.Add($rel)
        } elseif (-not $demoChanged -and $rootChanged) {
            $onlyRootChanged.Add($rel)
        } else {
            # Ca hai cung thay doi so voi base -> CONFLICT
            $bothChanged.Add($rel)
        }
    }
}

# --- Tong ket ---
$totalAction = $onlyDemoChanged.Count + $newInDemo.Count + $bothChanged.Count
Write-Host "-- Ket qua phan tich ---------------------------------------------------" -ForegroundColor Cyan
Write-Host "   Khong thay doi             : $unchanged file" -ForegroundColor Gray
Write-Host "   Chi DEMO doi   -> copy vao : $($onlyDemoChanged.Count) file" -ForegroundColor Green
Write-Host "   Chi GOC doi    -> giu nguyen: $($onlyRootChanged.Count) file" -ForegroundColor Yellow
Write-Host "   CA HAI cung doi -> CONFLICT : $($bothChanged.Count) file" -ForegroundColor Red
Write-Host "   File moi tu demo            : $($newInDemo.Count) file" -ForegroundColor Green
Write-Host ""

# --- Hien thi chi tiet ---
if ($onlyDemoChanged.Count -gt 0) {
    Write-Host "-- Chi DEMO thay doi (se copy thang vao goc) ---------------------------" -ForegroundColor Green
    foreach ($f in $onlyDemoChanged) { Write-Host "   + $f" -ForegroundColor Green }
    Write-Host ""
}

if ($onlyRootChanged.Count -gt 0) {
    Write-Host "-- Chi GOC thay doi (giu nguyen, khong ghi de) -------------------------" -ForegroundColor Yellow
    foreach ($f in $onlyRootChanged) { Write-Host "   ~ $f" -ForegroundColor Yellow }
    Write-Host ""
}

if ($newInDemo.Count -gt 0) {
    Write-Host "-- File moi tu Demo (se them vao goc) ----------------------------------" -ForegroundColor Green
    foreach ($f in $newInDemo) { Write-Host "   * $f" -ForegroundColor Green }
    Write-Host ""
}

if ($bothChanged.Count -gt 0) {
    Write-Host "-- CONFLICT: Ca hai noi cung sua (can xu ly) ---------------------------" -ForegroundColor Red
    foreach ($f in $bothChanged) { Write-Host "   ! $f" -ForegroundColor Red }
    Write-Host ""
}

if ($totalAction -eq 0 -and $bothChanged.Count -eq 0) {
    Write-Host "[OK] Khong co gi can sync. Source goc dang moi nhat." -ForegroundColor Green
    exit 0
}

if ($DryRun) {
    Write-Host "[DRY RUN] Dung tai day. Bo flag -DryRun de thuc hien." -ForegroundColor Yellow
    exit 0
}

# --- Xac nhan tong the ---
Write-Host "Bat dau xu ly $totalAction file..." -ForegroundColor Cyan

# --- Backup truoc khi lam gi ---
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupDir = Join-Path $ROOT_DIR ".sync-backup\$timestamp"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

$filesToBackup = @($onlyDemoChanged) + @($bothChanged) + @($newInDemo)
foreach ($f in $filesToBackup) {
    $rootFile = Join-Path $ROOT_DIR $f
    if (Test-Path $rootFile) {
        $bk = Join-Path $backupDir $f
        New-Item -ItemType Directory -Force -Path (Split-Path $bk -Parent) | Out-Null
        Copy-Item $rootFile $bk
    }
}
Write-Host "[OK] Da backup $($filesToBackup.Count) file vao .sync-backup\$timestamp" -ForegroundColor Gray
Write-Host ""

# --- Xu ly CONFLICT truoc (can quyet dinh cua nguoi dung) ---
$conflictDecisions = @{}   # rel -> 'demo' | 'root' | 'skip'
$manualFiles       = @()

if ($bothChanged.Count -gt 0) {
    Write-Host "======================================================================" -ForegroundColor Red
    Write-Host "  XU LY CONFLICT ($($bothChanged.Count) file)" -ForegroundColor Red
    Write-Host "======================================================================" -ForegroundColor Red

    foreach ($rel in $bothChanged) {
        $demoFile = Join-Path $DEMO_DIR $rel
        $rootFile = Join-Path $ROOT_DIR $rel
        $baseFile = Join-Path $BASE_DIR $rel

        Write-Host ""
        Write-Host "  FILE: $rel" -ForegroundColor White
        Write-Host "  ----------------------------------------------------------" -ForegroundColor DarkGray

        # Hien diff Demo vs Goc
        Write-Host ""
        Write-Host "  [DEMO vs GOC] Nhung gi khac nhau:" -ForegroundColor Magenta
        Show-Diff "DEMO" $rootFile "DEMO" $demoFile

        if ($Force) {
            Write-Host "  [-Force] Tu dong chon: DEMO" -ForegroundColor Green
            $conflictDecisions[$rel] = 'demo'
        } else {
            $choice = Ask-ConflictChoice $rel
            $conflictDecisions[$rel] = $choice
            if ($choice -eq 'manual') {
                $manualFiles += $rel
                Write-Host "  [MANUAL] Se mo ca 2 file sau khi xu ly xong..." -ForegroundColor Cyan
            }
        }
    }
}

# --- Thuc hien copy ---
Write-Host ""
Write-Host "-- Dang ap dung thay doi..." -ForegroundColor Cyan

$copied   = 0
$skipped  = 0
$errored  = 0

# 1. Chi Demo doi -> copy thang
foreach ($rel in @($onlyDemoChanged) + @($newInDemo)) {
    $src  = Join-Path $DEMO_DIR $rel
    $dest = Join-Path $ROOT_DIR $rel
    try {
        New-Item -ItemType Directory -Force -Path (Split-Path $dest -Parent) | Out-Null
        Copy-Item $src $dest -Force
        Write-Host "   COPY  $rel" -ForegroundColor Green
        $copied++
    } catch {
        Write-Host "   ERR   $rel - $_" -ForegroundColor Red
        $errored++
    }
}

# 2. Ca hai doi -> theo quyet dinh
foreach ($rel in $bothChanged) {
    $decision = $conflictDecisions[$rel]
    $src  = Join-Path $DEMO_DIR $rel
    $dest = Join-Path $ROOT_DIR $rel

    switch ($decision) {
        'demo' {
            try {
                Copy-Item $src $dest -Force
                Write-Host "   DEMO  $rel  (ghi de bang ban demo)" -ForegroundColor Green
                $copied++
            } catch {
                Write-Host "   ERR   $rel - $_" -ForegroundColor Red; $errored++
            }
        }
        'root' {
            Write-Host "   GOC   $rel  (giu nguyen ban goc)" -ForegroundColor Yellow
            $skipped++
        }
        'skip' {
            Write-Host "   SKIP  $rel  (xu ly sau)" -ForegroundColor Gray
            $skipped++
        }
        'manual' {
            Write-Host "   OPEN  $rel  (se mo de merge tay)" -ForegroundColor Cyan
            $skipped++
        }
    }
}

Write-Host ""
Write-Host "   Ket qua: $copied copy, $skipped bo qua, $errored loi" -ForegroundColor White

# --- Mo file manual de merge tay ---
if ($manualFiles.Count -gt 0) {
    Write-Host ""
    Write-Host "-- Mo cac file can merge tay --" -ForegroundColor Cyan
    foreach ($rel in $manualFiles) {
        $demoFile = Join-Path $DEMO_DIR $rel
        $rootFile = Join-Path $ROOT_DIR $rel
        Write-Host "  Demo: $demoFile" -ForegroundColor Green
        Write-Host "  Goc : $rootFile" -ForegroundColor Yellow
        # Mo bang Notepad hoac VS Code neu co
        if (Get-Command "code" -ErrorAction SilentlyContinue) {
            & code --diff $rootFile $demoFile
        } else {
            Start-Process notepad $demoFile
            Start-Process notepad $rootFile
        }
    }
}

# --- Cap nhat .sync-base (chup anh trang thai moi) ---
Write-Host ""
Write-Host "-- Cap nhat .sync-base (chup anh trang thai hien tai)..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $BASE_DIR | Out-Null

$allDemoFiles = Get-ChildItem -Path $DEMO_DIR -Recurse -File |
    Where-Object { -not (Should-Exclude ($_.FullName.Substring($DEMO_DIR.Length + 1))) }

foreach ($df in $allDemoFiles) {
    $rel      = $df.FullName.Substring($DEMO_DIR.Length + 1)
    $baseFile = Join-Path $BASE_DIR $rel
    New-Item -ItemType Directory -Force -Path (Split-Path $baseFile -Parent) | Out-Null
    Copy-Item $df.FullName $baseFile -Force
}
Write-Host "   [OK] Da cap nhat .sync-base" -ForegroundColor Gray

# --- Chay npm test ---
if (-not $SkipTest -and $copied -gt 0) {
    Write-Host ""
    Write-Host "-- Chay npm test..." -ForegroundColor Cyan
    $testResult = & npm test --prefix $ROOT_DIR 2>&1
    $testExit = $LASTEXITCODE
    $testResult | Select-Object -Last 8 | ForEach-Object { Write-Host $_ }

    if ($testExit -eq 0) {
        Write-Host "[PASS] npm test - Tat ca pass!" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] npm test that bai!" -ForegroundColor Red
        Write-Host "[GOI Y] Rollback: Copy-Item '$backupDir\*' '$ROOT_DIR\' -Recurse -Force" -ForegroundColor Yellow
    }
}

# --- Huong dan buoc tiep ---
$srcChanged = (@($onlyDemoChanged) + @($newInDemo) + @($bothChanged | Where-Object { $conflictDecisions[$_] -eq 'demo' })) |
    Where-Object { $_ -match '^src[/\\]' -or $_ -eq 'server.ts' -or $_ -match '^server[/\\]' }

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  SYNC HOAN TAT" -ForegroundColor Cyan
Write-Host "======================================================================"  -ForegroundColor Cyan

if ($srcChanged.Count -gt 0) {
    Write-Host ""
    Write-Host "File src/ da thay doi - can cap nhat test:" -ForegroundColor White
    foreach ($f in $srcChanged) { Write-Host "   $f" -ForegroundColor Cyan }

    # --- Ghi file .sync-pending-tests.md de Claude doc ---
    $pendingFile = Join-Path $ROOT_DIR ".sync-pending-tests.md"
    $dateStr3 = Get-Date -Format "yyyy-MM-dd HH:mm"
    $pendingContent = @"
# PENDING TEST UPDATE

> File nay duoc tao tu dong boi sync-from-demo.ps1
> Claude se doc file nay de biet can kiem tra va bo sung test gi

## Thoi gian sync: $dateStr3

## File da thay doi (can kiem tra test):
"@
    foreach ($f in $srcChanged) {
        $pendingContent += "`n- $f"
    }
    $pendingContent += @"

## Huong dan cho Claude:
1. Doc tung file trong danh sach tren
2. So sanh voi test hien tai trong test/integration/ va test/component/
3. Phat hien logic moi, route moi, phan quyen moi chua co test
4. Bo sung test case con thieu
5. Xoa file nay sau khi hoan thanh

## Trang thai: PENDING
"@
    Set-Content $pendingFile $pendingContent -Encoding UTF8
    Write-Host ""
    Write-Host "  [OK] Da ghi .sync-pending-tests.md" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Noi voi Claude Code:" -ForegroundColor Yellow
    Write-Host "  'vua merge xong, check va bo sung test'" -ForegroundColor Green
}

Write-Host ""
Write-Host "  Backup luu tai: $backupDir" -ForegroundColor Gray
Write-Host ""

# --- Ghi CHANGELOG.md ---
$changelogFile = Join-Path $ROOT_DIR "CHANGELOG.md"
if (Test-Path $changelogFile) {
    $dateStr     = Get-Date -Format "yyyy-MM-dd HH:mm"
    $copiedFiles = (@($onlyDemoChanged) + @($newInDemo)) -join "`n- "
    $conflictLines = ""
    foreach ($rel in $bothChanged) {
        $dec = $conflictDecisions[$rel]
        $conflictLines += "`n- $rel  [chon: $dec]"
    }
    $testStatus = if ($SkipTest) { "skip" } elseif ($testExit -eq 0) { "PASS" } else { "FAIL" }

    $newEntry = @"

## [$dateStr] - Sync tu Demo

**Ket qua:** Copy $copied file | Bo qua $skipped | Conflict $($bothChanged.Count) | Loi $errored | Test: $testStatus

"@
    if ($copiedFiles) {
        $newEntry += "### File da copy:`n- $copiedFiles`n"
    }
    if ($conflictLines) {
        $newEntry += "### Conflict da xu ly:$conflictLines`n"
    }
    if ($onlyRootChanged.Count -gt 0) {
        $keepLines = ($onlyRootChanged) -join "`n- "
        $newEntry += "### File giu nguyen (chi Goc sua):`n- $keepLines`n"
    }

    # Chen vao sau dong marker trong CHANGELOG
    $changelogContent = Get-Content $changelogFile -Raw
    $marker = "<!-- TU DONG THEM VAO DAY BOI sync-from-demo.ps1 - MOI NHAT O TREN -->"
    $changelogContent = $changelogContent -replace [regex]::Escape($marker), ($marker + $newEntry)
    Set-Content $changelogFile $changelogContent -Encoding UTF8
    Write-Host "  [OK] Da cap nhat CHANGELOG.md" -ForegroundColor Gray
}

# --- Ghi dong sync gan nhat vao CONTEXT.md ---
$contextFile = Join-Path $ROOT_DIR "CONTEXT.md"
if (Test-Path $contextFile) {
    $dateStr2   = Get-Date -Format "yyyy-MM-dd HH:mm"
    $newSyncLine = "- **$dateStr2** | Sync | Copy: $copied file | Conflict: $($bothChanged.Count) | Test: $testStatus"
    $contextContent = Get-Content $contextFile -Raw
    $ctxMarker = "<!-- TU DONG CAP NHAT BOI scripts/sync-from-demo.ps1 - KHONG SUA TAY PHAN NAY -->"
    $contextContent = $contextContent -replace [regex]::Escape($ctxMarker), ($ctxMarker + "`n" + $newSyncLine)
    Set-Content $contextFile $contextContent -Encoding UTF8
    Write-Host "  [OK] Da cap nhat CONTEXT.md" -ForegroundColor Gray
}
