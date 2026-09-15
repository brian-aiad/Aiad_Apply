param(
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$webRoot = Join-Path $repositoryRoot "apps\web"
$runtimeRoot = Join-Path $repositoryRoot ".runtime"
$processFile = Join-Path $runtimeRoot "processes.json"
$webLog = Join-Path $runtimeRoot "web.log"
$webErrorLog = Join-Path $runtimeRoot "web-error.log"
$workerLog = Join-Path $runtimeRoot "worker.log"
$workerErrorLog = Join-Path $runtimeRoot "worker-error.log"
$localUrl = "http://127.0.0.1:3000"

function Stop-ProcessTree {
    param([int]$RootProcessId)

    $descendants = @()
    $pending = @($RootProcessId)
    while ($pending.Count -gt 0) {
        $parentId = $pending[0]
        $pending = @($pending | Select-Object -Skip 1)
        $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $parentId")
        foreach ($child in $children) {
            $pending += [int]$child.ProcessId
            $descendants += [int]$child.ProcessId
        }
    }
    [array]::Reverse($descendants)
    foreach ($processId in $descendants) {
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
    Stop-Process -Id $RootProcessId -Force -ErrorAction SilentlyContinue
}

foreach ($commandName in @("node", "npm", "uv")) {
    if (-not (Get-Command $commandName -ErrorAction SilentlyContinue)) {
        throw "Missing required command: $commandName"
    }
}
$nodeMajor = [int](& node -p "process.versions.node.split('.')[0]")
if ($nodeMajor -ne 22) {
    throw "Node.js 22 is required; found $(& node --version). Run 'nvm install 22 && nvm use 22'."
}
if (-not (Test-Path -LiteralPath (Join-Path $webRoot ".env")) -and
    -not (Test-Path -LiteralPath (Join-Path $webRoot ".env.local"))) {
    throw "Missing apps\web\.env or apps\web\.env.local; copy .env.example and configure it."
}

Push-Location $repositoryRoot
try {
    & uv run python -c "import aiadapply_v2" 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Repairing the local Python environment..."
        & uv sync --extra dev
        if ($LASTEXITCODE -ne 0) {
            $venvPath = [IO.Path]::GetFullPath((Join-Path $repositoryRoot ".venv"))
            $users = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
                $_.CommandLine -and $_.CommandLine.IndexOf($venvPath, [StringComparison]::OrdinalIgnoreCase) -ge 0
            })
            if ($users.Count -gt 0) {
                $processes = ($users | ForEach-Object { "$($_.Name) (PID $($_.ProcessId))" }) -join ", "
                throw "uv could not repair .venv because it is in use by: $processes. Stop those Python/editor tools and run scripts\start-local.ps1 again."
            }
            throw "uv sync failed while repairing .venv. Run 'uv sync --extra dev' from $repositoryRoot to see the complete dependency error."
        }
        & uv run python -c "import aiadapply_v2"
        if ($LASTEXITCODE -ne 0) {
            throw "The resume engine is not importable after uv sync."
        }
    }
}
finally {
    Pop-Location
}

New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null

if (Test-Path -LiteralPath $processFile) {
    $recorded = Get-Content -LiteralPath $processFile -Raw | ConvertFrom-Json
    if ([IO.Path]::GetFullPath([string]$recorded.repository) -ne [IO.Path]::GetFullPath($repositoryRoot)) {
        throw "The process record does not belong to this repository."
    }
    $running = @($recorded.webPid, $recorded.workerPid) |
        Where-Object { $_ -and (Get-Process -Id $_ -ErrorAction SilentlyContinue) }
    if ($running.Count -eq 2) {
        try {
            $health = Invoke-RestMethod -Uri "$localUrl/api/health" -TimeoutSec 2
            if ($health.database -and $health.baseResume -and $health.worker) {
                Write-Host "AIAD Apply is already running at $localUrl"
                if (-not $NoBrowser) {
                    Start-Process $localUrl
                }
                exit 0
            }
        }
        catch {
            # The recorded processes are present but not healthy; recover below.
        }
    }
    if ($running.Count -gt 0) {
        Write-Host "Recovering an incomplete AIAD Apply start..."
        & (Join-Path $PSScriptRoot "stop-local.ps1")
    }
    else {
        Remove-Item -LiteralPath $processFile -Force
    }
}

$webCommand = "Set-Location -LiteralPath '$($webRoot.Replace("'", "''"))'; npm run dev -- --hostname 127.0.0.1 --port 3000"
$webProcess = Start-Process powershell.exe `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $webCommand) `
    -WindowStyle Hidden `
    -RedirectStandardOutput $webLog `
    -RedirectStandardError $webErrorLog `
    -PassThru

$ready = $false
for ($attempt = 0; $attempt -lt 60; $attempt++) {
    try {
        $response = Invoke-WebRequest -Uri $localUrl -UseBasicParsing -TimeoutSec 2
        if ($response.StatusCode -eq 200) {
            $ready = $true
            break
        }
    }
    catch {
        # Retry until both services have reported healthy.
    }
    Start-Sleep -Milliseconds 500
}

if (-not $ready) {
    Stop-ProcessTree -RootProcessId $webProcess.Id
    throw "The dashboard did not become ready at $localUrl."
}

$workerCommand = "Set-Location -LiteralPath '$($repositoryRoot.Replace("'", "''"))'; uv run aiadapplyv2 worker --api-url $localUrl"
$workerProcess = Start-Process powershell.exe `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $workerCommand) `
    -WindowStyle Hidden `
    -RedirectStandardOutput $workerLog `
    -RedirectStandardError $workerErrorLog `
    -PassThru

$workerReady = $false
for ($attempt = 0; $attempt -lt 20; $attempt++) {
    if ($workerProcess.HasExited) {
        break
    }
    try {
        $health = Invoke-RestMethod -Uri "$localUrl/api/health" -TimeoutSec 2
        if ($health.database -and $health.baseResume -and $health.worker) {
            $workerReady = $true
            break
        }
    }
    catch {
        # Retry while the worker registers its first heartbeat.
    }
    if (-not $workerReady) {
        Start-Sleep -Milliseconds 500
    }
}
if (-not $workerReady) {
    Stop-ProcessTree -RootProcessId $workerProcess.Id
    Stop-ProcessTree -RootProcessId $webProcess.Id
    throw "The worker did not remain running. See $workerErrorLog."
}

@{
    repository = $repositoryRoot
    startedAt = (Get-Date).ToString("o")
    webPid = $webProcess.Id
    workerPid = $workerProcess.Id
} | ConvertTo-Json | Set-Content -LiteralPath $processFile -Encoding utf8

Write-Host "AIAD Apply is running at $localUrl"
Write-Host "Logs are stored in $runtimeRoot"
Write-Host "Use scripts\stop-local.ps1 to stop the local services."
if (-not $NoBrowser) {
    Start-Process $localUrl
}
