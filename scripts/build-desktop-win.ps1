$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$dist = Join-Path $root 'dist'
$npm = 'npm.cmd'

if (-not (Get-Command $npm -ErrorAction SilentlyContinue)) {
  $npm = 'npm'
}

Set-Location $root

$resolvedRoot = [System.IO.Path]::GetFullPath($root.Path)
$resolvedDist = [System.IO.Path]::GetFullPath($dist)
if (-not $resolvedDist.StartsWith($resolvedRoot + [System.IO.Path]::DirectorySeparatorChar)) {
  throw "Refusing to clean dist outside repository: $resolvedDist"
}

if (Test-Path $dist) {
  Write-Output "Cleaning $dist"
  Remove-Item -LiteralPath $dist -Recurse -Force
}

Write-Output 'Building ValorGrid Windows installer'
& $npm run desktop:dist:win

Write-Output 'Generating release checksums'
& $npm run release:checksums

Write-Output ''
Write-Output 'Windows installer build complete:'
Get-ChildItem -Path $dist -File |
  Where-Object { $_.Name -like 'ValorGrid-Setup-*.exe' -or $_.Name -eq 'SHA256SUMS.txt' -or $_.Name -eq 'latest.yml' } |
  Sort-Object Name |
  ForEach-Object { Write-Output " - $($_.FullName)" }
