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

$version = (Get-Content (Join-Path $root 'version.json') -Raw | ConvertFrom-Json).version
$packageVersion = (Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
if ($version -ne $packageVersion) {
  throw "package.json version ($packageVersion) does not match version.json ($version)"
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

Write-Output "Publication verification passed for version $version."
