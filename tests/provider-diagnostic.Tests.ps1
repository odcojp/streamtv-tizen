# Standalone offline tests. Extract only the pure summary function; never run
# the script's credential prompt or network request. No Pester dependency.
$scriptPath = Join-Path $PSScriptRoot '../scripts/Test-ProviderLogin.ps1'
$tokens = $null; $parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($scriptPath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw 'Diagnostic PowerShell syntax check failed.' }
$summary = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Get-ProviderResponseSummary' }, $true)
if ($null -eq $summary) { throw 'Pure summary function not found.' }
. ([scriptblock]::Create($summary.Extent.Text))
$redactor = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Get-RedactedProviderMessage' }, $true)
if ($null -eq $redactor) { throw 'Message redactor function not found.' }
. ([scriptblock]::Create($redactor.Extent.Text))

$cases = @(
    @{Status=400; Text='{"message":"email is required; mock-secret","errors":{"email":["private mock-secret"],"password":["mock-secret"],"mock-secret-field":["ignored"]}}'; Expected=@('BODY_FORMAT: JSON','JSON_FIELDS: errors, message','VALIDATION_FIELDS: password, email','MESSAGE_CATEGORY: MISSING_INPUT_INDICATED','RESULT: HTTP_ERROR.')},
    @{Status=401; Text='{"error":{"code":"INVALID_CREDENTIALS","message":"Invalid password mock-secret"}}'; Expected=@('BODY_FORMAT: JSON','ERROR_CODE: INVALID_CREDENTIALS','MESSAGE_CATEGORY: AUTHENTICATION_INDICATED','RESULT: AUTH_OR_ACCESS_REJECTED.')},
    @{Status=400; Text='{"error":{"message":"device is required","errors":{"device_id":["mock-secret"]}}}'; Expected=@('VALIDATION_FIELDS: device_id','MESSAGE_CATEGORY: MISSING_INPUT_INDICATED','RESULT: HTTP_ERROR.')},
    @{Status=400; Text='{"message":"client_secret required mock-secret"}'; Expected=@('MESSAGE_CATEGORY: CLIENT_FIELD_MENTIONED','RESULT: HTTP_ERROR.')},
    @{Status=400; Text='{"error":"E01"}'; Expected=@('ERROR_CODE: E01','RESULT: HTTP_ERROR.')},
    @{Status=200; Text='{"data":{"token":"mock-secret","token_type":"Bearer"}}'; Expected=@('JSON_FIELDS: data','RESULT: TOKEN_SHAPED_JSON_RECEIVED.')},
    @{Status=400; Text='{"data":{"token":"mock-secret"}}'; Expected=@('RESULT: HTTP_ERROR.')},
    @{Status=500; Text='{"data":{"token":"mock-secret"}}'; Expected=@('RESULT: HTTP_ERROR.')},
    @{Status=200; Text='{"data":{"token":"  "}}'; Expected=@('RESULT: JSON_RECEIVED_WITHOUT_RECOGNIZED_TOKEN.')},
    @{Status=403; Text='<html>mock-secret https://infolink.me/api/list/mock/mock-secret</html>'; Expected=@('BODY_FORMAT: HTML','RESULT: AUTH_OR_ACCESS_REJECTED.')},
    @{Status=200; Text='<!doctype html><html>mock-secret</html>'; Expected=@('BODY_FORMAT: HTML','RESULT: HTML_RESPONSE.')},
    @{Status=302; Text='{"data":{"token":"mock-secret"}}'; Expected=@('BODY_FORMAT: NOT_READ','RESULT: REDIRECT_BLOCKED.')},
    @{Status=400; Text='{"mock-secret-key":"mock-secret","code":"https://infolink.me/api/list/mock/mock-secret"}'; Expected=@('JSON_FIELDS: code','RESULT: HTTP_ERROR.')},
    @{Status=400; Text='["mock-secret"]'; Expected=@('BODY_FORMAT: JSON','RESULT: HTTP_ERROR.')},
    @{Status=200; Text='null'; Expected=@('BODY_FORMAT: JSON','RESULT: JSON_RECEIVED_WITHOUT_RECOGNIZED_TOKEN.')},
    @{Status=200; Text='false'; Expected=@('BODY_FORMAT: JSON','RESULT: JSON_RECEIVED_WITHOUT_RECOGNIZED_TOKEN.')},
    @{Status=200; Text=''; Expected=@('BODY_FORMAT: EMPTY','RESULT: EMPTY_RESPONSE.')},
    @{Status=400; Text='malformed mock-secret https://infolink.me/api/list/mock/mock-secret'; Expected=@('BODY_FORMAT: OTHER','RESULT: HTTP_ERROR.')}
)
$passed = 0
foreach ($case in $cases) {
    $lines = @(Get-ProviderResponseSummary -Status $case.Status -Text $case.Text)
    foreach ($expected in $case.Expected) {
        if ($lines -notcontains $expected) { throw ('Summary expectation failed in synthetic case ' + ($passed + 1) + ': ' + $expected) }
    }
    $output = $lines -join "`n"
    if ($output -match 'mock-secret|https?://|infolink\.me|laon\.live') { throw 'Private response data leaked in a synthetic case.' }
    if ($case.Status -ge 300 -and $lines -contains 'RESULT: TOKEN_SHAPED_JSON_RECEIVED.') { throw 'An error was mistaken for login success.' }
    $passed++
}


