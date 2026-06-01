$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$node = Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\bin\node.exe'

if (-not (Test-Path $node)) {
  $node = 'node'
}

Set-Location $root
& $node 'scripts\db-doctor.js'
