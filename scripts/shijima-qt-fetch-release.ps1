$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path "$PSScriptRoot\.."
$qtRoot = Join-Path $repoRoot "tools\Shijima-Qt"
$binRoot = Join-Path $qtRoot "bin"
$zipPath = Join-Path $binRoot "Shijima-Qt-Windows.zip"
$extractRoot = Join-Path $binRoot "Shijima-Qt-Windows"

if (-not (Test-Path $qtRoot)) {
  throw "Shijima-Qt repository not found at $qtRoot"
}

New-Item -ItemType Directory -Force -Path $binRoot | Out-Null

$release = Invoke-RestMethod -Uri "https://api.github.com/repos/pixelomer/Shijima-Qt/releases/latest"
$asset = $release.assets | Where-Object {
  $_.name -match "windows" -and ($_.name -match "\.zip$" -or $_.name -match "\.7z$")
} | Select-Object -First 1

if (-not $asset) {
  throw "Could not find a Windows release archive in latest Shijima-Qt release."
}

$downloadUrl = $asset.browser_download_url
Write-Host "Downloading: $downloadUrl"
Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath

if (Test-Path $extractRoot) {
  Remove-Item -Recurse -Force $extractRoot
}
New-Item -ItemType Directory -Force -Path $extractRoot | Out-Null

if ($zipPath.ToLower().EndsWith(".zip")) {
  Expand-Archive -Force -Path $zipPath -DestinationPath $extractRoot
} else {
  throw "Downloaded archive is not a .zip. Please extract manually: $zipPath"
}

Write-Host "Shijima-Qt release extracted to: $extractRoot"
