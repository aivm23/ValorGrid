<#
.SYNOPSIS
  Ejecuta un SQL versionado de ValorGrid tras crear backup automatico.

.DESCRIPTION
  Script portable y reutilizable para aplicar migraciones de schema manuales
  (deploy/sql/update-X-to-Y.sql) en la base de datos activa de ValorGrid.

  Puede auto-detectar la DB activa (entorno Node o rutas canonicas) o recibir
  paths explicitos. Sirve tanto para desarrollo local como para instalaciones
  Windows (Electron desktop).

.PARAMETER SqlPath
  Ruta al archivo SQL a ejecutar (obligatorio).

.PARAMETER SqliteExe
  Ruta a sqlite3.exe. Si se omite, se busca en:
    - C:\tools\sqlite\sqlite3.exe
    - PATH
    - C:\ProgramData\chocolatey\bin\sqlite3.exe

.PARAMETER DbPath
  Ruta a la DB de ValorGrid. Si se omite, se auto-detecta:
    1. Variable PORTFOLIO_DB_PATH
    2. local/valorgrid/data/portfolio.sqlite (canonica)
    3. portfolio.sqlite (legacy raiz)
    4. data/portfolio.sqlite (legacy)

.PARAMETER AppRoot
  Directorio raiz del proyecto. Por defecto: directorio padre de este script.

.PARAMETER BackupDir
  Directorio donde se guarda el backup.

.PARAMETER Confirm
  Ejecutar sin confirmacion interactiva (util para scripts padres).

.PARAMETER DryRun
  Simula la operacion sin modificar la DB.

.EXAMPLE
  .\scripts\run-sql-migration.ps1 -SqlPath deploy/sql/update-3.15.0-to-3.16.0.sql

.EXAMPLE
  .\scripts\run-sql-migration.ps1 -SqlPath "C:\ValorGrid\deploy\sql\update-3.15.0-to-3.16.0.sql" -DbPath "C:\ValorGridData\portfolio.sqlite" -SqliteExe "C:\tools\sqlite\sqlite3.exe"

.EXAMPLE
  .\scripts\run-sql-migration.ps1 -SqlPath deploy/sql/update-3.15.0-to-3.16.0.sql -DryRun

