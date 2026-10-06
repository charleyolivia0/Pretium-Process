$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path "$PSScriptRoot\.."
$qtRoot = Join-Path $repoRoot "tools\Shijima-Qt"
$binRoot = Join-Path $qtRoot "bin\Shijima-Qt-Windows"
$exeCandidates = @(
  (Join-Path $qtRoot "Shijima-Qt.exe"),
  (Join-Path $qtRoot "release\Shijima-Qt.exe"),
  (Join-Path $qtRoot "build\Shijima-Qt.exe")
)

$releaseExes = Get-ChildItem -Path $binRoot -Filter "Shijima-Qt.exe" -Recurse -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty FullName
if ($releaseExes) {
  $exeCandidates = @($releaseExes) + $exeCandidates
}

$exe = $exeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $exe) {
  throw "Shijima-Qt.exe not found. Run: npm run companion:qt:build"
}

Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe -Parent)
Write-Host "Started Shijima-Qt: $exe"
