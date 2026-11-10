param([ValidateSet('start','stop')][string]$Action = 'start')
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$runtime = Join-Path $root '.runtime'
New-Item -ItemType Directory -Force -Path $runtime | Out-Null
$record = Join-Path $runtime 'application-worker-windows.json'
$owned = $null
if (Test-Path -LiteralPath $record) {
    $data = Get-Content -LiteralPath $record -Raw | ConvertFrom-Json
    if ([IO.Path]::GetFullPath([string]$data.repository) -ne [IO.Path]::GetFullPath($root)) { throw 'Worker record belongs to another project.' }
    $owned = Get-CimInstance Win32_Process -Filter "ProcessId = $($data.pid)" -ErrorAction SilentlyContinue
    if ($owned -and ([string]$owned.CommandLine).IndexOf((Join-Path $root 'scripts\run-application-worker.py'), [StringComparison]::OrdinalIgnoreCase) -lt 0) { throw 'Recorded PID no longer belongs to the application launcher.' }
}
if ($Action -eq 'stop') {
    if ($owned) {
        # A Windows venv shim can spawn the Python process holding the lock.
        # Stop only verified launcher children, allowing Node's parent pipe to close.
        $launcherPath = Join-Path $root 'scripts\run-application-worker.py'
        $children = Get-CimInstance Win32_Process -Filter "ParentProcessId = $($owned.ProcessId)" -ErrorAction SilentlyContinue
        foreach ($child in $children) {
            if (([string]$child.CommandLine).IndexOf($launcherPath, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
                Stop-Process -Id $child.ProcessId -ErrorAction SilentlyContinue
            }
        }
        Stop-Process -Id $owned.ProcessId -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 700
    }
    Remove-Item -LiteralPath $record -Force -ErrorAction SilentlyContinue
    Write-Host 'Application worker stopped; interrupted submissions must be checked before retry.'
    exit 0
}
if ($owned) { Write-Host 'Application browser worker is already running.'; exit 0 }
$launcher = Join-Path $root 'scripts\run-application-worker.py'
$python = Join-Path $root '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) { throw 'Run uv sync --extra dev first.' }
$process = Start-Process -FilePath $python -ArgumentList @('"' + $launcher + '"') -WorkingDirectory (Join-Path $root 'apps\web') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtime 'application-worker.log') -RedirectStandardError (Join-Path $runtime 'application-worker-error.log') -PassThru
Start-Sleep -Milliseconds 700
if ($process.HasExited) { throw 'Application worker did not start. Check its private log.' }
@{repository=$root;pid=$process.Id} | ConvertTo-Json | Set-Content -LiteralPath $record -Encoding utf8
Write-Host 'Application worker running; exact resume and application authorization checks are enforced.'
