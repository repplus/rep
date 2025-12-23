# PowerShell script for Windows users to create Chrome Web Store package
# Usage: .\scripts\package.ps1

$ErrorActionPreference = "Stop"

$zipName = "rep-plus-extension.zip"
# Get all files and explicitly exclude directories and files
$excludeDirs = @("tests", "node_modules", "scripts", ".git", "dist", "build", "coverage", ".nyc_output", "temp")
$excludeFiles = @("package.json", "package-lock.json", "vitest.config.js", ".gitignore", "ARCHITECTURE_REVIEW.md", "CONTRIBUTING.md", "rep-plus-extension.zip")
$excludePatterns = @("*.test.js", "*.spec.js", "*.log", "*.tmp", ".DS_Store")

Write-Host "📦 Creating production package for Chrome Web Store...`n" -ForegroundColor Cyan

# Remove old zip if exists
if (Test-Path $zipName) {
    Write-Host "Removing existing $zipName..." -ForegroundColor Yellow
    Remove-Item $zipName
}

# Get all files to include, explicitly excluding directories
$filesToInclude = Get-ChildItem -Recurse -File | Where-Object {
    $fullPath = $_.FullName
    $relativePath = $_.FullName.Replace((Get-Location).Path + "\", "").Replace((Get-Location).Path + "/", "")
    
    # Check if file is in excluded directory
    $inExcludedDir = $false
    foreach ($dir in $excludeDirs) {
        if ($relativePath -like "$dir\*" -or $relativePath -like "$dir/*" -or $relativePath.StartsWith("$dir\")) {
            $inExcludedDir = $true
            break
        }
    }
    if ($inExcludedDir) { return $false }
    
    # Check if file name matches exclude patterns
    foreach ($pattern in $excludePatterns) {
        if ($_.Name -like $pattern) {
            return $false
        }
    }
    
    # Check if file is in exclude list
    if ($excludeFiles -contains $_.Name) {
        return $false
    }
    
    return $true
}

Write-Host "Packaging files..." -ForegroundColor Yellow

# Create zip using Compress-Archive
$filesToInclude | Compress-Archive -DestinationPath $zipName -Force

$size = (Get-Item $zipName).Length / 1MB
Write-Host "`n✅ Package created: $zipName ($([math]::Round($size, 2)) MB)" -ForegroundColor Green
Write-Host "`n📋 Excluded from package:" -ForegroundColor Cyan
Write-Host "   - Test files (tests/, *.test.js, *.spec.js)"
Write-Host "   - Dev dependencies (node_modules/, package.json)"
Write-Host "   - Build config (vitest.config.js)"
Write-Host "   - Git files (.git/, .gitignore)"
Write-Host "   - Documentation (CONTRIBUTING.md, ARCHITECTURE_REVIEW.md)"
Write-Host "`n🚀 Ready to upload to Chrome Web Store!" -ForegroundColor Green


