$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$BaseUrl = if ($env:HCF_E2E_BASE_URL) { $env:HCF_E2E_BASE_URL.TrimEnd('/') } else { 'http://localhost:3000' }
$envFile = Join-Path $ProjectRoot '.env'
$envLines = Get-Content -LiteralPath $envFile
$setupLine = $envLines | Where-Object { $_ -match '^ADMIN_SETUP_KEY=' } | Select-Object -First 1
$databaseLine = $envLines | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
if (-not $setupLine -or (-not $databaseLine -and -not $env:HCF_E2E_DATABASE_URL)) { throw 'Cần có ADMIN_SETUP_KEY và DATABASE_URL trong .env hoặc HCF_E2E_DATABASE_URL của môi trường kiểm thử riêng.' }
$setupKey = $setupLine.Substring($setupLine.IndexOf('=') + 1).Trim().Trim('"')
$databaseUrl = if ($env:HCF_E2E_DATABASE_URL) { $env:HCF_E2E_DATABASE_URL } else { $databaseLine.Substring($databaseLine.IndexOf('=') + 1).Trim().Trim('"') }
$databaseUri = [uri]$databaseUrl
if ($databaseUri.Host -notin @('localhost', '127.0.0.1', '::1', '[::1]')) { throw 'E2E chỉ được chạy với DATABASE_URL trỏ tới database local.' }
$baseUri = [uri]$BaseUrl
if ($baseUri.Host -notin @('localhost', '127.0.0.1', '::1', '[::1]')) { throw 'E2E chỉ được gọi ứng dụng local để tránh ghi dữ liệu lên host thật.' }
$suffix = [guid]::NewGuid().ToString('N').Substring(0, 8)
$adminEmail = "codex-e2e-admin+$suffix@huit.test"
$judgeAEmail = "codex-e2e-judge-a+$suffix@huit.test"
$judgeBEmail = "codex-e2e-judge-b+$suffix@huit.test"
$adminPassword = 'LocalE2E-Admin-3pw!'
$judgePassword = 'LocalE2E-Judge-3pw!'
$initialJudgePassword = $judgePassword
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
  $cookieHost = ([uri]$BaseUrl).Host
  $Session.Cookies.Add([System.Net.Cookie]::new('hcf_session', $parts[1], '/', $cookieHost))
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
  $emptyDashboard = Invoke-Api -Path '/api/dashboard' -Session $adminSession
  Assert-True ($emptyDashboard.systemRole -eq 'ADMIN' -and $emptyDashboard.stats.percent -eq 0) 'Admin dashboard returns a finite zero progress value when no score is expected.'
  Test-Phase 'first Admin setup and secure session'

  $competition = (Invoke-Api -Path '/api/competitions' -Method POST -Session $adminSession -Body @{ name = "E2E Cup $suffix"; description = 'Temporary end-to-end verification'; organizingUnit = 'HUIT'; location = 'Test Hall'; modality = 'HYBRID'; firstRoundName = 'Test Round' }).competition
  $competitionId = $competition.id
  $detail = (Invoke-Api -Path "/api/competitions/$competitionId" -Session $adminSession).competition
  $round = $detail.rounds[0]
  Assert-True ($null -ne $round.activeRubricVersion -and $round.activeRubricVersion.criteria.Count -eq 3) 'Default round and three-criterion rubric are created.'
  Assert-True ($round.anonymous) 'New rounds default to anonymous judging.'
  Assert-True ($detail.organizingUnit -eq 'HUIT' -and $detail.location -eq 'Test Hall' -and $detail.modality -eq 'HYBRID') 'Competition management details are persisted.'
  $duplicate = (Invoke-Api -Path "/api/competitions/$competitionId/duplicate" -Method POST -Session $adminSession -Body @{ name = "E2E Copy $suffix" }).competition
  $duplicateId = $duplicate.id
  $duplicateDetail = (Invoke-Api -Path "/api/competitions/$duplicateId" -Session $adminSession).competition
  Assert-True ($duplicateDetail.status -eq 'DRAFT' -and $duplicateDetail.rounds.Count -eq 1 -and $duplicateDetail.rounds[0].activeRubricVersion.criteria.Count -eq 3 -and $duplicateDetail._count.contestants -eq 0) 'Competition copy contains configuration and rubric only.'
  Invoke-Api -Path "/api/competitions/$duplicateId" -Method PATCH -Session $adminSession -Body @{ startsAt = '2026-12-01T10:00:00.000Z'; endsAt = '2026-12-01T11:00:00.000Z'; location = 'Hall A' } | Out-Null
  $duplicateDetail = (Invoke-Api -Path "/api/competitions/$duplicateId" -Session $adminSession).competition
  Assert-True ($duplicateDetail.startsAt -and $duplicateDetail.endsAt -and $duplicateDetail.location -eq 'Hall A') 'Competition dates and location can be edited.'
  $closedCopy = Invoke-Api -Path "/api/competitions/$duplicateId/close-early" -Method POST -Session $adminSession -Body @{ reason = 'Bản sao chỉ dùng để xác minh thao tác đóng sớm.' }
  Assert-True ($closedCopy.competition.status -eq 'COMPLETED') 'Early closure completes all rounds and records the explicit action.'
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
  $preview = Invoke-Api -Path "/api/competitions/$competitionId/contestants/import" -Method POST -Session $adminSession -Body $csvBody
  Assert-True ($preview.preview.rows.Count -eq 1 -and $preview.preview.issues.Count -eq 0) 'CSV preview validates one clean row before the import is confirmed.'
  $import = Invoke-Api -Path "/api/competitions/$competitionId/contestants/import" -Method POST -Session $adminSession -Body ($csvBody + @{ confirm = $true })
  Assert-True ($import.imported -eq 1) 'CSV import inserts exactly one contestant.'
  $adminProgress = Invoke-Api -Path '/api/dashboard' -Session $adminSession
  $adminCompetitionProgress = $adminProgress.competitions | Where-Object { $_.id -eq $competitionId } | Select-Object -First 1
  Assert-True ($adminProgress.stats.expectedScores -eq 3 -and $adminProgress.stats.percent -eq 0 -and $adminCompetitionProgress.progress.expected -eq 3) 'Admin dashboard keeps global and competition progress denominators aligned.'
  Test-Phase 'contestant creation, automatic entry code, and CSV import'

  $preflight = (Invoke-Api -Path "/api/competitions/$competitionId/rounds/$($round.id)/preflight" -Session $adminSession).preflight
  Assert-True ($preflight.entryCount -eq 1 -and $preflight.rubricReady -and $preflight.missingAssignments.Count -eq 1) 'Preflight identifies rubric readiness, entry count, and missing judge coverage.'
  $initialSession = Get-LiveSession -CompetitionId $competitionId -RoundId $round.id -Session $adminSession
  Expect-Status -Path "/api/competitions/$competitionId/rounds/$($round.id)/session" -Method POST -Body @{ action = 'start'; expectedVersion = $initialSession.version } -Session $adminSession -Expected 409
  Test-Phase 'preflight blocks a round with incomplete judge coverage'

  foreach ($judge in @(@{ name = 'Judge E2E A'; email = $judgeAEmail }, @{ name = 'Judge E2E B'; email = $judgeBEmail })) {
    Invoke-Api -Path "/api/competitions/$competitionId/judges" -Method POST -Session $adminSession -Body @{ roundId = $round.id; fullName = $judge.name; email = $judge.email; password = $judgePassword } | Out-Null
  }
  Test-Phase 'Judge account creation and round assignment'

  $judgeAssignment = (Invoke-Api -Path "/api/competitions/$competitionId/judges" -Session $adminSession).assignments | Where-Object { $_.user.email -eq $judgeAEmail } | Select-Object -First 1
  $previousJudgeSession = New-LoginSession -Email $judgeAEmail -Password $judgePassword
  $passwordReset = Invoke-Api -Path "/api/competitions/$competitionId/judges/$($judgeAssignment.id)" -Method PATCH -Session $adminSession -Body @{ action = 'reset-password' }
  Expect-Status -Path '/api/auth/login' -Method POST -Body @{ email = $judgeAEmail; password = $judgePassword } -Session $null -Expected 401
  Expect-Status -Path '/api/auth/me' -Method GET -Session $previousJudgeSession -Expected 401
  $judgePassword = $passwordReset.temporaryPassword
  $judgeSessionCheck = New-LoginSession -Email $judgeAEmail -Password $judgePassword
  Assert-True (($passwordReset.temporaryPassword.Length -ge 20) -and ((Invoke-Api -Path '/api/auth/me' -Session $judgeSessionCheck).user.email -eq $judgeAEmail)) 'Password reset invalidates the old password and supports a secure new login.'
  $judgeDashboard = Invoke-Api -Path '/api/dashboard' -Session $judgeSessionCheck
  Assert-True ($judgeDashboard.systemRole -eq 'JUDGE' -and $judgeDashboard.stats.expectedScores -eq 1 -and $judgeDashboard.stats.percent -eq 0) 'Judge dashboard progress is based only on assigned entries.'
  Expect-Status -Path "/api/competitions/$competitionId/rounds/$($round.id)/preflight" -Method GET -Session $judgeSessionCheck -Expected 403
  Expect-Status -Path "/api/competitions/$competitionId/rounds/$($round.id)/session" -Method GET -Session $judgeSessionCheck -Expected 403
  Expect-Status -Path '/api/competitions' -Method GET -Session $judgeSessionCheck -Expected 403
  Test-Phase 'Judge password reset and prior-session invalidation'

  $beforeStart = Get-LiveSession -CompetitionId $competitionId -RoundId $round.id -Session $adminSession
  Invoke-Api -Path "/api/competitions/$competitionId/rounds/$($round.id)/session" -Method POST -Session $adminSession -Body @{ action = 'start'; expectedVersion = $beforeStart.version } | Out-Null
  Expect-Status -Path "/api/competitions/$competitionId/rounds/$($round.id)/session" -Method POST -Session $adminSession -Body @{ action = 'start'; expectedVersion = $beforeStart.version } -Expected 409
  Test-Phase 'live coordination rejects a stale repeated command'
  $judgeASession = New-LoginSession -Email $judgeAEmail -Password $judgePassword
  $tasksA = (Invoke-Api -Path '/api/judge/tasks' -Session $judgeASession).tasks
  $taskA = $tasksA | Where-Object { $_.entry.id -eq $entryId } | Select-Object -First 1
  Assert-True ($null -ne $taskA -and $taskA.entry.displayName -ne 'Test Team' -and $null -eq $taskA.entry.title -and $null -eq $taskA.entry.organization -and $taskA.taskStatus -eq 'LIVE') 'Assigned Judge sees the live task with identity and potentially identifying title hidden.'
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
  $afterRoundFinish = (Invoke-Api -Path "/api/competitions/$competitionId" -Session $adminSession).competition
  Assert-True ($afterRoundFinish.status -ne 'COMPLETED') 'Finishing one round does not complete a competition with another unfinished round.'
  $locked = Invoke-Api -Path "/api/competitions/$competitionId/results" -Method POST -Session $adminSession -Body @{ action = 'lock'; roundId = $round.id }
  Assert-True ($locked.snapshot.version -eq 1) 'First result snapshot is locked after all required judges submit.'
  $managerResults = Invoke-Api -Path "/api/competitions/$competitionId/results?roundId=$($round.id)" -Session $adminSession
  Assert-True ([math]::Abs([double]$managerResults.snapshot.data[0].totalScore - 7.5) -lt 0.001) 'Median aggregation returns 7.5 from judge totals 9 and 6.'
  $adminCsv = Invoke-AuthenticatedDownload -Path "/api/competitions/$competitionId/results?roundId=$($round.id)&format=csv" -Session $adminSession
  Assert-True ($adminCsv.StatusCode -eq 200 -and $adminCsv.Content.Contains('Tổng · Judge E2E A') -and $adminCsv.Content.Contains('Judge E2E A · Creativity') -and $adminCsv.Content.Contains('Judge E2E B · Feasibility') -and $adminCsv.Content.Contains('Đủ phiếu')) 'Admin CSV includes per-judge totals, criterion scores, and completion status.'
  Test-Phase 'missing-score lock guard, private judge sheets, live finish, score aggregation, and immutable result snapshot'

  Invoke-Api -Path "/api/competitions/$competitionId/results" -Method POST -Session $adminSession -Body @{ action = 'publish'; roundId = $round.id } | Out-Null
  $judgeResults = Invoke-Api -Path "/api/competitions/$competitionId/results?roundId=$($round.id)" -Session $judgeASession
  Assert-True ($judgeResults.snapshot.published -and $judgeResults.snapshot.data[0].judges.Count -eq 0 -and $judgeResults.snapshot.data[0].contestant -ne 'Test Team') 'Judge receives the published snapshot with identity and Judge score breakdown hidden by the pinned policy.'
  Expect-Status -Path "/api/competitions/$competitionId/contestants" -Method GET -Session $judgeASession -Expected 403
  Expect-Status -Path "/api/competitions/$competitionId/audit" -Method GET -Session $judgeASession -Expected 403
  $csv = Invoke-AuthenticatedDownload -Path "/api/competitions/$competitionId/results?roundId=$($round.id)&format=csv" -Session $judgeASession
  Assert-True ($csv.StatusCode -eq 200 -and $csv.Content.Contains('CF-001')) 'Published result CSV is downloadable.'
  $audit = Invoke-Api -Path "/api/competitions/$competitionId/audit" -Session $adminSession
  Assert-True ($audit.total -ge 8) 'Audit history records core workflow actions.'
  Test-Phase 'publishing, Judge read-only access, hidden identity and score breakdown, CSV export, and audit history'

  Expect-Status -Path "/api/scores/$entryId" -Method PUT -Body @{ details = $detailsA; submit = $false } -Session $judgeASession -Expected 409
  Expect-Status -Path "/api/competitions/$competitionId/rounds/$($round.id)" -Method PATCH -Body @{ requiredJudgeCount = 1 } -Session $adminSession -Expected 409

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
  $latest = Invoke-Api -Path "/api/competitions/$competitionId/results?roundId=$($round.id)" -Session $judgeASession
  Assert-True ([math]::Abs([double]$latest.snapshot.data[0].totalScore - 8) -lt 0.001) 'Published version two contains the revised median.'
  Test-Phase 'reasoned score reopening, re-submission, and immutable snapshot versioning'

  if ($env:HCF_E2E_KEEP_DATA -eq '1') {
    $fixturePath = Join-Path ([System.IO.Path]::GetTempPath()) "hcf-browser-fixture-$suffix.json"
    $fixture = @{
      baseUrl = $BaseUrl
      adminEmail = $adminEmail
      adminPassword = $adminPassword
      judgeEmail = $judgeBEmail
      judgePassword = $initialJudgePassword
      competitionId = $competitionId
      roundId = $round.id
      entryId = $entryId
      secondaryRoundId = $csvRound.id
    } | ConvertTo-Json -Depth 5
    [System.IO.File]::WriteAllText($fixturePath, $fixture, (New-Object System.Text.UTF8Encoding($false)))
    Write-Output "BROWSER FIXTURE: $fixturePath"
  }

  $health = Invoke-Api -Path '/api/health'
  Assert-True ($health.database -eq 'ok') 'Health endpoint confirms MySQL connectivity.'
  Test-Phase 'health endpoint with migrated MySQL'
  Write-Output 'E2E RESULT: ALL WORKFLOW ASSERTIONS PASSED'
} finally {
  if ($setupCreated -and $env:HCF_E2E_KEEP_DATA -ne '1') {
    $escapedEmails = @($adminEmail, $judgeAEmail, $judgeBEmail) | ForEach-Object { "'$_'" }
    $emailList = $escapedEmails -join ','
    $competitionIds = @($competitionId, $duplicateId) | Where-Object { $_ } | ForEach-Object { "'$_'" }
    $competitionList = $competitionIds -join ','
    $cleanupSql = if ($competitionList) { "DELETE FROM audit_events WHERE competition_id IN ($competitionList); DELETE FROM competitions WHERE id IN ($competitionList); " } else { '' }
    $cleanupSql = "DELETE FROM audit_events WHERE actor_id IN (SELECT id FROM users WHERE email IN ($emailList)); " + $cleanupSql
    $cleanupSql += "DELETE FROM users WHERE email IN ($emailList);"
    $cleanupPath = Join-Path ([System.IO.Path]::GetTempPath()) "hcf-e2e-cleanup-$suffix.sql"
    [System.IO.File]::WriteAllText($cleanupPath, $cleanupSql, [System.Text.Encoding]::ASCII)
    $previousDatabaseUrl = $env:DATABASE_URL
    $env:DATABASE_URL = $databaseUrl
    & node (Join-Path $ProjectRoot 'scripts/e2e-cleanup.mjs') $cleanupPath
    $cleanupExit = $LASTEXITCODE
    Remove-Item -LiteralPath $cleanupPath -Force -ErrorAction SilentlyContinue
    if ($null -eq $previousDatabaseUrl) { Remove-Item Env:\DATABASE_URL -ErrorAction SilentlyContinue } else { $env:DATABASE_URL = $previousDatabaseUrl }
    if ($cleanupExit -ne 0) { Write-Output 'CLEANUP WARNING: MySQL could not remove temporary E2E data.' }
    else { Write-Output 'CLEANUP: Temporary users, competition data, and related score sheets removed.' }
  }
}
