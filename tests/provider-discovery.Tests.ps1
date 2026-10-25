# Offline request/response tests. Do not execute the helper transport.
$tokens=$null; $parseErrors=$null
$path=Join-Path $PSScriptRoot '../scripts/Test-ProviderDiscovery.ps1'
$ast=[Management.Automation.Language.Parser]::ParseFile($path,[ref]$tokens,[ref]$parseErrors)
if ($parseErrors.Count) { throw 'Discovery helper syntax failed.' }
foreach ($name in @('New-ProviderDiscoveryRequest','Get-ProviderDiscoverySummary','Get-ProviderResponseSummary','Get-RedactedProviderMessage')) {
    $fn=$ast.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name},$true)
    if ($null -eq $fn) { throw 'Discovery helper function missing.' }
    . ([scriptblock]::Create($fn.Extent.Text))
}
$passed=0
# Both formerly valid and invalid links must now fail closed: the original
# discovery target assumption was disproven by deeper static caller tracing.
foreach ($link in @('https://laon.live/api/list/mock/mock-secret','https://infolink.me/api/list/mock/mock-secret',
    'https://example.org/api/list/mock/mock','http://laon.live/api/list/mock/mock',
    'https://laon.live/api/list/mock/mock?private=x','https://laon.live/api/list/mock/%2e%2e',
    'https://user:pass@laon.live/api/list/mock/mock','https://laon.live/api/list/mock/mock/extra')) {
    $rejected=$false
    try { $null=New-ProviderDiscoveryRequest -Link $link } catch { $rejected=$_.Exception.Message -eq 'DISCOVERY_DIAGNOSTIC_RETIRED_WRONG_ENDPOINT_ASSUMPTION' }
    if (-not $rejected) { throw 'Retired discovery request builder did not fail closed.' }
    $passed++
}
$cases=@(
 @{Status=200;Text='{"result":"api.provider.example.org"}';Expected='RESULT: DOMAIN_CANDIDATE_RECEIVED_NOT_CONTACTED';Metadata='CANDIDATE_DOMAIN_METADATA: example.org'},
 @{Status=200;Text='{"result":"account-private.api.example.org"}';Expected='RESULT: DOMAIN_CANDIDATE_RECEIVED_NOT_CONTACTED';Metadata='CANDIDATE_DOMAIN_METADATA: api.example.org'},
 @{Status=200;Text='{"result":"example.org","success":false}';Expected='RESULT: DISCOVERY_PROVIDER_REJECTED'},
 @{Status=400;Text='{"message":"mock-secret","success":false}';Expected='RESULT: DISCOVERY_HTTP_ERROR'},
 @{Status=302;Text='{"result":"example.org"}';Expected='RESULT: DISCOVERY_REDIRECT_BLOCKED'},
 @{Status=200;Text='<html>mock-secret</html>';Expected='RESULT: DISCOVERY_UNSUPPORTED_RESPONSE'},
 @{Status=200;Text='{"data":{"token":"mock-secret"}}';Expected='RESULT: DISCOVERY_NO_DOMAIN_FIELD'},
 @{Status=200;Text='{"result":"https://example.org/private/mock-secret"}';Expected='RESULT: DISCOVERY_UNSUPPORTED_DOMAIN_VALUE'},
 @{Status=200;Text='{"result":"127.0.0.1"}';Expected='RESULT: DISCOVERY_UNSUPPORTED_DOMAIN_VALUE'},
 @{Status=200;Text='{"result":"host.local"}';Expected='RESULT: DISCOVERY_UNSUPPORTED_DOMAIN_VALUE'},
 @{Status=200;Text='{"result":"mock-secret.example.org"}';Expected='RESULT: DOMAIN_CANDIDATE_RECEIVED_NOT_CONTACTED';Metadata='CANDIDATE_DOMAIN_METADATA: example.org'},
 @{Status=200;Text='{"result":"mock-secret.org"}';Expected='RESULT: DOMAIN_CANDIDATE_RECEIVED_NOT_CONTACTED';Metadata='CANDIDATE_DOMAIN_METADATA: WITHHELD_REVIEW_PRIVATELY'},
 @{Status=200;Text='null';Expected='RESULT: DISCOVERY_UNSUPPORTED_RESPONSE'}
)
foreach ($case in $cases) {
    $lines=@(Get-ProviderDiscoverySummary -Status $case.Status -Text $case.Text -Username 'mock-user' -Password 'mock-secret')
    if ($lines -notcontains $case.Expected) { throw 'Unexpected discovery classification.' }
    if ($case.ContainsKey('Metadata') -and $lines -notcontains $case.Metadata) { throw 'Unexpected domain metadata summary.' }
    if (($lines -join ' ') -match 'mock-secret|account-private|https?://|/api/') { throw 'Private discovery data leaked.' }
    $passed++
}
Write-Output ('PASS: '+$passed+' offline discovery retirement/response tests; 0 provider requests.')
