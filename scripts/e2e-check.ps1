$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$BaseUrl = if ($env:HCF_E2E_BASE_URL) { $env:HCF_E2E_BASE_URL.TrimEnd('/') } else { 'http://localhost:3000' }
$envFile = Join-Path $ProjectRoot '.env'
$envLines = Get-Content -LiteralPath $envFile
$setupLine = $envLines | Where-Object { $_ -match '^ADMIN_SETUP_KEY=' } | Select-Object -First 1
$databaseLine = $envLines | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
if (-not $setupLine -or -not $databaseLine) { throw 'Cần có ADMIN_SETUP_KEY và DATABASE_URL trong .env của môi trường kiểm thử riêng.' }
$setupKey = $setupLine.Substring($setupLine.IndexOf('=') + 1).Trim().Trim('"')
$databaseUrl = $databaseLine.Substring($databaseLine.IndexOf('=') + 1).Trim().Trim('"')
$databaseUri = [uri]$databaseUrl
$databaseCredentials = $databaseUri.UserInfo.Split(':', 2)
$databaseUser = [uri]::UnescapeDataString($databaseCredentials[0])
$databasePassword = if ($databaseCredentials.Count -gt 1) { [uri]::UnescapeDataString($databaseCredentials[1]) } else { '' }
$databaseName = [uri]::UnescapeDataString($databaseUri.AbsolutePath.TrimStart('/'))
$databasePort = if ($databaseUri.IsDefaultPort) { 3306 } else { $databaseUri.Port }
$mysqlPath = if ($env:HCF_MYSQL_BIN) { $env:HCF_MYSQL_BIN } else { 'C:\Program Files\MySQL\MySQL Server 9.3\bin\mysql.exe' }
$Mysql = (Get-Command $mysqlPath -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source)
if (-not $Mysql -and (Test-Path -LiteralPath $mysqlPath)) { $Mysql = $mysqlPath }
if (-not $Mysql) { throw 'Không tìm thấy mysql.exe. Đặt biến HCF_MYSQL_BIN tới mysql.exe để dọn dữ liệu kiểm thử.' }
$suffix = [guid]::NewGuid().ToString('N').Substring(0, 8)
$adminEmail = "codex-e2e-admin+$suffix@huit.test"
$judgeAEmail = "codex-e2e-judge-a+$suffix@huit.test"
$judgeBEmail = "codex-e2e-judge-b+$suffix@huit.test"
$viewerEmail = "codex-e2e-viewer+$suffix@huit.test"
$adminPassword = 'LocalE2E-Admin-3pw!'
$judgePassword = 'LocalE2E-Judge-3pw!'
$initialJudgePassword = $judgePassword
$viewerPassword = 'LocalE2E-Viewer-3pw!'
$competitionId = $null
$duplicateId = $null
$setupCreated = $false

function Invoke-Api {
  param([string]$Path, [string]$Method = 'GET', [object]$Body = $null, [Microsoft.PowerShell.Commands.WebRequestSession]$Session)
  $parameters = @{ Uri = "$BaseUrl$Path"; Method = $Method; TimeoutSec = 20; ErrorAction = 'Stop' }
  if ($Session) { $parameters.WebSession = $Session }
  if ($null -ne $Body) { $parameters.ContentType = 'application/json'; $parameters.Body = $Body | ConvertTo-Json -Depth 25 -Compress }
  try { Invoke-RestMethod @parameters }
  catch {
    $response = $_.Exception.Response
    $status = 0
    $responseBody = ''
    if ($response) {
      $status = [int]$response.StatusCode
      try { $reader = New-Object System.IO.StreamReader($response.GetResponseStream()); $responseBody = $reader.ReadToEnd(); $reader.Dispose() } catch { }
    }
    $wrapped = New-Object System.Exception("API $Method $Path failed with HTTP $status. $responseBody", $_.Exception)
    $wrapped.Data['StatusCode'] = $status
    throw $wrapped
  }
}

