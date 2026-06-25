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
    '.opencode',
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

Invoke-Checked 'node --check apps/server/server.js' { & $node --check 'apps/server/server.js' }
Invoke-Checked 'node --check apps/web/src/app.js' { & $node --check 'apps/web/src/app.js' }
Invoke-Checked 'node --test' { & $node --test }

foreach ($generated in @('portfolio.loadtest.sqlite', ('portfolio.loadtest.sqlite' + '-shm'), ('portfolio.loadtest.sqlite' + '-wal'))) {
  $generatedPath = Join-Path (Join-Path $root 'local\valorgrid\data') $generated
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
  ('SPPW.DE' + ', META'),
  ('DE' + 'GIRO'),
  ('I' + 'BKR'),
  ('degiro' + '-csv'),
  ('ibkr' + '-csv'),
  ('broker' + '-degiro'),
  ('transactions' + '_export'),
  ('portfolio' + '_snapshot')
)
$textLeaks = @()
$publicBrokerTeaserPatterns = @(
  ('DE' + 'GIRO'),
  ('I' + 'BKR'),
  ('degiro' + '-csv'),
  ('ibkr' + '-csv')
)
$publicBrokerTeaserFiles = @(
  'index.html',
  'apps\server\src\domains\data-ingestion\ingestion-profiles.js',
  'apps/server/src/domains/data-ingestion/ingestion-profiles.js',
  'test\imports.test.js',
  'test/imports.test.js',
  'test\frontend-renovation.test.js',
  'test/frontend-renovation.test.js',
  'apps/web/src/imports.js',
  'apps\web\src\imports.js',
  'apps/web/src/import-workflow.js',
  'apps\web\src\import-workflow.js',
  'apps/web/src/import-workflow-helpers.js',
  'apps\web\src\import-workflow-helpers.js',
  'apps\server\src\domains\data-ingestion\ingestion-parser.js',
  'apps/server/src/domains/data-ingestion/ingestion-parser.js'
)

foreach ($file in $publicFiles) {
  if ($textExtensions -notcontains $file.Extension) { continue }
  $relative = $file.FullName.Substring($root.Path.Length + 1)
  $content = Get-Content -Path $file.FullName -Raw
  foreach ($pattern in $forbiddenTextPatterns) {
    if ($relative -in $publicBrokerTeaserFiles -and $pattern -in $publicBrokerTeaserPatterns) {
      continue
    }
    if ($content.Contains($pattern)) {
      $textLeaks += "$($file.FullName) contains $pattern"
    }
  }
}

if ($textLeaks.Count -gt 0) {
  throw "Private or preview text patterns found:$([Environment]::NewLine)$($textLeaks -join [Environment]::NewLine)"
}

