$DesktopPath = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $DesktopPath "Aegis Tactical Comm.lnk"
$AppUrl = "http://localhost:3000"
$IconPath = Join-Path $PSScriptRoot "public\aegis-icon.png"

# Detect Browser
$BrowserPath = "msedge.exe"
if (Test-Path "C:\Program Files\Google\Chrome\Application\chrome.exe") {
    $BrowserPath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
}

# Create Shortcut
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $BrowserPath
$Shortcut.Arguments = "--app=$AppUrl"
$Shortcut.Description = "Aegis Tactical Comm - Emergency PTT"
$Shortcut.IconLocation = "$PSScriptRoot\public\aegis-icon.png"
$Shortcut.Save()

Write-Host "--------------------------------------------------"
Write-Host "   AEGIS TACTICAL COMM: DEPLOYMENT SUCCESSFUL   " -ForegroundColor Cyan
Write-Host "--------------------------------------------------"
Write-Host "Shortcut created on Desktop."
Write-Host "Target URL: $AppUrl"
Write-Host "--------------------------------------------------"
