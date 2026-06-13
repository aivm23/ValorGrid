$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$node = Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\bin\node.exe'

if (-not (Test-Path $node)) {
  $node = 'node'
}

Set-Location $root
Remove-Item Env:\PORTFOLIO_DB_PATH -ErrorAction SilentlyContinue
& $node 'apps/server/server.js'
