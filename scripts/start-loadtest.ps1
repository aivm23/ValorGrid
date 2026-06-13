$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$node = Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\bin\node.exe'
$dbPath = Join-Path $root 'portfolio.loadtest.sqlite'

if (-not (Test-Path $node)) {
  $node = 'node'
}

if (-not (Test-Path $dbPath)) {
  Set-Location $root
  & $node 'scripts\seed-loadtest-db.js'
}

$env:PORTFOLIO_DB_PATH = $dbPath
Set-Location $root
& $node 'apps/server/server.js'