# Redactor tests preserve useful plain wording while excluding private payloads.
$username = 'mock-user@example.org'; $password = 'mock-secret/%! &?'
$variants = @($username, $password, [Uri]::EscapeDataString($username), [Uri]::EscapeDataString($password),
    [Uri]::EscapeDataString([Uri]::EscapeDataString($password)), [Net.WebUtility]::UrlEncode($password),
    [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($username + ':' + $password)))
foreach ($secret in $variants) {
    $jsonMessage = ConvertTo-Json -InputObject @{message=('Unsupported login request: ' + $secret)} -Compress
    $output = Get-RedactedProviderMessage -Text $jsonMessage -Username $username -Password $password
    if (-not $output.Contains('Unsupported login request:') -or $output.Contains($secret) -or $output.Contains('mock-secret') -or $output.Contains($username)) { throw 'Credential redaction failed in a synthetic case.' }
    $passed++
}
foreach ($message in @(
    'Unsupported login request: https://infolink.me/api/list/mock-user/mock-secret',
    'Unsupported login request: /api/list/mock-user/mock-secret',
    'Unsupported login request: token=shortHiddenValue',
    'Unsupported login request: api_key="shortHiddenValue"',
    'Unsupported login request: abcdefghijk.abcdefghijk.abcdefghijk',
    'Unsupported login request: someone@private.example',
    'Unsupported login request: 12345678-abcd-abcd-abcd-123456789abc',
    'Unsupported login request: aVeryLongPrivateIdentifier01234567890'
)) {
    $jsonMessage = ConvertTo-Json -InputObject @{message=$message} -Compress
    $output = Get-RedactedProviderMessage -Text $jsonMessage -Username $username -Password $password
    if (-not $output.Contains('Unsupported login request:') -or $output -match 'https?://|mock-secret|shortHiddenValue|abcdefghijk|someone@|12345678-abcd|aVeryLongPrivate') { throw 'Response-private-data redaction failed in a synthetic case.' }
    $passed++
}
foreach ($message in @('', 'null', '[]', '{"message":{"password":"mock-secret"}}', '<html>mock-secret</html>')) {
    $output = Get-RedactedProviderMessage -Text $message -Username $username -Password $password
    if ($output -match 'mock-secret|<html>|password') { throw 'Unsupported message was exposed.' }
    $passed++
}
$output = Get-RedactedProviderMessage -Text '{"message":"mock-secret"}' -Username '' -Password ''
if (-not $output.Contains('WITHHELD_WITHOUT_CREDENTIAL_CONTEXT')) { throw 'Missing credential context did not fail closed.' }
$passed++
$jsonMessage = ConvertTo-Json -InputObject @{message=(('x ' * 400) + $password)} -Compress
$output = Get-RedactedProviderMessage -Text $jsonMessage -Username $username -Password $password
if ($output.Length -gt 660 -or -not $output.Contains('[TRUNCATED]') -or $output.Contains('mock-secret')) { throw 'Message length/redaction order check failed.' }
$passed++

foreach ($message in @(
    '<html><title>Website fallback</title><div id="app"></div><script src="private.js"></script></html>',
    '<html><title>mock-user@example.org mock-secret/%! &amp;?</title></html>',
    '<html><title>Login token=shortHiddenValue</title><input type="password"></html>'
)) {
    $output = Get-RedactedProviderMessage -Text $message -Username $username -Password $password
    if (-not $output.StartsWith('PAGE_TITLE_REDACTED:') -or $output -match 'mock-secret|mock-user|shortHiddenValue') { throw 'HTML title redaction failed.' }
    $passed++
}
$lines = @(Get-ProviderResponseSummary -Status 200 -Text '<html><title>Website</title><div id="root"></div><script>private</script></html>')
if ($lines -notcontains 'HTML_MARKERS: SCRIPT_TAG_PRESENT, APP_CONTAINER_PRESENT') { throw 'HTML marker summary failed.' }
$passed++
Write-Output ('PASS: ' + $passed + ' offline PowerShell response/privacy tests; 0 network requests.')