.NOTES
  Compatibilidad: Windows PowerShell 5.1
  Requiere: sqlite3.exe (https://sqlite.org/download.html)
  Repositorio: https://github.com/aivm23/ValorGrid
#>

param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
  [string]$SqlPath,

  [string]$SqliteExe,

  [string]$DbPath,

  [string]$AppRoot,

  [string]$BackupDir,

  [switch]$Confirm,

  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

# ── 1. Resolver AppRoot ────────────────────────────────────────────────────
if (-not $AppRoot) {
  $scriptDir = Split-Path -Parent $PSCommandPath
  $AppRoot = Resolve-Path (Join-Path $scriptDir '..')
}
Write-Host "[INFO] AppRoot:  $AppRoot"

# ── 2. Resolver sqlite3.exe ────────────────────────────────────────────────
function Find-Sqlite3 {
  param([string]$Explicit)

  if ($Explicit -and (Test-Path -LiteralPath $Explicit -PathType Leaf)) {
    return (Resolve-Path -LiteralPath $Explicit).Path
  }

  # Buscar en PATH
  $inPath = (Get-Command 'sqlite3' -ErrorAction SilentlyContinue).Source
  if ($inPath) { return $inPath }

  $candidates = @(
    'C:\tools\sqlite\sqlite3.exe'
    'C:\ProgramData\chocolatey\bin\sqlite3.exe'
  )
  foreach ($cand in $candidates) {
    if (Test-Path -LiteralPath $cand -PathType Leaf) {
      return (Resolve-Path -LiteralPath $cand).Path
    }
  }
  return $null
}

$sqlite = Find-Sqlite3 -Explicit $SqliteExe
if (-not $sqlite) {
  Write-Host "[ERROR] No se encontro sqlite3.exe." -ForegroundColor Red
  Write-Host "        Descargalo desde https://sqlite.org/download.html" -ForegroundColor Yellow
  Write-Host "        e indica la ruta con -SqliteExe, o anadelo al PATH." -ForegroundColor Yellow
  exit 1
}
Write-Host "[INFO] sqlite3:  $sqlite"

# ── 3. Resolver DB activa ──────────────────────────────────────────────────
if (-not $DbPath) {
  if ($env:PORTFOLIO_DB_PATH) {
    $DbPath = $env:PORTFOLIO_DB_PATH
    Write-Host "[INFO] DB detectada desde PORTFOLIO_DB_PATH"
  }

  # Intentar resolver via Node config (requiere node en PATH)
  if (-not $DbPath) {
    $configJs = Join-Path $AppRoot 'apps\server\src\platform\config.js'
    if ((Get-Command 'node' -ErrorAction SilentlyContinue) -and (Test-Path -LiteralPath $configJs -PathType Leaf)) {
      try {
        $resolved = & node -e @"
var c = require('$((Resolve-Path -LiteralPath $configJs).Path.Replace('\','\\'))').createConfig(process.env, '$($AppRoot.Replace('\','\\'))');
process.stdout.write(c.dbPath);
"@ 2>$null
        if ($LASTEXITCODE -eq 0 -and $resolved) {
          $DbPath = $resolved
          Write-Host "[INFO] DB detectada desde config.js: $DbPath"
        }
      } catch { }
    }
  }

  # Fallback a rutas canonicas
  if (-not $DbPath) {
    $candidates = @(
      (Join-Path $AppRoot 'local\valorgrid\data\portfolio.sqlite'),
      (Join-Path $AppRoot 'portfolio.sqlite'),
      (Join-Path $AppRoot 'data\portfolio.sqlite')
    )
    foreach ($cand in $candidates) {
      if (Test-Path -LiteralPath $cand -PathType Leaf) {
        $DbPath = (Resolve-Path -LiteralPath $cand).Path
        Write-Host "[INFO] DB detectada desde ruta canonica"
        break
      }
    }
  }
}

if (-not $DbPath -or -not (Test-Path -LiteralPath $DbPath -PathType Leaf)) {
  Write-Host "[ERROR] No se encontro la base de datos activa." -ForegroundColor Red
  Write-Host "        Indica la ruta con -DbPath o ejecuta desde el directorio raiz de ValorGrid." -ForegroundColor Yellow
  exit 1
}
Write-Host "[INFO] DB path:  $DbPath"

# ── 4. Resolver BackupDir ──────────────────────────────────────────────────
if (-not $BackupDir) {
  $dbParent = Split-Path -Parent $DbPath
  $backupsAlongside = Join-Path (Split-Path -Parent $dbParent) 'backups'
  if (Test-Path -LiteralPath $backupsAlongside -PathType Container) {
    $BackupDir = $backupsAlongside
  } elseif (Test-Path -LiteralPath (Join-Path $dbParent 'backups') -PathType Container) {
    $BackupDir = Join-Path $dbParent 'backups'
  } else {
    $BackupDir = Join-Path $AppRoot '.backups'
  }
}
if (-not (Test-Path -LiteralPath $BackupDir -PathType Container)) {
  New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}
Write-Host "[INFO] Backup:   $BackupDir"

# ── 5. Resolver SQL path ───────────────────────────────────────────────────
$sql = (Resolve-Path -LiteralPath $SqlPath).Path
Write-Host "[INFO] SQL:      $sql"

# Mostrar resumen
Write-Host ""
Write-Host "==========================================="
Write-Host " RESUMEN DE OPERACION"
Write-Host "==========================================="
Write-Host " sqlite3.exe : $sqlite"
Write-Host " Base datos  : $DbPath"
Write-Host " Backup dir  : $BackupDir"
Write-Host " SQL archivo : $sql"
Write-Host " DryRun      : $DryRun"
Write-Host "==========================================="
Write-Host ""

# ── 6. Confirmacion ────────────────────────────────────────────────────────
if (-not $Confirm -and -not $DryRun) {
  $answer = Read-Host "Ejecutar migracion contra la DB activa? (s/N)"
  if ($answer -notin 's', 'S', 'si', 'SI', 'sí', 'SÍ') {
    Write-Host "[CANCELADO] Por el usuario." -ForegroundColor Yellow
    exit 0
  }
}

# ── 7. Backup ───────────────────────────────────────────────────────────────
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$bakFile = "portfolio-backup-$stamp.sqlite"
$bakPath = Join-Path $BackupDir $bakFile

if (-not $DryRun) {
  Write-Host "[BACKUP] Creando backup --> $bakPath ..." -NoNewline
  $backupOutput = & $sqlite $DbPath ".backup '$bakPath'" 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Host " FAIL" -ForegroundColor Red
    Write-Host $backupOutput -ForegroundColor Red
    exit 1
  }
  $bakSize = (Get-Item -LiteralPath $bakPath).Length
  $bakSizeMb = [math]::Round($bakSize / 1MB, 2)
  Write-Host " OK ($bakSizeMb MB)" -ForegroundColor Green
} else {
  Write-Host "[BACKUP] Simulado --> $bakPath"
}

# ── 8. Estado pre-migracion ────────────────────────────────────────────────
Write-Host ""
Write-Host "[PRE] Estado PRE-migracion:"
$preResult = & $sqlite -bail -cmd ".timeout 10000" $DbPath "SELECT COUNT(*) AS cnt FROM instruments;" 2>&1
$preCount = ($preResult | Select-Object -Last 1).Trim()
Write-Host "  Instrumentos antes: $preCount"

$preTypesResult = & $sqlite -bail -cmd ".timeout 10000" $DbPath "SELECT DISTINCT type FROM instruments ORDER BY type;" 2>&1
$preTypes = ($preTypesResult | Where-Object { $_ -match '^\s*\|' -or $_ -match '^\s*[a-z]' } | ForEach-Object { $_.Trim() }) -join ', '
Write-Host "  Tipos presentes: $preTypes"

