# Local dev launcher (laptop only)
# Usage: cd web  ->  .\start.ps1
# Reads API keys from a txt file in the parent folder (e.g. data key file).

$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
$parent = Split-Path $here -Parent

$keyFileItem = Get-ChildItem -LiteralPath $parent -Filter "*.txt" -File | Where-Object {
    try {
        $snippet = Get-Content $_.FullName -Raw -Encoding UTF8 -ErrorAction Stop
        ($snippet -match "opendart") -or ($snippet -match "apis\.data\.go\.kr")
    } catch {
        $false
    }
} | Select-Object -First 1

if (-not $keyFileItem) {
    Write-Host "[ERROR] API key txt not found in parent folder." -ForegroundColor Red
    Write-Host "Folder: $parent"
    exit 1
}

$content = Get-Content $keyFileItem.FullName -Raw -Encoding UTF8
$content = $content.TrimStart([char]0xFEFF)

$hex64 = [regex]::Matches($content, "[0-9a-fA-F]{64}")
$hex40 = [regex]::Matches($content, "[0-9a-fA-F]{40}")

if ($hex64.Count -lt 1) {
    Write-Host "[ERROR] data.go.kr key (64 hex) not found." -ForegroundColor Red
    exit 1
}
if ($hex40.Count -lt 1) {
    Write-Host "[ERROR] DART key (40 hex) not found." -ForegroundColor Red
    exit 1
}

$env:DATA_GO_KR_KEY = $hex64[0].Value
$env:DART_API_KEY = $hex40[$hex40.Count - 1].Value

Write-Host "[OK] Keys loaded from: $($keyFileItem.Name)" -ForegroundColor Green
Write-Host "     DART_API_KEY length: $($env:DART_API_KEY.Length)"
Write-Host "     DATA_GO_KR_KEY length: $($env:DATA_GO_KR_KEY.Length)"
Write-Host ""
Write-Host "Server: http://localhost:8765/" -ForegroundColor Cyan
Write-Host "Stop: Ctrl+C"
Write-Host ""

Set-Location $here
python server.py
