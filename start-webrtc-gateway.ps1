$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $scriptDir

try {
  $hasDocker = $null -ne (Get-Command docker -ErrorAction SilentlyContinue)

  if ($hasDocker) {
    Write-Host 'Starting MediaMTX via Docker...' -ForegroundColor Cyan
    docker run --rm -it --name mediamtx-webrtc -p 8889:8889 -v "${scriptDir}/mediamtx.yml:/mediamtx.yml" bluenviron/mediamtx:latest
    exit $LASTEXITCODE
  }

  $hasMediaMtx = $null -ne (Get-Command mediamtx -ErrorAction SilentlyContinue)
  if ($hasMediaMtx) {
    Write-Host 'Starting MediaMTX binary...' -ForegroundColor Cyan
    mediamtx mediamtx.yml
    exit $LASTEXITCODE
  }

  Write-Host 'Neither Docker nor mediamtx binary was found.' -ForegroundColor Yellow
  Write-Host 'Install one of them, then run this script again.' -ForegroundColor Yellow
  exit 1
}
finally {
  Pop-Location
}
