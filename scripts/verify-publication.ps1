$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$node = 'node'
if ($env:LOCALAPPDATA) {
  $candidateNode = Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\bin\node.exe'
  if (Test-Path $candidateNode) {
    $node = $candidateNode
  }
}

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string]$Label,
    [Parameter(Mandatory = $true)][scriptblock]$Command
  )

  Write-Output "==> $Label"
  & $Command
}

function Get-PublicFiles {
  param([string]$Path)

  $ignoredDirs = @(
    '.git',
    '.backups',
    'backups',
    '.idea',
    '.vscode',
    'data',
    'dist',
    'imports',
    'local',
    'node_modules',
    'tmp',
    'temp',
    '.cache'
  )
  $ignoredFilePatterns = @(
    '^PLAN.*\.md$',
    '^Plan_.*\.md$'
  )

  Get-ChildItem -Path $Path -Recurse -Force -File |
    Where-Object {
      foreach ($pattern in $ignoredFilePatterns) {
        if ($_.Name -match $pattern) { return $false }
      }
      $relative = $_.FullName.Substring($root.Path.Length + 1)
      $parts = $relative -split '[\\/]'
      foreach ($dir in $ignoredDirs) {
        if ($parts -contains $dir) { return $false }
      }
      return $true
    }
}

Set-Location $root

Invoke-Checked 'node --check server.js' { & $node --check 'server.js' }
Invoke-Checked 'node --check app.js' { & $node --check 'app.js' }
Invoke-Checked 'node --test' { & $node --test }

foreach ($generated in @('portfolio.loadtest.sqlite', ('portfolio.loadtest.sqlite' + '-shm'), ('portfolio.loadtest.sqlite' + '-wal'))) {
  $generatedPath = Join-Path $root $generated
  if (Test-Path $generatedPath) {
    Remove-Item -LiteralPath $generatedPath -Force
  }
}

