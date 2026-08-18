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

New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null

if (Test-Path -LiteralPath $processFile) {
    $recorded = Get-Content -LiteralPath $processFile -Raw | ConvertFrom-Json
    $running = @($recorded.webPid, $recorded.workerPid) |
        Where-Object { $_ -and (Get-Process -Id $_ -ErrorAction SilentlyContinue) }
    if ($running.Count -gt 0) {
        Write-Host "AIAD Apply is already running at $localUrl"
        if (-not $NoBrowser) {
            Start-Process $localUrl
        }
        exit 0
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
        Start-Sleep -Milliseconds 500
    }
}

if (-not $ready) {
    Stop-Process -Id $webProcess.Id -Force -ErrorAction SilentlyContinue
    throw "The dashboard did not become ready at $localUrl."
}

$workerCommand = "Set-Location -LiteralPath '$($repositoryRoot.Replace("'", "''"))'; uv run aiadapplyv2 worker --api-url $localUrl"
$workerProcess = Start-Process powershell.exe `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $workerCommand) `
    -WindowStyle Hidden `
    -RedirectStandardOutput $workerLog `
    -RedirectStandardError $workerErrorLog `
    -PassThru

Start-Sleep -Seconds 1
if ($workerProcess.HasExited) {
    Stop-Process -Id $webProcess.Id -Force -ErrorAction SilentlyContinue
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
