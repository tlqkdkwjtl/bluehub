# Snapshot updater - run locally before git push
# Usage: cd web  ->  .\update.ps1

$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
$parent = Split-Path $here -Parent

$keyFileItem = Get-ChildItem -LiteralPath $parent -Filter "*.txt" -File | Where-Object {
    try {
        $snippet = Get-Content $_.FullName -Raw -Encoding UTF8 -ErrorAction Stop
        ($snippet -match "opendart") -or ($snippet -match "apis\.data\.go\.kr")
    } catch { $false }
} | Select-Object -First 1

if (-not $keyFileItem) {
    Write-Host "[ERROR] API key txt not found." -ForegroundColor Red
    exit 1
}

$content = (Get-Content $keyFileItem.FullName -Raw -Encoding UTF8).TrimStart([char]0xFEFF)
$hex64 = [regex]::Matches($content, "[0-9a-fA-F]{64}")
$hex40 = [regex]::Matches($content, "[0-9a-fA-F]{40}")

$env:DATA_GO_KR_KEY = $hex64[0].Value
$env:DART_API_KEY = $hex40[$hex40.Count - 1].Value

Write-Host "[OK] Fetching API snapshots..." -ForegroundColor Green
Set-Location $here
python scripts/fetch_snapshots.py

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "[NEXT] git add data/ && git commit && git push" -ForegroundColor Cyan
}