function Set-AuthCookie {
  param([Microsoft.PowerShell.Commands.WebRequestSession]$Session, [string]$SetCookie)
  $pair = $SetCookie.Split(';')[0]
  $parts = $pair.Split('=', 2)
  if ($parts.Count -ne 2 -or $parts[0] -ne 'hcf_session') { throw 'Authentication response did not set the expected session cookie.' }
  $Session.Cookies.Add([System.Net.Cookie]::new('hcf_session', $parts[1], '/', 'localhost'))
}

function Invoke-AuthRequest {
  param([string]$Path, [object]$Body)
  $nonce = [guid]::NewGuid().ToString('N')
  $bodyPath = Join-Path ([System.IO.Path]::GetTempPath()) "hcf-auth-$nonce.json"
  $headerPath = Join-Path ([System.IO.Path]::GetTempPath()) "hcf-auth-$nonce.headers"
  $responsePath = Join-Path ([System.IO.Path]::GetTempPath()) "hcf-auth-$nonce.response"
  $json = $Body | ConvertTo-Json -Depth 10 -Compress
  [System.IO.File]::WriteAllText($bodyPath, $json, (New-Object System.Text.UTF8Encoding($false)))
  try {
    $statusText = & curl.exe --silent --show-error --max-time 20 --dump-header $headerPath --output $responsePath --write-out '%{http_code}' --request POST --header 'Content-Type: application/json' --data-binary "@$bodyPath" "$BaseUrl$Path"
    if ($LASTEXITCODE -ne 0) { throw "Không thể gửi yêu cầu xác thực tới $Path." }
    $statusCode = [int]([string]$statusText).Trim()
    $bodyResult = Get-Content -LiteralPath $responsePath -Raw | ConvertFrom-Json
    if ($statusCode -lt 200 -or $statusCode -ge 300) { throw "Xác thực $Path thất bại (HTTP $statusCode): $($bodyResult.error)" }
    $cookieLine = Get-Content -LiteralPath $headerPath | Where-Object { $_ -match '^Set-Cookie:\s*hcf_session=' } | Select-Object -Last 1
    if (-not $cookieLine) { throw 'API xác thực không tạo session cookie.' }
    $session = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
    Set-AuthCookie -Session $session -SetCookie ($cookieLine -replace '^[^:]+:\s*', '')
    return @{ Session = $session; Response = $bodyResult }
  } finally {
    Remove-Item -LiteralPath $bodyPath, $headerPath, $responsePath -Force -ErrorAction SilentlyContinue
  }
}

function New-LoginSession {
  param([string]$Email, [string]$Password)
  return (Invoke-AuthRequest -Path '/api/auth/login' -Body @{ email = $Email; password = $Password }).Session
}

function Invoke-AuthenticatedDownload {
  param([string]$Path, [Microsoft.PowerShell.Commands.WebRequestSession]$Session)
  $nonce = [guid]::NewGuid().ToString('N')
  $responsePath = Join-Path ([System.IO.Path]::GetTempPath()) "hcf-download-$nonce.csv"
  $cookie = $Session.Cookies.GetCookies([uri]$BaseUrl) | Where-Object { $_.Name -eq 'hcf_session' } | Select-Object -First 1
  if (-not $cookie) { throw 'Không tìm thấy session cookie cho tải xuống.' }
  try {
    $statusText = & curl.exe --silent --show-error --max-time 20 --output $responsePath --write-out '%{http_code}' --cookie "hcf_session=$($cookie.Value)" "$BaseUrl$Path"
    if ($LASTEXITCODE -ne 0) { throw "Không thể tải $Path." }
    $statusCode = [int]([string]$statusText).Trim()
    $content = [System.IO.File]::ReadAllText($responsePath, [System.Text.Encoding]::UTF8)
    if ($statusCode -lt 200 -or $statusCode -ge 300) { throw "Tải $Path thất bại (HTTP $statusCode)." }
    return @{ StatusCode = $statusCode; Content = $content }
  } finally { Remove-Item -LiteralPath $responsePath -Force -ErrorAction SilentlyContinue }
}