# ── 9. Ejecutar migracion ──────────────────────────────────────────────────
if (-not $DryRun) {
  Write-Host ""
  Write-Host "[MIGRATE] Ejecutando migracion..." -NoNewline
  $sqlContent = Get-Content -Raw -LiteralPath $sql
  $migOutput = $sqlContent | & $sqlite -bail -cmd ".timeout 10000" $DbPath 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Host " FAIL" -ForegroundColor Red
    Write-Host ""
    Write-Host "========== SALIDA DE ERROR ==========" -ForegroundColor Red
    Write-Host $migOutput -ForegroundColor Red
    Write-Host "=====================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "[WARNING] La DB NO se ha modificado (rollback automatico)." -ForegroundColor Yellow
    Write-Host "          Backup disponible en: $bakPath" -ForegroundColor Yellow
    exit 1
  }
  Write-Host " OK" -ForegroundColor Green
} else {
  Write-Host ""
  Write-Host "[MIGRATE] Simulado (DryRun) - SQL NO aplicado."
}

# ── 10. Estado post-migracion + verificacion ───────────────────────────────
Write-Host ""
Write-Host "[POST] Estado POST-migracion:"

if (-not $DryRun) {
  $postResult = & $sqlite -bail -cmd ".timeout 10000" $DbPath "SELECT COUNT(*) AS cnt FROM instruments;" 2>&1
  $postCount = ($postResult | Select-Object -Last 1).Trim()
  Write-Host "  Instrumentos despues: $postCount"

  $postTypesResult = & $sqlite -bail -cmd ".timeout 10000" $DbPath "SELECT DISTINCT type FROM instruments ORDER BY type;" 2>&1
  $postTypes = ($postTypesResult | Where-Object { $_ -match '^\s*\|' -or $_ -match '^\s*[a-z]' } | ForEach-Object { $_.Trim() }) -join ', '
  Write-Host "  Tipos presentes: $postTypes"

  # Schema final (una linea)
  $schemaResult = & $sqlite -bail -cmd ".timeout 10000" $DbPath "SELECT sql FROM sqlite_schema WHERE type='table' AND name='instruments';" 2>&1
  $schemaLine = ($schemaResult | Where-Object { $_ -match 'CREATE TABLE' } | Select-Object -First 1)
  if ($schemaLine) {
    Write-Host "  Schema: $($schemaLine.Trim())"
  }

  # ── 11. Integridad ────────────────────────────────────────────────────────
  Write-Host ""
  Write-Host "[CHECK] Verificando integridad..."

  $fkOutput = & $sqlite -bail -cmd ".timeout 10000" $DbPath "PRAGMA foreign_key_check;" 2>&1
  $fkOk = ($LASTEXITCODE -eq 0) -and (-not $fkOutput -or $fkOutput.Trim().Length -eq 0)

  $integrityOutput = & $sqlite -bail -cmd ".timeout 10000" $DbPath "PRAGMA integrity_check;" 2>&1
  $integrityOk = ($integrityOutput | Select-String -SimpleMatch 'ok' -Quiet)

  if ($fkOk) {
    Write-Host "  [PASS] PRAGMA foreign_key_check: ok (0 filas)" -ForegroundColor Green
  } else {
    Write-Host "  [FAIL] PRAGMA foreign_key_check: VIOLACIONES" -ForegroundColor Red
    Write-Host $fkOutput -ForegroundColor Red
  }

  if ($integrityOk) {
    Write-Host "  [PASS] PRAGMA integrity_check: ok" -ForegroundColor Green
  } else {
    Write-Host "  [FAIL] PRAGMA integrity_check: FALLOS" -ForegroundColor Red
    Write-Host $integrityOutput -ForegroundColor Red
  }

  if (-not $fkOk -or -not $integrityOk) {
    Write-Host ""
    Write-Host "[WARNING] La migracion completo pero hay problemas de integridad." -ForegroundColor Yellow
    Write-Host "          Restaura con el backup: $bakPath" -ForegroundColor Yellow
    Write-Host "          Ejecuta: npm run db:doctor" -ForegroundColor Yellow
    exit 1
  }
} else {
  Write-Host "  (DryRun - verificacion omitida)"
}

# ── 12. Resumen final ──────────────────────────────────────────────────────
Write-Host ""
Write-Host "===========================================" -ForegroundColor Green
if ($DryRun) {
  Write-Host " [DONE] SIMULACION COMPLETADA (sin cambios)" -ForegroundColor Cyan
} else {
  Write-Host " [DONE] MIGRACION COMPLETADA EXITOSAMENTE" -ForegroundColor Green
}
Write-Host "===========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Backup:  $bakPath"
Write-Host "  DB:      $DbPath"
Write-Host "  SQL:     $sql"
Write-Host ""
if (-not $DryRun) {
  Write-Host "  Siguiente paso: npm run db:doctor" -ForegroundColor Cyan
  Write-Host "  Arranca la app y verifica /api/health" -ForegroundColor Cyan
}
Write-Host ""