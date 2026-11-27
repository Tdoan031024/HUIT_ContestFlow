$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$BaseUrl = if ($env:HCF_E2E_BASE_URL) { $env:HCF_E2E_BASE_URL.TrimEnd('/') } else { 'http://localhost:3000' }
$envFile = Join-Path $ProjectRoot '.env'
$envLines = Get-Content -LiteralPath $envFile
$databaseLine = $envLines | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
if (-not $databaseLine -and -not $env:HCF_E2E_DATABASE_URL) { throw 'Cần có DATABASE_URL trong .env hoặc HCF_E2E_DATABASE_URL của môi trường kiểm thử riêng.' }
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
$oldE2eAdminEmail = $env:HCF_E2E_ADMIN_EMAIL
$oldE2eAdminPassword = $env:HCF_E2E_ADMIN_PASSWORD
$oldDatabaseUrl = $env:DATABASE_URL
$competitionId = $null
$duplicateId = $null
$attendanceEventCreated = $false
$adminFixtureCreated = $false

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

function Get-LiveSession([string]$CompetitionId, [Microsoft.PowerShell.Commands.WebRequestSession]$Session) {
  return (Invoke-Api -Path "/api/competitions/$CompetitionId/session" -Session $Session).session
}

try {
  $env:DATABASE_URL = $databaseUrl
  $env:HCF_E2E_ADMIN_EMAIL = $adminEmail
  $env:HCF_E2E_ADMIN_PASSWORD = $adminPassword
  & node (Join-Path $ProjectRoot 'scripts/e2e-create-admin.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Could not create the temporary Admin fixture in the local E2E database.' }
  $adminFixtureCreated = $true
  $adminSession = (Invoke-AuthRequest -Path '/api/auth/login' -Body @{ email = $adminEmail; password = $adminPassword }).Session
  $sessionCheck = Invoke-Api -Path '/api/auth/me' -Session $adminSession
  Assert-True ($sessionCheck.user.email -eq $adminEmail) 'Admin session cookie is accepted by the API.'
  $emptyDashboard = Invoke-Api -Path '/api/dashboard' -Session $adminSession
  Assert-True ($emptyDashboard.systemRole -eq 'ADMIN' -and $emptyDashboard.stats.percent -eq 0) 'Admin dashboard returns a finite zero progress value when no score is expected.'
  Test-Phase 'Admin login and secure session'

  $competition = (Invoke-Api -Path '/api/competitions' -Method POST -Session $adminSession -Body @{ name = "E2E Cup $suffix"; description = 'Temporary end-to-end verification'; organizingUnit = 'HUIT'; location = 'Test Hall'; modality = 'HYBRID'; firstRoundName = 'Test Round' }).competition
  $competitionId = $competition.id
  $response = Invoke-Api -Path "/api/competitions/$competitionId" -Session $adminSession
  $detail = $response.competition
  $round = $response.workspace
  Assert-True ($null -ne $round) 'New competition exposes its judging workspace.'
  Assert-True ($null -eq $round.activeRubricVersion) 'New competition starts without a pre-created rubric.'
  Assert-True ($round.anonymous) 'New rounds default to anonymous judging.'
  Assert-True ($detail.organizingUnit -eq 'HUIT' -and $detail.location -eq 'Test Hall' -and $detail.modality -eq 'HYBRID') 'Competition management details are persisted.'
  $duplicate = (Invoke-Api -Path "/api/competitions/$competitionId/duplicate" -Method POST -Session $adminSession -Body @{ name = "E2E Copy $suffix" }).competition
  $duplicateId = $duplicate.id
  $duplicateResponse = Invoke-Api -Path "/api/competitions/$duplicateId" -Session $adminSession
  $duplicateDetail = $duplicateResponse.competition
  Assert-True ($duplicateDetail.status -eq 'READY' -and $null -ne $duplicateResponse.workspace -and $null -eq $duplicateResponse.workspace.activeRubricVersion -and $duplicateDetail._count.contestants -eq 0) 'Competition copy keeps setup configuration without adding a rubric that does not exist on the source.'
  Invoke-Api -Path "/api/competitions/$duplicateId" -Method PATCH -Session $adminSession -Body @{ startsAt = '2026-12-01T10:00:00.000Z'; endsAt = '2026-12-01T11:00:00.000Z'; location = 'Hall A' } | Out-Null
  $duplicateResponse = Invoke-Api -Path "/api/competitions/$duplicateId" -Session $adminSession
  $duplicateDetail = $duplicateResponse.competition
  Assert-True ($duplicateDetail.startsAt -and $duplicateDetail.endsAt -and $duplicateDetail.location -eq 'Hall A') 'Competition dates and location can be edited.'
  Test-Phase 'competition details, date editing, and safe configuration copy'
  $rubricCriteria = @(
    @{ clientKey = 'creativity'; name = 'Creativity'; type = 'NUMERIC'; config = @{ minimum = 0; maximum = 10; step = 0.5 }; commentRequired = $true },
    @{ clientKey = 'feasibility'; name = 'Feasibility'; type = 'NUMERIC'; config = @{ minimum = 0; maximum = 10; step = 0.5 } },
    @{ clientKey = 'impact'; name = 'Impact'; type = 'NUMERIC'; config = @{ minimum = 0; maximum = 10; step = 0.5 } }
  )
  $invalidCriteria = @(@{ clientKey = 'bad-step'; name = 'Bad step'; type = 'NUMERIC'; config = @{ minimum = 0; maximum = 10; step = 3 } })
  Expect-Status -Path "/api/competitions/$competitionId/rubric" -Method POST -Body @{ name = 'Invalid rubric'; criteria = $invalidCriteria } -Session $adminSession -Expected 400
  Invoke-Api -Path "/api/competitions/$competitionId/rubric" -Method POST -Session $adminSession -Body @{ name = 'E2E rubric'; criteria = $rubricCriteria } | Out-Null
  Test-Phase 'competition workspace and rubric validation'

  $contestant = (Invoke-Api -Path "/api/competitions/$competitionId/contestants" -Method POST -Session $adminSession -Body @{ roundId = $round.id; displayName = 'Test Team'; organization = 'HUIT'; title = 'Test project' }).contestant
  $entryId = $contestant.entries[0].id
  $csvBody = @{ csv = "Name,Organization,Email,Phone,Title`nCSV Team,HUIT,csv-$suffix@huit.test,0900000000,CSV project" }
  $preview = Invoke-Api -Path "/api/competitions/$duplicateId/contestants/import" -Method POST -Session $adminSession -Body $csvBody
  Assert-True ($preview.preview.rows.Count -eq 1 -and $preview.preview.issues.Count -eq 0) 'CSV preview validates one clean row before the import is confirmed.'
  $import = Invoke-Api -Path "/api/competitions/$duplicateId/contestants/import" -Method POST -Session $adminSession -Body ($csvBody + @{ confirm = $true })
  Assert-True ($import.imported -eq 1) 'CSV import inserts exactly one contestant.'
  $adminProgress = Invoke-Api -Path '/api/dashboard' -Session $adminSession
  $adminCompetitionProgress = $adminProgress.competitions | Where-Object { $_.id -eq $competitionId } | Select-Object -First 1
  Assert-True ($adminProgress.stats.percent -eq 0 -and $adminCompetitionProgress.progress.expected -eq 1) 'Admin dashboard reports zero submissions and one required score for the scoring fixture.'
  $closedCopy = Invoke-Api -Path "/api/competitions/$duplicateId/close-early" -Method POST -Session $adminSession -Body @{ reason = 'Bản sao chỉ dùng để xác minh thao tác đóng sớm.' }
  Assert-True ($closedCopy.competition.status -eq 'COMPLETED') 'Early closure completes the copied competition.'
  Test-Phase 'contestant creation, automatic entry code, and CSV import'

  $preflight = (Invoke-Api -Path "/api/competitions/$competitionId/preflight" -Session $adminSession).preflight
  Assert-True ($preflight.entryCount -eq 1 -and $preflight.rubricReady -and $preflight.missingAssignments.Count -eq 1) 'Preflight identifies rubric readiness, entry count, and missing judge coverage.'
  $initialSession = Get-LiveSession -CompetitionId $competitionId -Session $adminSession
  Expect-Status -Path "/api/competitions/$competitionId/session" -Method POST -Body @{ action = 'start'; expectedVersion = $initialSession.version } -Session $adminSession -Expected 409
  Test-Phase 'preflight blocks a round with incomplete judge coverage'

  $judgeA = (Invoke-Api -Path '/api/judges' -Method POST -Session $adminSession -Body @{ fullName = 'Judge E2E A'; email = $judgeAEmail; password = $judgePassword }).judge
  $judgeB = (Invoke-Api -Path '/api/judges' -Method POST -Session $adminSession -Body @{ fullName = 'Judge E2E B'; email = $judgeBEmail; password = $judgePassword }).judge
  Invoke-Api -Path "/api/competitions/$competitionId/judges" -Method POST -Session $adminSession -Body @{ judgeIds = @($judgeA.id, $judgeB.id) } | Out-Null
  Test-Phase 'Judge account creation and round assignment'

  $previousJudgeSession = New-LoginSession -Email $judgeAEmail -Password $judgePassword
  $newJudgePassword = [guid]::NewGuid().ToString('N')
  Invoke-Api -Path "/api/judges/$($judgeA.id)" -Method PATCH -Session $adminSession -Body @{ password = $newJudgePassword } | Out-Null
  Expect-Status -Path '/api/auth/login' -Method POST -Body @{ email = $judgeAEmail; password = $judgePassword } -Session $null -Expected 401
  Expect-Status -Path '/api/auth/me' -Method GET -Session $previousJudgeSession -Expected 401
  $judgePassword = $newJudgePassword
  $judgeSessionCheck = New-LoginSession -Email $judgeAEmail -Password $judgePassword
  Assert-True ((Invoke-Api -Path '/api/auth/me' -Session $judgeSessionCheck).user.email -eq $judgeAEmail) 'Password reset invalidates the old password and supports a secure new login.'
  $judgeDashboard = Invoke-Api -Path '/api/dashboard' -Session $judgeSessionCheck
  Assert-True ($judgeDashboard.systemRole -eq 'JUDGE' -and $judgeDashboard.stats.expectedScores -eq 1 -and $judgeDashboard.stats.percent -eq 0) 'Judge dashboard progress is based only on assigned entries.'
  Expect-Status -Path "/api/competitions/$competitionId/preflight" -Method GET -Session $judgeSessionCheck -Expected 403
  Expect-Status -Path "/api/competitions/$competitionId/session" -Method GET -Session $judgeSessionCheck -Expected 403
  Expect-Status -Path '/api/competitions' -Method GET -Session $judgeSessionCheck -Expected 403
  Test-Phase 'Judge password reset and prior-session invalidation'

  $beforeStart = Get-LiveSession -CompetitionId $competitionId -Session $adminSession
  Invoke-Api -Path "/api/competitions/$competitionId/session" -Method POST -Session $adminSession -Body @{ action = 'start'; expectedVersion = $beforeStart.version } | Out-Null
  Expect-Status -Path "/api/competitions/$competitionId/session" -Method POST -Session $adminSession -Body @{ action = 'start'; expectedVersion = $beforeStart.version } -Expected 409
  Test-Phase 'live coordination rejects a stale repeated command'
  $judgeASession = New-LoginSession -Email $judgeAEmail -Password $judgePassword
  $tasksA = (Invoke-Api -Path '/api/judge/tasks' -Session $judgeASession).tasks
  $taskA = $tasksA | Where-Object { $_.entry.id -eq $entryId } | Select-Object -First 1
  Assert-True ($null -ne $taskA -and $taskA.entry.displayName -ne 'Test Team' -and $null -eq $taskA.entry.title -and $null -eq $taskA.entry.organization -and $taskA.taskStatus -eq 'READY') 'Assigned Judge sees the live task with identity and potentially identifying title hidden.'
  $rubric = (Invoke-Api -Path "/api/scores/$entryId" -Session $judgeASession).rubric
  $criteria = @($rubric.criteria)
  $preLock = Invoke-Api -Path "/api/competitions/$competitionId/results" -Session $adminSession
  Assert-True ($preLock.missing.Count -eq 1) 'Admin sees the unscored entry before either judge submits.'
  Expect-Status -Path "/api/competitions/$competitionId/results" -Method POST -Body @{ action = 'lock' } -Session $adminSession -Expected 409
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

  $judgeBSession = New-LoginSession -Email $judgeBEmail -Password $initialJudgePassword
  $secondJudgeSheet = (Invoke-Api -Path "/api/scores/$entryId" -Session $judgeBSession).scoreSheet
  Assert-True ($null -eq $secondJudgeSheet) 'One judge cannot read another judge private score sheet.'
  $detailsB = @(
    @{ criterionId = $criteria[0].id; score = 5; comment = 'Acceptable' },
    @{ criterionId = $criteria[1].id; score = 6; comment = 'Needs detail' },
    @{ criterionId = $criteria[2].id; score = 7; comment = 'Valuable' }
  )
  Invoke-Api -Path "/api/scores/$entryId" -Method PUT -Session $judgeBSession -Body @{ details = $detailsB; submit = $true } | Out-Null
  $beforeFinish = Get-LiveSession -CompetitionId $competitionId -Session $adminSession
  Invoke-Api -Path "/api/competitions/$competitionId/session" -Method POST -Session $adminSession -Body @{ action = 'finish'; expectedVersion = $beforeFinish.version } | Out-Null
  $afterRoundFinish = (Invoke-Api -Path "/api/competitions/$competitionId" -Session $adminSession).competition
  Assert-True ($afterRoundFinish.status -eq 'COMPLETED') 'Finishing the judging workspace completes the competition.'
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

  if ($databaseUri.AbsolutePath -match '^/huit_contestflow_codex_e2e_[a-f0-9]{8}$') {
    $now = [DateTime]::UtcNow
    $start = $now.AddMinutes(-50).ToString('o')
    $end = $now.AddMinutes(-5).ToString('o')
    $attendance = (Invoke-Api -Path '/api/attendance' -Method POST -Session $adminSession -Body @{
      name = "E2E Attendance $suffix"; venue = 'Test Hall'; expectedAttendees = 12
      eventStartsAt = $start; eventEndsAt = $end; checkInStartsAt = $start; checkInEndsAt = $end
      locationRequired = $false; photoRequired = $false
    }).event
    $attendanceEventCreated = $true
    $attendancePath = "/api/attendance/$($attendance.id)"
    $publicPath = "/api/public/attendance/$($attendance.publicCode)"
    Assert-True ($attendance.status -eq 'DRAFT') 'New attendance event is saved as a draft.'
    Expect-Status -Path $attendancePath -Method GET -Session $judgeBSession -Expected 403
    Expect-Status -Path "$publicPath/queue" -Method POST -Expected 409
    Invoke-Api -Path $attendancePath -Method PATCH -Session $adminSession -Body @{ action = 'OPEN' } | Out-Null
    $publicEvent = (Invoke-Api -Path $publicPath).event
    Assert-True ($publicEvent.acceptingCheckins -eq $true) 'Public status accepts check-ins after the legacy window when Admin opens attendance.'
    $queueHeaders = Join-Path ([System.IO.Path]::GetTempPath()) "hcf-attendance-$suffix.headers"
    try {
      $joinStatus = & curl.exe --silent --show-error --max-time 20 --dump-header $queueHeaders --output NUL --write-out '%{http_code}' --request POST "$BaseUrl$publicPath/queue"
      Assert-True ($joinStatus -eq '201') 'A participant joins an open event after its legacy check-in window.'
      $cookieLine = Get-Content -LiteralPath $queueHeaders | Where-Object { $_ -match '^Set-Cookie:' } | Select-Object -Last 1
      Assert-True ([bool]$cookieLine) 'Joining issues a queue cookie.'
      $pair = (($cookieLine -replace '^[^:]+:\s*', '').Split(';')[0]).Split('=', 2)
      $participant = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
      $participant.Cookies.Add([System.Net.Cookie]::new($pair[0], $pair[1], '/', $baseUri.Host))
      $queue = Invoke-Api -Path "$publicPath/queue" -Session $participant
      Assert-True ($queue.status -eq 'ACTIVE') 'Queue session is restored and active.'
      $submission = @{ idempotencyKey = [guid]::NewGuid().ToString(); fullName = 'Attendance E2E'; studentId = "QA-$suffix" }
      $checkIn = Invoke-Api -Path "$publicPath/check-in" -Method POST -Body $submission -Session $participant
      Assert-True ($checkIn.ok -eq $true) 'Participant check-in succeeds.'
      $repeat = Invoke-Api -Path "$publicPath/check-in" -Method POST -Body $submission -Session $participant
      Assert-True ($repeat.duplicate -eq $true) 'Repeating check-in does not create a second record.'
      $records = Invoke-Api -Path "$attendancePath/records" -Session $adminSession
      Assert-True ($records.total -eq 1) 'Admin sees one saved attendance record.'
      Expect-Status -Path "$attendancePath/records/$($records.records[0].id)/photo" -Method GET -Session $judgeBSession -Expected 403
      Invoke-Api -Path $attendancePath -Method PATCH -Session $adminSession -Body @{ action = 'CLOSE' } | Out-Null
      Expect-Status -Path "$publicPath/queue" -Method POST -Expected 409
      Test-Phase 'attendance draft, opening, queue recovery, check-in, duplicate prevention, role access, and closing'
      $manualPath = "$attendancePath/manual-check-in"
      $manual = @{ fullName = 'Attendance Manual E2E'; studentId = "MANUAL-$suffix"; reason = 'Participant verified at the help desk.' }
      Expect-Status -Path $manualPath -Method POST -Body $manual -Session $judgeBSession -Expected 403
      Expect-Status -Path $manualPath -Method POST -Body $manual -Session $null -Expected 401
      $manualRecord = (Invoke-Api -Path $manualPath -Method POST -Body $manual -Session $adminSession).record
      Assert-True ($manualRecord.manualOverride -eq $true) 'Admin can record a reasoned attendance exception after closing.'
      Expect-Status -Path $manualPath -Method POST -Body $manual -Session $adminSession -Expected 409
      Invoke-Api -Path $attendancePath -Method PATCH -Session $adminSession -Body @{ action = 'COMPLETE' } | Out-Null
      Invoke-Api -Path $attendancePath -Method PATCH -Session $adminSession -Body @{ action = 'ARCHIVE' } | Out-Null
      Expect-Status -Path $manualPath -Method POST -Body $manual -Session $adminSession -Expected 404
      Test-Phase 'attendance manual override, role access, duplicate prevention, completion, and archiving'
    } finally {
      Remove-Item -LiteralPath $queueHeaders -ErrorAction SilentlyContinue
    }
  }

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
    } | ConvertTo-Json -Depth 5
    [System.IO.File]::WriteAllText($fixturePath, $fixture, (New-Object System.Text.UTF8Encoding($false)))
    Write-Output "BROWSER FIXTURE: $fixturePath"
  }

  $health = Invoke-Api -Path '/api/health'
  Assert-True ($health.database -eq 'ok') 'Health endpoint confirms MySQL connectivity.'
  Test-Phase 'health endpoint with migrated MySQL'
  Write-Output 'E2E RESULT: ALL WORKFLOW ASSERTIONS PASSED'
} finally {
  if ($null -eq $oldE2eAdminEmail) { Remove-Item Env:\HCF_E2E_ADMIN_EMAIL -ErrorAction SilentlyContinue } else { $env:HCF_E2E_ADMIN_EMAIL = $oldE2eAdminEmail }
  if ($null -eq $oldE2eAdminPassword) { Remove-Item Env:\HCF_E2E_ADMIN_PASSWORD -ErrorAction SilentlyContinue } else { $env:HCF_E2E_ADMIN_PASSWORD = $oldE2eAdminPassword }
  if ($adminFixtureCreated -and $env:HCF_E2E_KEEP_DATA -ne '1') {
    $escapedEmails = @($adminEmail, $judgeAEmail, $judgeBEmail) | ForEach-Object { "'$_'" }
    $emailList = $escapedEmails -join ','
    $competitionIds = @($competitionId, $duplicateId) | Where-Object { $_ } | ForEach-Object { "'$_'" }
    $competitionList = $competitionIds -join ','
    $cleanupSql = if ($competitionList) { "DELETE FROM audit_events WHERE competition_id IN ($competitionList); DELETE FROM competitions WHERE id IN ($competitionList); " } else { '' }
    $cleanupSql = "DELETE FROM audit_events WHERE actor_id IN (SELECT id FROM users WHERE email IN ($emailList)); " + $cleanupSql
    if ($attendanceEventCreated) { $cleanupSql += "DELETE FROM attendance_events WHERE created_by_id IN (SELECT id FROM users WHERE email IN ($emailList)); " }
    $cleanupSql += "DELETE FROM users WHERE email IN ($emailList);"
    $cleanupPath = Join-Path ([System.IO.Path]::GetTempPath()) "hcf-e2e-cleanup-$suffix.sql"
    [System.IO.File]::WriteAllText($cleanupPath, $cleanupSql, [System.Text.Encoding]::ASCII)
    & node (Join-Path $ProjectRoot 'scripts/e2e-cleanup.mjs') $cleanupPath
    $cleanupExit = $LASTEXITCODE
    Remove-Item -LiteralPath $cleanupPath -Force -ErrorAction SilentlyContinue
    if ($cleanupExit -ne 0) { Write-Output 'CLEANUP WARNING: MySQL could not remove temporary E2E data.' }
    else { Write-Output 'CLEANUP: Temporary users, competition data, and related score sheets removed.' }
  }
  if ($null -eq $oldDatabaseUrl) { Remove-Item Env:\DATABASE_URL -ErrorAction SilentlyContinue } else { $env:DATABASE_URL = $oldDatabaseUrl }
}