$version = (Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
if (-not $version) {
  throw "package.json does not contain a version field"
}

$gitignore = Get-Content (Join-Path $root '.gitignore') -Raw
foreach ($pattern in @('*.sqlite', '*.sqlite-wal', '*.sqlite-shm', 'data/', '.backups/', 'dist/', '.env', 'local/', 'imports/', 'downloads/')) {
  if (-not $gitignore.Contains($pattern)) {
    throw ".gitignore does not contain required pattern: $pattern"
  }
}

$dockerignorePath = Join-Path $root '.dockerignore'
if (-not (Test-Path $dockerignorePath)) {
  throw '.dockerignore is required for Docker publication safety'
}

$dockerignore = Get-Content $dockerignorePath -Raw
foreach ($pattern in @('.git', '*.sqlite', '*.sqlite-wal', '*.sqlite-shm', 'data', '.backups', 'backups', '.env', 'local', 'imports', 'node_modules')) {
  if (-not $dockerignore.Contains($pattern)) {
    throw ".dockerignore does not contain required pattern: $pattern"
  }
}

$publicFiles = @(Get-PublicFiles -Path $root)
$allowedPrivateRootFiles = @('portfolio.sqlite', ('portfolio.sqlite' + '-wal'), ('portfolio.sqlite' + '-shm'))
$forbiddenFiles = @()

foreach ($file in $publicFiles) {
  $name = $file.Name
  $hasUnsafeNameChar = $false
  foreach ($character in $name.ToCharArray()) {
    $codePoint = [int][char]$character
    if ($codePoint -lt 32 -or ($codePoint -ge 0xE000 -and $codePoint -le 0xF8FF)) {
      $hasUnsafeNameChar = $true
      break
    }
  }
  if ($hasUnsafeNameChar) {
    $forbiddenFiles += $file.FullName
    continue
  }
  if ($allowedPrivateRootFiles -contains $name) { continue }
  if (
    $name -like '*.sqlite' -or
    $name -like '*.sqlite-wal' -or
    $name -like '*.sqlite-shm' -or
    $name -like '*.sqlite.sql' -or
    $name -like '*.dump' -or
    $name -like '*.dbdump' -or
    $name -like '*.log' -or
    $name -like '*.out' -or
    $name -like '*.err' -or
    $name -like 'debug-*' -or
    $name -like 'PLAN*.md' -or
    $name -like 'Plan_*.md'
  ) {
    $forbiddenFiles += $file.FullName
  }
}

if ($forbiddenFiles.Count -gt 0) {
  throw "Forbidden publishable files found:$([Environment]::NewLine)$($forbiddenFiles -join [Environment]::NewLine)"
}

$textExtensions = @('', '.css', '.html', '.js', '.json', '.md', '.ps1', '.sh', '.txt', '.yml')
$forbiddenTextPatterns = @(
  ('C:' + '\' + 'Users'),
  ('C:' + '\\' + 'Users'),
  ('Lib' + 'ro1'),
  ('github' + '-preview'),
  ('valorgrid-' + 'github' + '-preview'),
  ('preview:' + 'github'),
  ('start:' + 'github' + '-preview'),
  ('create-' + 'github' + '-preview'),
  ('start-' + 'github' + '-preview'),
  ([char]27 + '['),
  ('SPPW' + ', META'),
  ('SPPW.DE' + ', META')
)
$textLeaks = @()

foreach ($file in $publicFiles) {
  if ($textExtensions -notcontains $file.Extension) { continue }
  $content = Get-Content -Path $file.FullName -Raw
  foreach ($pattern in $forbiddenTextPatterns) {
    if ($content.Contains($pattern)) {
      $textLeaks += "$($file.FullName) contains $pattern"
    }
  }
}

if ($textLeaks.Count -gt 0) {
  throw "Private or preview text patterns found:$([Environment]::NewLine)$($textLeaks -join [Environment]::NewLine)"
}

$runtimeFiles = @(
  Get-ChildItem -Path (Join-Path $root 'src') -Recurse -File
  Get-ChildItem -Path (Join-Path $root 'scripts') -Recurse -File
) | Where-Object { $_.Extension -in @('.js', '.ps1', '.sh') }

$alterTableOffenders = @()
foreach ($file in $runtimeFiles) {
  $content = Get-Content -Path $file.FullName -Raw
  if ($content -match '\bALTER\s+TABLE\s+[A-Za-z_][A-Za-z0-9_]*\s+(ADD|RENAME|DROP|ALTER)\b') {
    $alterTableOffenders += $file.FullName
  }
}

if ($alterTableOffenders.Count -gt 0) {
  throw "ALTER TABLE is forbidden in runtime/scripts for fresh-only policy:$([Environment]::NewLine)$($alterTableOffenders -join [Environment]::NewLine)"
}

$resetScriptPath = Join-Path $root 'scripts\reset-db.ps1'
if (-not (Test-Path $resetScriptPath)) {
  throw 'scripts/reset-db.ps1 is required for DB reset operations'
}

$resetScript = Get-Content $resetScriptPath -Raw
if (-not $resetScript.Contains('Type YES to continue')) {
  throw 'scripts/reset-db.ps1 must require explicit confirmation before destructive reset'
}

$backupScriptPath = Join-Path $root 'scripts\backup-db.ps1'
$backupScript = Get-Content $backupScriptPath -Raw
if (-not $backupScript.Contains('scripts\db-backup.js')) {
  throw 'scripts/backup-db.ps1 must route through scripts/db-backup.js'
}

$casaosComposePath = Join-Path $root 'compose.casaos.yml'
if (-not (Test-Path $casaosComposePath)) {
  throw 'compose.casaos.yml is required for CasaOS AppStore publication'
}

$casaosCompose = Get-Content $casaosComposePath -Raw
if ([regex]::IsMatch($casaosCompose, '(?m)^\s*image:\s*ghcr\.io/aivm23/valorgrid:latest\s*$')) {
  throw 'compose.casaos.yml must not use :latest for CasaOS AppStore publication'
}

$expectedCasaosImage = "ghcr.io/aivm23/valorgrid:v$version"
$expectedCasaosImagePattern = [regex]::Escape($expectedCasaosImage)
if (-not [regex]::IsMatch($casaosCompose, "(?m)^\s*image:\s*$expectedCasaosImagePattern\s*$")) {
  throw "compose.casaos.yml image must match package version tag: $expectedCasaosImage"
}

$requiredCasaosMounts = @(
  '/DATA/AppData/valorgrid/data:/data',
  '/DATA/AppData/valorgrid/backups:/app/.backups'
)
foreach ($mount in $requiredCasaosMounts) {
  if (-not $casaosCompose.Contains($mount)) {
    throw "compose.casaos.yml must use CasaOS AppData bind mount: $mount"
  }
}

foreach ($forbiddenMount in @('valorgrid-data:/data', 'valorgrid-backups:/app/.backups')) {
  if ($casaosCompose.Contains($forbiddenMount)) {
    throw "compose.casaos.yml must not use Docker named volume mount for CasaOS AppStore: $forbiddenMount"
  }
}

if ([regex]::IsMatch($casaosCompose, "(?m)^volumes:\s*$")) {
  throw 'compose.casaos.yml must not declare top-level Docker named volumes for CasaOS AppStore'
}

$requiredCasaosPatterns = @(
  '(?m)^\s*version:\s*["'']?v[0-9]+\.[0-9]+\.[0-9]+["'']?\s*$',
  '(?m)^\s*updateAt:\s*["'']?[0-9]{4}-[0-9]{2}-[0-9]{2}["'']?\s*$',
  '(?m)^\s*repo:\s*https://github\.com/aivm23/ValorGrid\s*$',
  '(?m)^\s*support:\s*https://github\.com/aivm23/ValorGrid/issues\s*$',
  '(?m)^\s*website:\s*https://github\.com/aivm23/ValorGrid\s*$',
  '(?m)^\s*main:\s*valorgrid\s*$',
  '(?m)^\s*port_map:\s*["'']?5173["'']?\s*$',
  '(?m)^\s*architectures:\s*$',
  '(?m)^\s*-\s*amd64\s*$',
  '(?m)^\s*-\s*arm64\s*$'
)
foreach ($pattern in $requiredCasaosPatterns) {
  if (-not [regex]::IsMatch($casaosCompose, $pattern)) {
    throw "compose.casaos.yml is missing required CasaOS metadata pattern: $pattern"
  }
}

$expectedVersionPattern = [regex]::Escape("v$version")
if (-not [regex]::IsMatch($casaosCompose, "(?m)^\s*version:\s*[""']?$expectedVersionPattern[""']?\s*$")) {
  throw "compose.casaos.yml version must match package version: v$version"
}

$dockerWorkflowPath = Join-Path $root '.github\workflows\docker.yml'
if (-not (Test-Path $dockerWorkflowPath)) {
  throw '.github/workflows/docker.yml is required for GHCR publication'
}

$dockerWorkflow = Get-Content $dockerWorkflowPath -Raw
if (-not $dockerWorkflow.Contains('type=semver,pattern=v{{version}}')) {
  throw 'Docker workflow must publish semver tags with v{{version}}'
}
if (-not $dockerWorkflow.Contains('type=raw,value=latest')) {
  throw 'Docker workflow must continue publishing latest tag'
}
foreach ($forbiddenTagPattern in @('type=semver,pattern={{version}}', 'type=semver,pattern={{major}}.{{minor}}')) {
  if ($dockerWorkflow.Contains($forbiddenTagPattern)) {
    throw "Docker workflow contains forbidden tag pattern: $forbiddenTagPattern"
  }
}

Write-Output "Publication verification passed for version $version."