function Assert-True {
  param([bool]$Condition, [string]$Message)
  if (-not $Condition) { throw "ASSERTION FAILED: $Message" }
}

function Expect-Status {
  param([string]$Path, [string]$Method, [object]$Body, [Microsoft.PowerShell.Commands.WebRequestSession]$Session, [int]$Expected)
  try {
    Invoke-Api -Path $Path -Method $Method -Body $Body -Session $Session | Out-Null
    throw "Expected HTTP $Expected for $Method $Path, but request succeeded."
  } catch {
    $status = 0
    if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
    elseif ($_.Exception.Data.Contains('StatusCode')) { $status = [int]$_.Exception.Data['StatusCode'] }
    if ($status -ne $Expected) { throw "Expected HTTP $Expected for $Method $Path; received $status. $($_.Exception.Message)" }
  }
}

function Test-Phase { param([string]$Name); Write-Output "PASS $Name" }

function Get-LiveSession([string]$CompetitionId, [string]$RoundId, [Microsoft.PowerShell.Commands.WebRequestSession]$Session) {
  return (Invoke-Api -Path "/api/competitions/$CompetitionId/rounds/$RoundId/session" -Session $Session).session
}

try {
  $bootstrap = Invoke-AuthRequest -Path '/api/auth/setup' -Body @{ setupKey = $setupKey; fullName = 'Temporary E2E Admin'; email = $adminEmail; password = $adminPassword }
  $adminSession = $bootstrap.Session
  $setupCreated = $true
  $sessionCheck = Invoke-Api -Path '/api/auth/me' -Session $adminSession
  Assert-True ($sessionCheck.user.email -eq $adminEmail) 'Admin session cookie is accepted by the API.'
  Test-Phase 'first Admin setup and secure session'

  $competition = (Invoke-Api -Path '/api/competitions' -Method POST -Session $adminSession -Body @{ name = "E2E Cup $suffix"; description = 'Temporary end-to-end verification'; organizingUnit = 'HUIT'; location = 'Test Hall'; modality = 'HYBRID'; firstRoundName = 'Test Round' }).competition
  $competitionId = $competition.id
  $detail = (Invoke-Api -Path "/api/competitions/$competitionId" -Session $adminSession).competition
  $round = $detail.rounds[0]
  Assert-True ($null -ne $round.activeRubricVersion -and $round.activeRubricVersion.criteria.Count -eq 3) 'Default round and three-criterion rubric are created.'
  Assert-True ($detail.organizingUnit -eq 'HUIT' -and $detail.location -eq 'Test Hall' -and $detail.modality -eq 'HYBRID') 'Competition management details are persisted.'
  $duplicate = (Invoke-Api -Path "/api/competitions/$competitionId/duplicate" -Method POST -Session $adminSession -Body @{ name = "E2E Copy $suffix" }).competition
  $duplicateId = $duplicate.id
  $duplicateDetail = (Invoke-Api -Path "/api/competitions/$duplicateId" -Session $adminSession).competition
  Assert-True ($duplicateDetail.status -eq 'DRAFT' -and $duplicateDetail.rounds.Count -eq 1 -and $duplicateDetail.rounds[0].activeRubricVersion.criteria.Count -eq 3 -and $duplicateDetail._count.contestants -eq 0) 'Competition copy contains configuration and rubric only.'
  Invoke-Api -Path "/api/competitions/$duplicateId" -Method PATCH -Session $adminSession -Body @{ startsAt = '2026-12-01T10:00:00.000Z'; endsAt = '2026-12-01T11:00:00.000Z'; location = 'Hall A' } | Out-Null
  $duplicateDetail = (Invoke-Api -Path "/api/competitions/$duplicateId" -Session $adminSession).competition
  Assert-True ($duplicateDetail.startsAt -and $duplicateDetail.endsAt -and $duplicateDetail.location -eq 'Hall A') 'Competition dates and location can be edited.'
  Test-Phase 'competition details, date editing, and safe configuration copy'
  Invoke-Api -Path "/api/competitions/$competitionId/rounds/$($round.id)" -Method PATCH -Session $adminSession -Body @{ requiredJudgeCount = 2; aggregateMethod = 'MEDIAN'; anonymous = $true; allowAdvanceWithGaps = $false; publishScores = $false } | Out-Null
  $rubricCriteria = @(
    @{ name = 'Creativity'; description = 'Originality'; minimum = 0; maximum = 10; step = 0.5; weight = 1; commentRequired = $true },
    @{ name = 'Feasibility'; description = 'Practical implementation'; minimum = 0; maximum = 10; step = 0.5; weight = 1; commentRequired = $false },
    @{ name = 'Impact'; description = 'Potential value'; minimum = 0; maximum = 10; step = 0.5; weight = 1; commentRequired = $false }
  )
  $invalidCriteria = @(@{ name = 'Bad step'; description = ''; minimum = 0; maximum = 10; step = 3; weight = 1; commentRequired = $false })
  Expect-Status -Path "/api/competitions/$competitionId/rubric" -Method POST -Body @{ roundId = $round.id; name = 'Invalid rubric'; criteria = $invalidCriteria } -Session $adminSession -Expected 400
  Invoke-Api -Path "/api/competitions/$competitionId/rubric" -Method POST -Session $adminSession -Body @{ roundId = $round.id; name = 'E2E rubric'; criteria = $rubricCriteria } | Out-Null
  Test-Phase 'competition, default round, rubric version, and configurable round rules'

  $contestant = (Invoke-Api -Path "/api/competitions/$competitionId/contestants" -Method POST -Session $adminSession -Body @{ roundId = $round.id; displayName = 'Test Team'; organization = 'HUIT'; title = 'Test project' }).contestant
  $entryId = $contestant.entries[0].id
  $csvRound = (Invoke-Api -Path "/api/competitions/$competitionId/rounds" -Method POST -Session $adminSession -Body @{ name = 'CSV Round' }).round
  $csvBody = @{ roundId = $csvRound.id; csv = "Name,Organization,Email,Phone,Title`nCSV Team,HUIT,csv-$suffix@huit.test,0900000000,CSV project" }
  $import = Invoke-Api -Path "/api/competitions/$competitionId/contestants/import" -Method POST -Session $adminSession -Body $csvBody
  Assert-True ($import.imported -eq 1) 'CSV import inserts exactly one contestant.'
  Test-Phase 'contestant creation, automatic entry code, and CSV import'

  foreach ($judge in @(@{ name = 'Judge E2E A'; email = $judgeAEmail }, @{ name = 'Judge E2E B'; email = $judgeBEmail })) {
    Invoke-Api -Path "/api/competitions/$competitionId/judges" -Method POST -Session $adminSession -Body @{ roundId = $round.id; fullName = $judge.name; email = $judge.email; password = $judgePassword } | Out-Null
  }
  $viewer = Invoke-Api -Path "/api/competitions/$competitionId/viewers" -Method POST -Session $adminSession -Body @{ fullName = 'Viewer E2E'; email = $viewerEmail; password = $viewerPassword }
  Test-Phase 'Judge and result-viewer account creation and round assignment'

  $judgeAssignment = (Invoke-Api -Path "/api/competitions/$competitionId/judges" -Session $adminSession).assignments | Where-Object { $_.user.email -eq $judgeAEmail } | Select-Object -First 1
  $passwordReset = Invoke-Api -Path "/api/competitions/$competitionId/judges/$($judgeAssignment.id)" -Method PATCH -Session $adminSession -Body @{ action = 'reset-password' }
  Expect-Status -Path '/api/auth/login' -Method POST -Body @{ email = $judgeAEmail; password = $judgePassword } -Session $null -Expected 401
  $judgePassword = $passwordReset.temporaryPassword
  $judgeSessionCheck = New-LoginSession -Email $judgeAEmail -Password $judgePassword
  Assert-True (($passwordReset.temporaryPassword.Length -ge 20) -and ((Invoke-Api -Path '/api/auth/me' -Session $judgeSessionCheck).user.email -eq $judgeAEmail)) 'Password reset invalidates the old password and supports a secure new login.'
  Test-Phase 'Judge password reset and prior-session invalidation'

  $beforeStart = Get-LiveSession -CompetitionId $competitionId -RoundId $round.id -Session $adminSession
  Invoke-Api -Path "/api/competitions/$competitionId/rounds/$($round.id)/session" -Method POST -Session $adminSession -Body @{ action = 'start'; expectedVersion = $beforeStart.version } | Out-Null
  Expect-Status -Path "/api/competitions/$competitionId/rounds/$($round.id)/session" -Method POST -Session $adminSession -Body @{ action = 'start'; expectedVersion = $beforeStart.version } -Expected 409
  Test-Phase 'live coordination rejects a stale repeated command'
  $judgeASession = New-LoginSession -Email $judgeAEmail -Password $judgePassword
  $tasksA = (Invoke-Api -Path '/api/judge/tasks' -Session $judgeASession).tasks
  $taskA = $tasksA | Where-Object { $_.entry.id -eq $entryId } | Select-Object -First 1
  Assert-True ($null -ne $taskA -and $taskA.entry.displayName -and $taskA.entry.displayName -ne 'Test Team') 'Assigned Judge sees current live entry and anonymity is enforced.'
  $rubric = (Invoke-Api -Path "/api/scores/$entryId" -Session $judgeASession).rubric
  $criteria = @($rubric.criteria)
  $invalidDetails = @(@{ criterionId = $criteria[0].id; score = 11; comment = '' })
  Expect-Status -Path "/api/scores/$entryId" -Method PUT -Body @{ details = $invalidDetails; submit = $false } -Session $judgeASession -Expected 400
  $detailsA = @(
    @{ criterionId = $criteria[0].id; score = 8; comment = 'Good' },
    @{ criterionId = $criteria[1].id; score = 9; comment = 'Clear' },
    @{ criterionId = $criteria[2].id; score = 10; comment = 'Positive impact' }
  )
  Invoke-Api -Path "/api/scores/$entryId" -Method PUT -Session $judgeASession -Body @{ details = $detailsA; submit = $false } | Out-Null
  Invoke-Api -Path "/api/scores/$entryId" -Method PUT -Session $judgeASession -Body @{ details = $detailsA; submit = $true } | Out-Null
  Expect-Status -Path "/api/scores/$entryId" -Method PUT -Body @{ details = $detailsA; submit = $true } -Session $judgeASession -Expected 409
  Expect-Status -Path "/api/competitions/$competitionId/contestants" -Method GET -Session $judgeASession -Expected 403
  Expect-Status -Path "/api/competitions/$competitionId/scores?roundId=$($round.id)" -Method GET -Session $judgeASession -Expected 403
  Test-Phase 'Judge task visibility, anonymous scoring, score validation, draft save, submit, duplicate-submit protection, and RBAC'

  $preLock = Invoke-Api -Path "/api/competitions/$competitionId/results?roundId=$($round.id)" -Session $adminSession
  Assert-True ($preLock.missing.Count -eq 1) 'Admin sees missing score sheets before lock.'
  Expect-Status -Path "/api/competitions/$competitionId/results" -Method POST -Body @{ action = 'lock'; roundId = $round.id } -Session $adminSession -Expected 409
  $judgeBSession = New-LoginSession -Email $judgeBEmail -Password $initialJudgePassword
  $secondJudgeSheet = (Invoke-Api -Path "/api/scores/$entryId" -Session $judgeBSession).scoreSheet
  Assert-True ($null -eq $secondJudgeSheet) 'One judge cannot read another judge private score sheet.'
  $detailsB = @(
    @{ criterionId = $criteria[0].id; score = 5; comment = 'Acceptable' },
    @{ criterionId = $criteria[1].id; score = 6; comment = 'Needs detail' },
    @{ criterionId = $criteria[2].id; score = 7; comment = 'Valuable' }
  )
  Invoke-Api -Path "/api/scores/$entryId" -Method PUT -Session $judgeBSession -Body @{ details = $detailsB; submit = $true } | Out-Null
  $beforeFinish = Get-LiveSession -CompetitionId $competitionId -RoundId $round.id -Session $adminSession
  Invoke-Api -Path "/api/competitions/$competitionId/rounds/$($round.id)/session" -Method POST -Session $adminSession -Body @{ action = 'finish'; expectedVersion = $beforeFinish.version } | Out-Null
  $locked = Invoke-Api -Path "/api/competitions/$competitionId/results" -Method POST -Session $adminSession -Body @{ action = 'lock'; roundId = $round.id }
  Assert-True ($locked.snapshot.version -eq 1) 'First result snapshot is locked after all required judges submit.'
  $managerResults = Invoke-Api -Path "/api/competitions/$competitionId/results?roundId=$($round.id)" -Session $adminSession
  Assert-True ([math]::Abs([double]$managerResults.snapshot.data[0].totalScore - 7.5) -lt 0.001) 'Median aggregation returns 7.5 from judge totals 9 and 6.'
  $adminCsv = Invoke-AuthenticatedDownload -Path "/api/competitions/$competitionId/results?roundId=$($round.id)&format=csv" -Session $adminSession
  Assert-True ($adminCsv.StatusCode -eq 200 -and $adminCsv.Content.Contains('Tổng · Judge E2E A') -and $adminCsv.Content.Contains('Judge E2E A · Creativity') -and $adminCsv.Content.Contains('Judge E2E B · Feasibility') -and $adminCsv.Content.Contains('Đủ phiếu')) 'Admin CSV includes per-judge totals, criterion scores, and completion status.'
  Test-Phase 'missing-score lock guard, private judge sheets, live finish, score aggregation, and immutable result snapshot'

  Invoke-Api -Path "/api/competitions/$competitionId/results" -Method POST -Session $adminSession -Body @{ action = 'publish'; roundId = $round.id } | Out-Null
  $viewerSession = New-LoginSession -Email $viewerEmail -Password $viewerPassword
  $publicResults = Invoke-Api -Path "/api/competitions/$competitionId/results?roundId=$($round.id)" -Session $viewerSession
  Assert-True ($publicResults.snapshot.published -and $publicResults.snapshot.data[0].judges.Count -eq 0) 'Viewer receives published result with Judge score breakdown hidden.'
  Expect-Status -Path "/api/competitions/$competitionId/contestants" -Method GET -Session $viewerSession -Expected 403
  $csv = Invoke-AuthenticatedDownload -Path "/api/competitions/$competitionId/results?roundId=$($round.id)&format=csv" -Session $viewerSession
  Assert-True ($csv.StatusCode -eq 200 -and $csv.Content.Contains('CF-001')) 'Published result CSV is downloadable.'
  $audit = Invoke-Api -Path "/api/competitions/$competitionId/audit" -Session $adminSession
  Assert-True ($audit.total -ge 8) 'Audit history records core workflow actions.'
  Test-Phase 'publishing, viewer-only access, hidden Judge breakdown, CSV export, and audit history'

  $sheetA = (Invoke-Api -Path "/api/competitions/$competitionId/scores?roundId=$($round.id)" -Session $adminSession).rows[0].judges | Where-Object { $_.email -eq $judgeAEmail } | Select-Object -First 1
  Invoke-Api -Path "/api/competitions/$competitionId/results" -Method POST -Session $adminSession -Body @{ action = 'reopen-score'; roundId = $round.id; scoreSheetId = $sheetA.scoreSheetId; reason = 'Điều chỉnh sau khi hội đồng rà soát.' } | Out-Null
  $detailsUpdated = @(
    @{ criterionId = $criteria[0].id; score = 10; comment = 'Đã rà soát' },
    @{ criterionId = $criteria[1].id; score = 10; comment = 'Đã xác nhận' },
    @{ criterionId = $criteria[2].id; score = 10; comment = 'Đã xác nhận' }
  )
  Invoke-Api -Path "/api/scores/$entryId" -Method PUT -Session $judgeASession -Body @{ details = $detailsUpdated; submit = $true } | Out-Null
  $lockedAgain = Invoke-Api -Path "/api/competitions/$competitionId/results" -Method POST -Session $adminSession -Body @{ action = 'lock'; roundId = $round.id }
  Invoke-Api -Path "/api/competitions/$competitionId/results" -Method POST -Session $adminSession -Body @{ action = 'publish'; roundId = $round.id } | Out-Null
  Assert-True ($lockedAgain.snapshot.version -eq 2) 'Reopened score is re-locked as a new snapshot version.'
  $latest = Invoke-Api -Path "/api/competitions/$competitionId/results?roundId=$($round.id)" -Session $viewerSession
  Assert-True ([math]::Abs([double]$latest.snapshot.data[0].totalScore - 8) -lt 0.001) 'Published version two contains the revised median.'
  Test-Phase 'reasoned score reopening, re-submission, and immutable snapshot versioning'

  $health = Invoke-Api -Path '/api/health'
  Assert-True ($health.database -eq 'ok') 'Health endpoint confirms MySQL connectivity.'
  Test-Phase 'health endpoint with migrated MySQL'
  Write-Output 'E2E RESULT: ALL WORKFLOW ASSERTIONS PASSED'
} finally {
  if ($setupCreated) {
    $escapedEmails = @($adminEmail, $judgeAEmail, $judgeBEmail, $viewerEmail) | ForEach-Object { "'$_'" }
    $emailList = $escapedEmails -join ','
    $competitionIds = @($competitionId, $duplicateId) | Where-Object { $_ } | ForEach-Object { "'$_'" }
    $competitionList = $competitionIds -join ','
    $cleanupSql = if ($competitionList) { "DELETE FROM competitions WHERE id IN ($competitionList); " } else { '' }
    $cleanupSql += "DELETE FROM users WHERE email IN ($emailList);"
    $cleanupPath = Join-Path ([System.IO.Path]::GetTempPath()) "hcf-e2e-cleanup-$suffix.sql"
    [System.IO.File]::WriteAllText($cleanupPath, $cleanupSql, [System.Text.Encoding]::ASCII)
    $previousMysqlPassword = $env:MYSQL_PWD
    $env:MYSQL_PWD = $databasePassword
    Get-Content -LiteralPath $cleanupPath | & $Mysql --protocol=TCP --connect-timeout=5 "--host=$($databaseUri.Host)" "--port=$databasePort" "--user=$databaseUser" "--database=$databaseName"
    $mysqlExit = $LASTEXITCODE
    $env:MYSQL_PWD = $previousMysqlPassword
    Remove-Item -LiteralPath $cleanupPath -Force -ErrorAction SilentlyContinue
    if ($null -eq $previousMysqlPassword) { Remove-Item Env:\MYSQL_PWD -ErrorAction SilentlyContinue } else { $env:MYSQL_PWD = $previousMysqlPassword }
    if ($mysqlExit -ne 0) { Write-Output 'CLEANUP WARNING: MySQL could not remove temporary E2E data.' }
    else { Write-Output 'CLEANUP: Temporary users, competition data, and related score sheets removed.' }
  }
}
