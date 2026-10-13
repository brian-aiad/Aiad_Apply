$ErrorActionPreference = "Stop"
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$profileRoot = Join-Path $repositoryRoot ".runtime\chrome-linkedin-profile"
$debugEndpoint = "http://127.0.0.1:9222/json/version"
function Test-Endpoint {
    try { Invoke-WebRequest -UseBasicParsing -Uri $debugEndpoint -TimeoutSec 2 | Out-Null; return $true }
    catch { return $false }
}
function Assert-DedicatedOwner {
    try {
        $listeners = @(Get-NetTCPConnection -LocalPort 9222 -State Listen -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess -Unique)
        if ($listeners.Count -ne 1) { throw "Ambiguous listener" }
        $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$($listeners[0])" -ErrorAction Stop
        $profilePattern = '--user-data-dir="?' + [regex]::Escape($profileRoot) + '(?:"|\s|$)'
        if ($owner.Name -ne 'chrome.exe' -or $owner.CommandLine -notmatch $profilePattern) { throw "Different profile" }
    } catch { throw "Cannot verify port 9222 belongs to the dedicated LinkedIn Chrome profile. Resolve the conflicting browser or permissions; no browser will be reused or launched." }
}
if (Test-Endpoint) { Assert-DedicatedOwner; Write-Host "Dedicated LinkedIn Chrome verified. No navigation was performed."; exit 0 }
$chromeCandidates = @(
    (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe')
    $(if (${env:ProgramFiles(x86)}) { Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe' })
    $(if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe' })
)
$chrome = $chromeCandidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
if (-not $chrome) { throw "Google Chrome was not found in Program Files, Program Files (x86), or LocalAppData." }
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $profileRoot) | Out-Null
$launchLockPath = Join-Path $repositoryRoot '.runtime\linkedin-launch.lock'
try { $launchLock = [System.IO.File]::Open($launchLockPath, 'OpenOrCreate', 'ReadWrite', 'None') }
catch { throw "Another LinkedIn browser launch is in progress. No duplicate browser was opened." }
try {
    $profilePattern = '--user-data-dir="?' + [regex]::Escape($profileRoot) + '(?:"|\s|$)'
    $running = @(Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" -ErrorAction Stop | Where-Object { $_.CommandLine -match $profilePattern })
    if ($running.Count -or (Test-Path -LiteralPath (Join-Path $profileRoot 'SingletonLock'))) { throw "The dedicated profile is already running or locked but its endpoint is unavailable. Close that profile's Chrome and retry; its data was left intact." }
    if (@(Get-NetTCPConnection -LocalPort 9222 -State Listen -ErrorAction SilentlyContinue).Count) { throw "Port 9222 is occupied. No browser was launched." }
    New-Item -ItemType Directory -Force -Path $profileRoot | Out-Null
    $arguments = @("--user-data-dir=`"$profileRoot`"", '--remote-debugging-port=9222', '--no-first-run', '--no-default-browser-check', 'about:blank')
    Start-Process -FilePath $chrome -ArgumentList $arguments -WindowStyle Normal
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        if (Test-Endpoint) { Assert-DedicatedOwner; Write-Host "Opened the dedicated LinkedIn window without navigation. Open LinkedIn manually when access is available."; exit 0 }
        Start-Sleep -Milliseconds 500
    }
    throw "Chrome opened, but its endpoint is unavailable. No second browser was launched."
} finally { $launchLock.Dispose() }
