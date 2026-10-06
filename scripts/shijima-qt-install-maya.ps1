$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path "$PSScriptRoot\.."
$sourceMascot = Join-Path $repoRoot "tools\Shijima-Qt\MayaGirl.mascot"

if (-not (Test-Path $sourceMascot)) {
  throw "Source mascot not found. Run: npm run companion:qt:mascot:build"
}

$localAppData = $env:LOCALAPPDATA
if (-not $localAppData) {
  throw "LOCALAPPDATA is not set."
}

$targets = @(
  (Join-Path $localAppData "Shijima-Qt\mascots\MayaGirl.mascot"),
  (Join-Path $localAppData "pixelomer\Shijima-Qt\mascots\MayaGirl.mascot")
)

foreach ($target in $targets) {
  $parent = Split-Path $target -Parent
  New-Item -ItemType Directory -Force -Path $parent | Out-Null
  if (Test-Path $target) {
    Remove-Item -Recurse -Force $target
  }
  Copy-Item -Recurse -Force $sourceMascot $target
  Write-Host "Installed Maya mascot to: $target"
}
