param(
  [int]$RestartDelaySeconds = 3,
  [string]$LogFile = "./runtime/ws-stream-bridge.log"
)

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
Set-Location -Path $root

$logDir = Split-Path -Parent $LogFile
if (-not [string]::IsNullOrWhiteSpace($logDir) -and -not (Test-Path $logDir)) {
  New-Item -Path $logDir -ItemType Directory -Force | Out-Null
}

Write-Output "[ws-supervisor] cwd: $root"
Write-Output "[ws-supervisor] log: $LogFile"
Write-Output "[ws-supervisor] press Ctrl+C to stop"

while ($true) {
  $startAt = Get-Date
  $startLine = "[{0}] [ws-supervisor] starting ws bridge" -f $startAt.ToString("yyyy-MM-dd HH:mm:ss")
  Write-Output $startLine
  $startLine | Out-File -FilePath $LogFile -Encoding utf8 -Append

  try {
    node scripts/ws-stream-bridge.mjs 2>&1 | Tee-Object -FilePath $LogFile -Append
    $exitCode = $LASTEXITCODE
  } catch {
    $exitCode = -1
    $errLine = "[{0}] [ws-supervisor] unexpected error: {1}" -f (Get-Date).ToString("yyyy-MM-dd HH:mm:ss"), $_
    Write-Output $errLine
    $errLine | Out-File -FilePath $LogFile -Encoding utf8 -Append
  }

  $stopLine = "[{0}] [ws-supervisor] bridge exited code={1}, restart in {2}s" -f (Get-Date).ToString("yyyy-MM-dd HH:mm:ss"), $exitCode, $RestartDelaySeconds
  Write-Output $stopLine
  $stopLine | Out-File -FilePath $LogFile -Encoding utf8 -Append

  Start-Sleep -Seconds $RestartDelaySeconds
}
