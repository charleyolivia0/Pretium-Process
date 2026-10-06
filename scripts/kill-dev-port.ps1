# Stops processes listening on the Vite dev port (default 5173).
param([int]$Port = 5173)

$listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if (-not $listeners) {
  Write-Host "Port $Port is free."
  exit 0
}

$pids = $listeners.OwningProcess | Sort-Object -Unique
foreach ($procId in $pids) {
  $name = (Get-Process -Id $procId -ErrorAction SilentlyContinue).ProcessName
  Write-Host "Stopping $name (PID $procId) on port $Port..."
  Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 1
$still = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($still) {
  Write-Error "Port $Port is still in use."
  exit 1
}
Write-Host "Port $Port is free."
