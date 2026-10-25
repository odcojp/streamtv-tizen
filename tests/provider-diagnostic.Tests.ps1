# Standalone offline tests. Extract only the pure summary function; never run
# the script's credential prompt or network request. No Pester dependency.
$scriptPath = Join-Path $PSScriptRoot '../scripts/Test-ProviderLogin.ps1'
$tokens = $null; $parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($scriptPath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw 'Diagnostic PowerShell syntax check failed.' }
$summary = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Get-ProviderResponseSummary' }, $true)
if ($null -eq $summary) { throw 'Pure summary function not found.' }
. ([scriptblock]::Create($summary.Extent.Text))

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
Write-Output ('PASS: ' + $passed + ' offline PowerShell response/privacy tests; 0 network requests.')
