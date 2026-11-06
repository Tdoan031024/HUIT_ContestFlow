[CmdletBinding()]
param(
  [string]$OutputDirectory = '',
  [string]$MySqlDumpPath = $env:HCF_MYSQLDUMP_BIN
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$envFile = Join-Path $ProjectRoot '.env'
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $ProjectRoot 'backups' }

function Read-EnvValue([string]$Name) {
  $line = Get-Content -LiteralPath $envFile | Where-Object { $_ -match "^$([regex]::Escape($Name))=" } | Select-Object -First 1
  if (-not $line) { return $null }
  return $line.Substring($line.IndexOf('=') + 1).Trim().Trim('"')
}

if (-not (Test-Path -LiteralPath $envFile)) { throw 'Không tìm thấy .env. Hãy cấu hình DATABASE_URL trước.' }
$databaseUri = [uri](Read-EnvValue 'DATABASE_URL')
$credentials = $databaseUri.UserInfo.Split(':', 2)
$databaseUser = [uri]::UnescapeDataString($credentials[0])
$databasePassword = if ($credentials.Count -gt 1) { [uri]::UnescapeDataString($credentials[1]) } else { '' }
$databaseName = [uri]::UnescapeDataString($databaseUri.AbsolutePath.TrimStart('/'))
$databasePort = if ($databaseUri.IsDefaultPort) { 3306 } else { $databaseUri.Port }

if (-not $MySqlDumpPath) {
  $command = Get-Command mysqldump.exe -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($command) { $MySqlDumpPath = $command.Source }
  else {
    $install = Get-ChildItem -LiteralPath 'C:\Program Files\MySQL' -Directory -Filter 'MySQL Server *' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
    if ($install) { $MySqlDumpPath = Join-Path $install.FullName 'bin\mysqldump.exe' }
  }
}
if (-not $MySqlDumpPath -or -not (Test-Path -LiteralPath $MySqlDumpPath)) { throw 'Không tìm thấy mysqldump.exe. Đặt HCF_MYSQLDUMP_BIN tới tệp thực thi.' }

$resolvedOutput = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $resolvedOutput | Out-Null
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupPath = Join-Path $resolvedOutput "huit-contestflow-$timestamp.sql"
$previousPassword = $env:MYSQL_PWD
try {
  $env:MYSQL_PWD = $databasePassword
  & $MySqlDumpPath --protocol=TCP "--host=$($databaseUri.Host)" "--port=$databasePort" "--user=$databaseUser" '--default-character-set=utf8mb4' '--single-transaction' '--routines' '--triggers' '--hex-blob' '--no-tablespaces' "--result-file=$backupPath" $databaseName
  if ($LASTEXITCODE -ne 0) { throw "mysqldump kết thúc với mã lỗi $LASTEXITCODE." }
  $file = Get-Item -LiteralPath $backupPath
  if ($file.Length -lt 100) { throw 'Tệp backup quá nhỏ; hãy xác nhận cơ sở dữ liệu có thể truy cập.' }
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $stream = [System.IO.File]::OpenRead($backupPath)
  try { $hash = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '') }
  finally { $stream.Dispose(); $sha.Dispose() }
  Write-Output "Backup hoàn tất: $backupPath"
  Write-Output "Dung lượng: $($file.Length) byte · SHA-256: $hash"
} catch {
  Remove-Item -LiteralPath $backupPath -Force -ErrorAction SilentlyContinue
  throw
} finally {
  if ($null -eq $previousPassword) { Remove-Item Env:\MYSQL_PWD -ErrorAction SilentlyContinue } else { $env:MYSQL_PWD = $previousPassword }
}
