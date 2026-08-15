param(
    [Parameter(Mandatory = $true)]
    [string]$InputDocx,
    [Parameter(Mandatory = $true)]
    [string]$OutputPdf
)

$word = $null
$document = $null
try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $document = $word.Documents.Open(
        [System.IO.Path]::GetFullPath($InputDocx),
        $false,
        $true,
        $false
    )
    $document.ExportAsFixedFormat(
        [System.IO.Path]::GetFullPath($OutputPdf),
        17,
        $false,
        0,
        0,
        1,
        1,
        0,
        $true,
        $true,
        0,
        $true,
        $true,
        $false
    )
}
finally {
    if ($null -ne $document) {
        $document.Close($false)
        [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($document)
    }
    if ($null -ne $word) {
        $word.Quit()
        [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($word)
    }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
