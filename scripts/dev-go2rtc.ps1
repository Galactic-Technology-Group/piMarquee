# Downloads go2rtc for Windows (once) and runs it with the development config.
# Usage:  .\scripts\dev-go2rtc.ps1 [-Version 1.9.14]
# Then start the app with `npm run dev` and add a camera in the admin UI.
# For a camera-less smoke test install ffmpeg (winget install Gyan.FFmpeg) and use this RTSP URL
# for a camera:   ffmpeg:virtual?video&size=1280x720&decimals=2#video=h264
param([string]$Version = "1.9.14")

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$dir = Join-Path $root "go2rtc"
$exe = Join-Path $dir "go2rtc.exe"

if (-not (Test-Path $exe)) {
  $zip = Join-Path $dir "go2rtc_win64.zip"
  $url = "https://github.com/AlexxIT/go2rtc/releases/download/v$Version/go2rtc_win64.zip"
  Write-Host "Downloading $url"
  Invoke-WebRequest -Uri $url -OutFile $zip
  Expand-Archive -Path $zip -DestinationPath $dir -Force
  Remove-Item $zip
}

Write-Host "Starting go2rtc on http://localhost:1984 (config: go2rtc/go2rtc.dev.yaml)"
& $exe -config (Join-Path $dir "go2rtc.dev.yaml")
