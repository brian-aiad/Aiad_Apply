$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
while ($true) {
    $record = Join-Path $root '.runtime\processes.json'
    $running = $false
    if (Test-Path -LiteralPath $record) {
        try {
            $data = Get-Content -LiteralPath $record -Raw | ConvertFrom-Json
            $running = $data.repository -eq $root -and (Get-Process -Id $data.webPid -ErrorAction Stop) -and (Get-Process -Id $data.workerPid -ErrorAction Stop)
        } catch { $running = $false }
    }
    # Network outages never interrupt existing processes or approved applications.
    if (-not $running) { & powershell.exe -NoProfile -File (Join-Path $root 'scripts\start-local.ps1') -NoBrowser }
    Start-Sleep -Seconds 30
}
