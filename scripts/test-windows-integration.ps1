# Run fixtures against a loopback-only test cluster, never the workspace database.
param([string[]]$Tests = @(
  'tests/integration/tailoring-queue-safety.test.ts',
  'tests/integration/application-automation.test.ts',
  'tests/integration/discovery-refresh-request.test.ts'
))
$ErrorActionPreference = 'Stop'
function Invoke-QaNative([string]$Program, [string[]]$Arguments) {
  $savedAction = $ErrorActionPreference
  try {
    # Windows PowerShell 5 treats redirected native stderr as ErrorRecords.
    # Prisma prints normal diagnostics there; use its exit code as the result.
    $ErrorActionPreference = 'Continue'
    & $Program @Arguments
    $code = $LASTEXITCODE
  } finally { $ErrorActionPreference = $savedAction }
  if ($code -ne 0) { throw "QA command failed with exit code $code" }
}
$root = Split-Path $PSScriptRoot -Parent
$bin = Join-Path $root '.runtime/postgresql-qa/pgsql/bin'
$data = Join-Path $root '.runtime/oct26-test-postgres'
$testUrl = 'postgresql://aiadqa@127.0.0.1:55436/aiadapply_test'
if (!(Test-Path "$bin/pg_ctl.exe")) { throw 'Install the local PostgreSQL QA binaries before running this script.' }
if (!(Test-Path "$data/PG_VERSION")) { throw 'QA cluster is missing. Restore or initialize the dedicated test cluster; do not use the workspace database.' }
& "$bin/pg_ctl.exe" -D $data status | Out-Null
if ($LASTEXITCODE -ne 0) {
  # Avoid inherited PowerShell output pipes keeping the launch command open
  # for the lifetime of the PostgreSQL background server.
  & "$root/.venv/Scripts/python.exe" "$root/scripts/start-test-postgres.py"
  if ($LASTEXITCODE -ne 0) { throw 'Could not start isolated QA PostgreSQL.' }
}
$saved = @{}
foreach ($key in @('DATABASE_URL','DIRECT_URL','AIADAPPLY_E2E_DATABASE_URL','AIADAPPLY_E2E_DIRECT_URL')) { $saved[$key] = [Environment]::GetEnvironmentVariable($key, 'Process') }
Push-Location "$root/apps/web"
try {
  $env:DATABASE_URL = $testUrl
  $env:DIRECT_URL = $testUrl
  Invoke-QaNative 'npx.cmd' @('prisma','db','push','--skip-generate')
  # Restore normal identity so the test's isolation guard still compares both URLs.
  $env:DATABASE_URL = $saved['DATABASE_URL']
  $env:DIRECT_URL = $saved['DIRECT_URL']
  $env:AIADAPPLY_E2E_DATABASE_URL = $testUrl
  $env:AIADAPPLY_E2E_DIRECT_URL = $testUrl
  Invoke-QaNative 'npx.cmd' (@('tsx','--test','--test-concurrency=1') + $Tests)
} finally {
  foreach ($key in $saved.Keys) { [Environment]::SetEnvironmentVariable($key, $saved[$key], 'Process') }
  Pop-Location
}
