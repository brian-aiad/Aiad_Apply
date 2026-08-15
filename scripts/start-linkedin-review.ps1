$ErrorActionPreference = "Stop"

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

$arguments = @(
    "--user-data-dir=C:\chrome-debug-linkedin"
    "--remote-debugging-port=9222"
    "--no-first-run"
    "--no-default-browser-check"
    "https://www.linkedin.com/jobs/"
)

Start-Process -FilePath $chrome -ArgumentList $arguments -WindowStyle Normal
Write-Host "Opened the isolated LinkedIn review window. Sign in there if LinkedIn asks."
