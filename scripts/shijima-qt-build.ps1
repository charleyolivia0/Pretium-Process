$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path "$PSScriptRoot\.."
$qtRoot = Join-Path $repoRoot "tools\Shijima-Qt"

if (-not (Test-Path $qtRoot)) {
  throw "Shijima-Qt repository not found at $qtRoot"
}

Push-Location $qtRoot
try {
  $docker = Get-Command docker -ErrorAction SilentlyContinue
  if ($docker) {
    docker build -t shijima-qt-dev dev-docker
    docker run --rm -e CONFIG=release -v "${qtRoot}:/work" shijima-qt-dev bash -c "mingw64-make -j8"
    Write-Host "Shijima-Qt build complete (Docker)."
  } else {
    Write-Host "Docker not found. Fetching prebuilt Windows release instead..."
    & powershell -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts\shijima-qt-fetch-release.ps1")
    Write-Host "Shijima-Qt ready from prebuilt release."
  }
} finally {
  Pop-Location
}
