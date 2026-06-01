[CmdletBinding()]
param(
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$node = Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\bin\node.exe'

if (-not (Test-Path $node)) {
  $node = 'node'
}

if (-not $Force) {
  $confirmation = Read-Host "This will backup and reset the active SQLite database. Type YES to continue"
  if ($confirmation -ne 'YES') {
    Write-Output "Reset cancelled."
    exit 1
  }
}

Set-Location $root
& $node 'scripts\db-reset.js'
