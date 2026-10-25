# Offline parsing/privacy tests. Never invoke ADB or run the capture body.
$scriptPath = Join-Path $PSScriptRoot '../scripts/Read-StartupShowDiagnostics.ps1'
$tokens = $null; $parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($scriptPath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw 'ADB helper syntax check failed.' }
$function = $ast.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Get-StartupShowLogSummary'}, $true)
if ($null -eq $function) { throw 'ADB summary function missing.' }
. ([scriptblock]::Create($function.Extent.Text))
$cases = @(
    @{Lines=@('D/client: login https://api.tvnow.best/api/login?password=mock-secret Authorization: Bearer mock-secret'); Domains=@('api.tvnow.best'); Statuses=@(); Events=@('AUTH_TEXT')},
    @{Lines=@('D/client: https://mock-user:mock-secret@infolink.me/api/list/mock-user/mock-secret HTTP/1.1 400'); Domains=@('infolink.me'); Statuses=@('400'); Events=@()},
    @{Lines=@('D/client: {"url":"https:\/\/account-secret.infolink.me\/api\/list\/mock-user\/mock-secret"}'); Domains=@('infolink.me'); Statuses=@(); Events=@()},
    @{Lines=@('D/client: https://opaque-private-secret-label.api.tvnow.best/login'); Domains=@('api.tvnow.best'); Statuses=@(); Events=@('AUTH_TEXT')},
    @{Lines=@('D/client: https://192.168.1.42:443/private/mock-secret'); Domains=@(); Statuses=@(); Events=@('IP_ADDRESS_URL_PRESENT')},
    @{Lines=@('D/client: https://[fe80::1]/private/mock-secret'); Domains=@(); Statuses=@(); Events=@('IP_ADDRESS_URL_PRESENT')},
    @{Lines=@('D/client: token=mock-secret password=mock-secret username=mock-user'); Domains=@(); Statuses=@(); Events=@()},
    @{Lines=@('E/client: SSLHandshakeException mock-secret'); Domains=@(); Statuses=@(); Events=@('TLS_ERROR_TEXT')},
    @{Lines=@('E/client: UnknownHostException and timed out mock-secret'); Domains=@(); Statuses=@(); Events=@('NETWORK_ERROR_TEXT','TIMEOUT_TEXT')},
    @{Lines=@('D/client: status=401 catalog m3u8'); Domains=@(); Statuses=@('401'); Events=@('CATALOG_TEXT')},
    @{Lines=@('D/client: api_key=mock-secret'); Domains=@(); Statuses=@(); Events=@('CLIENT_FIELD_TEXT')},
    @{Lines=@('D/client: https://api.example.co.uk/api/login'); Domains=@('api.example.co.uk'); Statuses=@(); Events=@('AUTH_TEXT')},
    @{Lines=@('D/client: https://secretaccountname0123456789.example/'); Domains=@(); Statuses=@(); Events=@('OPAQUE_HOST_LABEL_WITHHELD')},
    @{Lines=@(); Domains=@(); Statuses=@(); Events=@()}
)
$passed = 0
foreach ($case in $cases) {
    $summary = Get-StartupShowLogSummary -Lines $case.Lines
    foreach ($pair in @(@('ServerDomains','Domains'),@('HttpStatuses','Statuses'),@('Events','Events'))) {
        $actual = @($summary.($pair[0]) | Sort-Object) -join ','
        $expected = @($case.($pair[1]) | Sort-Object) -join ','
        if ($actual -ne $expected) { throw ('ADB summary mismatch in synthetic case ' + ($passed + 1) + ': ' + $pair[0]) }
    }
    $output = ConvertTo-Json -InputObject $summary -Compress
    if ($output -match 'mock-secret|mock-user|account-secret|opaque-private|192\.168|fe80|/api/|Bearer|secretaccountname') { throw 'ADB summary leaked synthetic private data.' }
    $passed++
}
Write-Output ('PASS: ' + $passed + ' offline ADB log-summary tests; 0 ADB connections.')
