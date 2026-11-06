[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$BackupFile,
  [Parameter(Mandatory = $true)][ValidatePattern('^[A-Za-z0-9_]+$')][string]$TargetDatabase,
  [Parameter(Mandatory = $true)][switch]$ConfirmTargetDatabaseReplacement,
  [string]$MySqlPath = $env:HCF_MYSQL_BIN
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$envFile = Join-Path $ProjectRoot '.env'

function Read-EnvValue([string]$Name) {
  $line = Get-Content -LiteralPath $envFile | Where-Object { $_ -match "^$([regex]::Escape($Name))=" } | Select-Object -First 1
  if (-not $line) { return $null }
  return $line.Substring($line.IndexOf('=') + 1).Trim().Trim('"')
}

if (-not $ConfirmTargetDatabaseReplacement) { throw 'Phục hồi sẽ thay thế các bảng trùng tên trong database đích. Chạy lại với -ConfirmTargetDatabaseReplacement sau khi kiểm tra backup và database.' }
if (-not (Test-Path -LiteralPath $BackupFile -PathType Leaf)) { throw 'Không tìm thấy tệp backup.' }
if (-not (Test-Path -LiteralPath $envFile)) { throw 'Không tìm thấy .env. Hãy cấu hình kết nối MySQL trước.' }
$backupPath = (Resolve-Path -LiteralPath $BackupFile).Path
$databaseUri = [uri](Read-EnvValue 'DATABASE_URL')
$credentials = $databaseUri.UserInfo.Split(':', 2)
$databaseUser = [uri]::UnescapeDataString($credentials[0])
$databasePassword = if ($credentials.Count -gt 1) { [uri]::UnescapeDataString($credentials[1]) } else { '' }
$databasePort = if ($databaseUri.IsDefaultPort) { 3306 } else { $databaseUri.Port }

if (-not $MySqlPath) {
  $command = Get-Command mysql.exe -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($command) { $MySqlPath = $command.Source }
  else {
    $install = Get-ChildItem -LiteralPath 'C:\Program Files\MySQL' -Directory -Filter 'MySQL Server *' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
    if ($install) { $MySqlPath = Join-Path $install.FullName 'bin\mysql.exe' }
  }
}
if (-not $MySqlPath -or -not (Test-Path -LiteralPath $MySqlPath)) { throw 'Không tìm thấy mysql.exe. Đặt HCF_MYSQL_BIN tới tệp thực thi.' }

$previousPassword = $env:MYSQL_PWD
try {
  $env:MYSQL_PWD = $databasePassword
  & node (Join-Path $PSScriptRoot 'mysql-import.mjs') $MySqlPath $databaseUri.Host $databasePort $databaseUser $TargetDatabase $backupPath
  if ($LASTEXITCODE -ne 0) { throw "Phục hồi MySQL thất bại với mã lỗi $LASTEXITCODE." }
  Write-Output "Phục hồi hoàn tất vào database: $TargetDatabase"
} finally {
  if ($null -eq $previousPassword) { Remove-Item Env:\MYSQL_PWD -ErrorAction SilentlyContinue } else { $env:MYSQL_PWD = $previousPassword }
}
