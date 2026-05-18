$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$node = Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\bin\node.exe'

if (-not (Test-Path $node)) {
  $node = 'node'
}

Set-Location $root
& $node -e "const { openDatabase } = require('./src/db'); const { createBackup } = require('./src/backups'); const path = require('node:path'); const dbPath = process.env.PORTFOLIO_DB_PATH || path.join(process.cwd(), 'portfolio.sqlite'); const db = openDatabase(dbPath); const backup = createBackup({ db, dbPath, root: process.cwd() }); db.close(); console.log(JSON.stringify(backup, null, 2));"
