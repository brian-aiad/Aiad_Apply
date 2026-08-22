$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$profileRoot = Join-Path $repositoryRoot ".runtime\chrome-linkedin-profile"
$debugEndpoint = "http://127.0.0.1:9222/json/version"
try {
    Invoke-WebRequest -UseBasicParsing -Uri $debugEndpoint -TimeoutSec 2 | Out-Null
    Write-Host "LinkedIn review Chrome is already available on port 9222."
    exit 0
}
catch {
    # Start the isolated profile below.
}

$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path -LiteralPath $chrome)) {
    throw "Google Chrome was not found at $chrome"
}

New-Item -ItemType Directory -Force -Path $profileRoot | Out-Null
$arguments = @(
    "--user-data-dir=$profileRoot"
    "--remote-debugging-port=9222"
    "--no-first-run"
    "--no-default-browser-check"
    "https://www.linkedin.com/jobs/"
)

Start-Process -FilePath $chrome -ArgumentList $arguments -WindowStyle Normal

for ($attempt = 0; $attempt -lt 20; $attempt++) {
    try {
        Invoke-WebRequest -UseBasicParsing -Uri $debugEndpoint -TimeoutSec 2 | Out-Null
        Write-Host "Opened the isolated LinkedIn review window. Sign in there if LinkedIn asks."
        exit 0
    }
    catch {
        Start-Sleep -Milliseconds 500
    }
}

throw "Chrome opened, but its debugging endpoint did not become ready on port 9222."
