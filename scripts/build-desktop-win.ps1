$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$artifactsDir = Join-Path $root 'local\artifacts\desktop'
$npm = 'npm.cmd'

if (-not (Get-Command $npm -ErrorAction SilentlyContinue)) {
  $npm = 'npm'
}

Set-Location $root

function Invoke-NpmScript {
  param([Parameter(Mandatory = $true)][string]$ScriptName)

  & $npm run $ScriptName
  if ($LASTEXITCODE -ne 0) {
    throw "npm script failed: $ScriptName"
  }
}

$resolvedRoot = [System.IO.Path]::GetFullPath($root.Path)
$resolvedArtifactsDir = [System.IO.Path]::GetFullPath($artifactsDir)
if (-not $resolvedArtifactsDir.StartsWith($resolvedRoot + [System.IO.Path]::DirectorySeparatorChar)) {
  throw "Refusing to clean artifacts outside repository: $resolvedArtifactsDir"
}

if (Test-Path $artifactsDir) {
  Write-Output "Cleaning $artifactsDir"
  Remove-Item -LiteralPath $artifactsDir -Recurse -Force
}

Write-Output 'Building ValorGrid Windows installer'
Invoke-NpmScript 'desktop:dist:win'

Write-Output 'Creating stable release artifact name'
& $npm run release:desktop:stable -- local/artifacts/desktop win32
if ($LASTEXITCODE -ne 0) {
  throw 'stable release artifact naming failed'
}

Write-Output 'Generating release checksums'
Invoke-NpmScript 'release:checksums'

Write-Output ''
Write-Output 'Windows installer build complete:'
Get-ChildItem -Path $artifactsDir -File |
  Where-Object { $_.Name -like 'ValorGrid-Setup-*.exe' -or $_.Name -eq 'SHA256SUMS.txt' -or $_.Name -eq 'latest.yml' } |
  Sort-Object Name |
  ForEach-Object { Write-Output " - $($_.FullName)" }
