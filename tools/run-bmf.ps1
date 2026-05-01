<#
Run the BMF parity harness end-to-end (PowerShell helper).

Usage:
  .\tools\run-bmf.ps1 [-StartServer] [-Port 8081]

This script tries to:
 - ensure Node is available (prints instructions if missing)
 - optionally start the Java HTTP wrapper in the background
 - run the vitest harness with CLI+HTTP enabled
#>

param(
    [switch]$StartServer,
    [int]$Port = 8081
)

function NodeExists {
    try { return (Get-Command node -ErrorAction Stop) -ne $null } catch { return $false }
}

if (-not (NodeExists)) {
    Write-Host "Node.js (node) is not available on PATH. Please install Node LTS and re-open PowerShell." -ForegroundColor Yellow
    Write-Host "Recommended: winget install OpenJS.NodeJS.LTS -e --source winget" -ForegroundColor Gray
    exit 2
}

$java = 'C:\Users\janli\jdk21\java-21-openjdk-21.0.4.0.7-1.win.jdk.x86_64\bin\java.exe'

if ($StartServer) {
    $cp = "tools/lohnservice/lohnservice-server.jar;tools/lohnservice/lohnpap-local.jar;tools/lohnservice"
    Write-Host "Starting LoServiceServer on port $Port..."
    Start-Process -WindowStyle Hidden -FilePath $java -ArgumentList '-cp', $cp, 'LoServiceServer', "$Port"
    Start-Sleep -Seconds 1
}

# Set env for the harness
[System.Environment]::SetEnvironmentVariable('LOHSERVICE','1','Process') | Out-Null
[System.Environment]::SetEnvironmentVariable('LOHSERVICE_HTTP','1','Process') | Out-Null
[System.Environment]::SetEnvironmentVariable('LOHSERVICE_HTTP_PORT', [string]$Port,'Process') | Out-Null
if (Test-Path $java) {
    [System.Environment]::SetEnvironmentVariable('LOHSERVICE_JAVA_CMD', $java,'Process') | Out-Null
}

# Ensure node_modules/.bin exists
$vitestCmd = Join-Path -Path $PSScriptRoot -ChildPath '..\node_modules\.bin\vitest.cmd'
if (-not (Test-Path $vitestCmd)) {
    Write-Host "vitest not installed locally. Run 'npm install' in project root first." -ForegroundColor Yellow
    exit 3
}

# Run the harness
Write-Host "Running vitest harness (CLI + HTTP enabled)..."
& $vitestCmd run --dir src/lib --reporter verbose
