$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$runtimeRoot = Join-Path $repositoryRoot ".runtime"
$processFile = Join-Path $runtimeRoot "processes.json"

if (-not (Test-Path -LiteralPath $processFile)) {
    Write-Host "No AIAD Apply local process record was found."
    exit 0
}

$recorded = Get-Content -LiteralPath $processFile -Raw | ConvertFrom-Json
if ([IO.Path]::GetFullPath($recorded.repository) -ne [IO.Path]::GetFullPath($repositoryRoot)) {
    throw "The process record does not belong to this repository."
}

function Get-DescendantProcessIds {
    param([int]$ParentId)

    $descendants = @()
    $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $ParentId")
    foreach ($child in $children) {
        $descendants += Get-DescendantProcessIds -ParentId $child.ProcessId
        $descendants += [int]$child.ProcessId
    }
    return $descendants
}

$rootIds = @($recorded.webPid, $recorded.workerPid) |
    Where-Object { $_ -and (Get-Process -Id $_ -ErrorAction SilentlyContinue) }

foreach ($rootId in $rootIds) {
    $descendants = @(Get-DescendantProcessIds -ParentId $rootId)
    foreach ($processId in $descendants) {
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
    Stop-Process -Id $rootId -Force -ErrorAction SilentlyContinue
}

Remove-Item -LiteralPath $processFile -Force
Write-Host "AIAD Apply local services stopped."
