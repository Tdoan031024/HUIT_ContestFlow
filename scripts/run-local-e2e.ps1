$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$suffix = [guid]::NewGuid().ToString('N').Substring(0, 8)
$schema = "huit_contestflow_codex_e2e_$suffix"
$statePath = Join-Path ([System.IO.Path]::GetTempPath()) "hcf-e2e-state-$suffix.json"
$serverLog = Join-Path ([System.IO.Path]::GetTempPath()) "hcf-e2e-server-$suffix.log"
$serverErrorLog = Join-Path ([System.IO.Path]::GetTempPath()) "hcf-e2e-server-$suffix.err.log"
$server = $null
$databaseCreated = $false
$completed = $false
$oldDatabaseUrl = $env:DATABASE_URL
$oldSetupKey = $env:ADMIN_SETUP_KEY
$oldE2eDatabaseUrl = $env:HCF_E2E_DATABASE_URL
$oldE2eBaseUrl = $env:HCF_E2E_BASE_URL
$oldKeepData = $env:HCF_E2E_KEEP_DATA
$baseDatabaseLine = Get-Content -LiteralPath (Join-Path $ProjectRoot '.env') | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
if (-not $baseDatabaseLine) { throw 'Missing DATABASE_URL in local .env.' }
$baseDatabaseUrl = $baseDatabaseLine.Substring($baseDatabaseLine.IndexOf('=') + 1).Trim().Trim('"')

try {
  $env:HCF_E2E_SCHEMA = $schema
  $env:HCF_E2E_STATE_FILE = $statePath
  Remove-Item Env:\DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:\HCF_E2E_DATABASE_URL -ErrorAction SilentlyContinue
  & node --env-file=.env scripts/local-e2e-database.mjs ensure
  if ($LASTEXITCODE -ne 0) { throw 'Failed to create isolated E2E database.' }
  $databaseCreated = $true
  $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
  $env:DATABASE_URL = $state.databaseUrl
  $setupLine = Get-Content -LiteralPath (Join-Path $ProjectRoot '.env') | Where-Object { $_ -match '^ADMIN_SETUP_KEY=' } | Select-Object -First 1
  if (-not $setupLine) { throw 'Missing ADMIN_SETUP_KEY in local .env.' }
  $env:ADMIN_SETUP_KEY = $setupLine.Substring($setupLine.IndexOf('=') + 1).Trim().Trim('"')

  & npx prisma migrate deploy
  if ($LASTEXITCODE -ne 0) { throw 'Prisma migrations failed on the isolated E2E database.' }
  & node --env-file=.env scripts/local-e2e-database.mjs mark
  if ($LASTEXITCODE -ne 0) { throw 'Failed to mark the isolated E2E database.' }

  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
  $listener.Start()
  $port = $listener.LocalEndpoint.Port
  $listener.Stop()
  $baseUrl = "http://127.0.0.1:$port"
  $nextEntrypoint = Join-Path $ProjectRoot 'node_modules/next/dist/bin/next'
  $server = Start-Process -FilePath (Get-Command node).Source -ArgumentList @($nextEntrypoint, 'start', '--hostname', '127.0.0.1', '--port', [string]$port) -WorkingDirectory $ProjectRoot -RedirectStandardOutput $serverLog -RedirectStandardError $serverErrorLog -WindowStyle Hidden -PassThru

  $health = $null
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    Start-Sleep -Seconds 1
    try {
      $health = Invoke-RestMethod -Uri "$baseUrl/api/health" -TimeoutSec 3
      if ($health.status -eq 'ok' -and $health.database -eq 'ok') { break }
    } catch { }
  }
  if (-not $health -or $health.status -ne 'ok' -or $health.database -ne 'ok') {
    if (Test-Path -LiteralPath $serverLog) { Get-Content -LiteralPath $serverLog -Tail 60 }
    if (Test-Path -LiteralPath $serverErrorLog) { Get-Content -LiteralPath $serverErrorLog -Tail 60 }
    throw 'E2E application or database did not become ready.'
  }

  $env:HCF_E2E_DATABASE_URL = $state.databaseUrl
  $env:HCF_E2E_BASE_URL = $baseUrl
  $env:HCF_E2E_KEEP_DATA = '1'
  & (Join-Path $PSScriptRoot 'e2e-check.ps1')
  $completed = $true
  Write-Output "LOCAL E2E SERVER PID: $($server.Id)"
  Write-Output "LOCAL E2E SERVER URL: $baseUrl"
  Write-Output "LOCAL E2E SCHEMA: $schema"
  Write-Output "LOCAL E2E STATE: $statePath"
  Write-Output "LOCAL E2E SERVER LOG: $serverLog"
  Write-Output "LOCAL E2E SERVER ERROR LOG: $serverErrorLog"
} finally {
  if (-not $completed) {
    if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
    if ($databaseCreated) {
      $env:DATABASE_URL = $baseDatabaseUrl
      & node --env-file=.env scripts/local-e2e-database.mjs drop
      Remove-Item -LiteralPath $statePath -Force -ErrorAction SilentlyContinue
    }
  }
  foreach ($name in @('DATABASE_URL','ADMIN_SETUP_KEY','HCF_E2E_DATABASE_URL','HCF_E2E_BASE_URL','HCF_E2E_KEEP_DATA','HCF_E2E_SCHEMA','HCF_E2E_STATE_FILE')) {
    $oldValue = switch ($name) {
      'DATABASE_URL' { $oldDatabaseUrl }
      'ADMIN_SETUP_KEY' { $oldSetupKey }
      'HCF_E2E_DATABASE_URL' { $oldE2eDatabaseUrl }
      'HCF_E2E_BASE_URL' { $oldE2eBaseUrl }
      'HCF_E2E_KEEP_DATA' { $oldKeepData }
      default { $null }
    }
    $environmentPath = Join-Path 'Env:' $name
    if ($null -eq $oldValue) { Remove-Item $environmentPath -ErrorAction SilentlyContinue } else { Set-Item $environmentPath $oldValue }
  }
}
