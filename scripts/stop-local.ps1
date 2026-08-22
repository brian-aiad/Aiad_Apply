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

function Assert-AiadApplyProcess {
    param([int]$ProcessId)

    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction Stop
    $commandLine = [string]$process.CommandLine
    $belongsToRepository = $commandLine.IndexOf(
        $repositoryRoot,
        [StringComparison]::OrdinalIgnoreCase
    ) -ge 0
    $hasExpectedCommand = $commandLine -match "npm\s+run\s+dev|aiadapplyv2\s+worker"
    if (-not $belongsToRepository -or -not $hasExpectedCommand) {
        throw "Refusing to stop PID $ProcessId because it is not an AIAD Apply process from this repository."
    }
}

$rootIds = @($recorded.webPid, $recorded.workerPid) |
    Where-Object { $_ -and (Get-Process -Id $_ -ErrorAction SilentlyContinue) } |
    ForEach-Object { [int]$_ }

# Validate every recorded root before terminating any process.
foreach ($rootId in $rootIds) {
    Assert-AiadApplyProcess -ProcessId $rootId
}

foreach ($rootId in $rootIds) {
    $descendants = @(Get-DescendantProcessIds -ParentId $rootId)
    foreach ($processId in $descendants) {
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
    Stop-Process -Id $rootId -Force -ErrorAction SilentlyContinue
}

Remove-Item -LiteralPath $processFile -Force
Write-Host "AIAD Apply local services stopped."