$runtimeFiles = @(
  Get-ChildItem -Path (Join-Path $root 'apps/server/src') -Recurse -File
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

$casaosComposePath = Join-Path $root 'deploy\docker\compose.casaos.yml'
if (-not (Test-Path $casaosComposePath)) {
  throw 'compose.casaos.yml is required for CasaOS AppStore publication'
}

$casaosCompose = Get-Content $casaosComposePath -Raw
$expectedVersionTag = "v$version"
if (-not [regex]::IsMatch($casaosCompose, "(?m)^\s*image:\s*ghcr\.io/aivm23/valorgrid:$expectedVersionTag\s*$")) {
  throw "compose.casaos.yml image must use ghcr.io/aivm23/valorgrid:$expectedVersionTag (versioned tag, never latest)"
}

$requiredCasaosMounts = @(
  'source: /DATA/AppData/valorgrid/data',
  'target: /data',
  'source: /DATA/AppData/valorgrid/backups',
  'target: /app/.backups'
)
foreach ($mount in $requiredCasaosMounts) {
  if (-not $casaosCompose.Contains($mount)) {
    throw "compose.casaos.yml must use CasaOS AppData long-form bind mount: $mount"
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
  '(?m)^\s*port_map:\s*["'']?1325["'']?\s*$',
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
  throw "compose.casaos.yml version must match package.json version: v$version"
}

$umbrelOfficialDir = Join-Path $root 'deploy\umbrel\official\valorgrid'
$umbrelCommunityDir = Join-Path $root 'deploy\umbrel\community-store\valorgrid-store-valorgrid'
$umbrelStorePath = Join-Path $root 'deploy\umbrel\community-store\umbrel-app-store.yml'
foreach ($requiredUmbrelFile in @(
  (Join-Path $umbrelOfficialDir 'umbrel-app.yml'),
  (Join-Path $umbrelOfficialDir 'docker-compose.yml'),
  (Join-Path $umbrelOfficialDir 'data\.gitkeep'),
  $umbrelStorePath,
  (Join-Path $umbrelCommunityDir 'umbrel-app.yml'),
  (Join-Path $umbrelCommunityDir 'docker-compose.yml'),
  (Join-Path $umbrelCommunityDir 'data\.gitkeep')
)) {
  if (-not (Test-Path $requiredUmbrelFile)) {
    throw "Umbrel package file is missing: $requiredUmbrelFile"
  }
}

$umbrelStore = Get-Content $umbrelStorePath -Raw
if (-not [regex]::IsMatch($umbrelStore, '(?m)^id:\s*valorgrid-store\s*$')) {
  throw 'Umbrel community store id must be valorgrid-store'
}

$umbrelPackages = @(
  @{ Label = 'official'; Id = 'valorgrid'; Dir = $umbrelOfficialDir },
  @{ Label = 'community'; Id = 'valorgrid-store-valorgrid'; Dir = $umbrelCommunityDir }
)

foreach ($umbrelPackage in $umbrelPackages) {
  $manifest = Get-Content (Join-Path $umbrelPackage.Dir 'umbrel-app.yml') -Raw
  $compose = Get-Content (Join-Path $umbrelPackage.Dir 'docker-compose.yml') -Raw
  $packageLabel = $umbrelPackage.Label
  $packageId = $umbrelPackage.Id

  foreach ($pattern in @(
    "(?m)^id:\s*$packageId\s*$",
    "(?m)^version:\s*[""']?$version[""']?\s*$",
    '(?m)^manifestVersion:\s*1\s*$',
    '(?m)^category:\s*finance\s*$',
    '(?m)^port:\s*1325\s*$',
    '(?m)^path:\s*""\s*$',
    '(?m)^gallery:\s*\[\]\s*$'
  )) {
    if (-not [regex]::IsMatch($manifest, $pattern)) {
      throw "Umbrel $packageLabel manifest is missing required pattern: $pattern"
    }
  }

  foreach ($pattern in @(
    '(?m)^\s*app_proxy:\s*$',
    '(?m)^\s*APP_HOST:\s*valorgrid_app_1\s*$',
    '(?m)^\s*APP_PORT:\s*1325\s*$',
    '(?m)^\s*PORTFOLIO_DB_PATH:\s*/data/portfolio\.sqlite\s*$',
    '(?m)^\s*VALORGRID_BACKUP_DIR:\s*/data/backups\s*$',
    '(?m)^\s*-\s*\$\{APP_DATA_DIR\}/data:/data\s*$'
  )) {
    if (-not [regex]::IsMatch($compose, $pattern)) {
      throw "Umbrel $packageLabel compose is missing required pattern: $pattern"
    }
  }

  if (-not [regex]::IsMatch($compose, "(?m)^\s*image:\s*ghcr\.io/aivm23/valorgrid:v$version@sha256:[a-f0-9]{64}\s*$")) {
    throw "Umbrel $packageLabel compose must use ghcr.io/aivm23/valorgrid:v$version pinned by sha256 digest"
  }
  foreach ($forbiddenUmbrelPattern in @('(?m)^\s*build:\s*$', '(?m)^\s*ports:\s*$', 'latest\b', 'docker\.sock', '(?m)^volumes:\s*$')) {
    if ([regex]::IsMatch($compose, $forbiddenUmbrelPattern)) {
      throw "Umbrel $packageLabel compose contains forbidden pattern: $forbiddenUmbrelPattern"
    }
  }
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
