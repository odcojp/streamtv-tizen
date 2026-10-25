# Candidate normal JSON login diagnostic, based on an older public community
# client. /api/login is NOT yet verified for the user's account.
# Run on your own Windows PC. No private link/password/token is printed or saved.
# One request is sent to /api/login on the supplied confirmed host, without redirects.
# Pure summary tested offline with PowerShell 7.5.4/Linux. No private network
# request or Windows-specific runtime test was performed in the cloud.

# Pure summary function: outputs only fixed labels and allowlisted field names.
function Get-ProviderResponseSummary {
    param([int]$Status, [AllowNull()][AllowEmptyString()][string]$Text)
    function Read-DiagnosticProperty($Value, [string]$Name) {
        if ($null -eq $Value) { return $null }
        $property = $Value.PSObject.Properties[$Name]
        if ($null -eq $property) { return $null }
        return ,$property.Value
    }
    if ($Status -ge 300 -and $Status -lt 400) {
        return @('BODY_FORMAT: NOT_READ', 'RESULT: REDIRECT_BLOCKED.')
    }
    $format = 'OTHER'; $value = $null
    if ([string]::IsNullOrWhiteSpace($Text)) { $format = 'EMPTY' }
    else {
        try { $value = ConvertFrom-Json -InputObject $Text -ErrorAction Stop; $format = 'JSON' }
        catch { if ($Text -match '(?is)<!doctype\s+html|<html\b') { $format = 'HTML' } }
    }
    $lines = [System.Collections.Generic.List[string]]::new()
    $lines.Add('BODY_FORMAT: ' + $format)
    $token = $null
    if ($format -eq 'JSON' -and $null -ne $value) {
        $known = @('data', 'error', 'errors', 'message', 'status', 'status_code', 'success', 'code', 'detail', 'title', 'type')
        $names = @($known | Where-Object { $null -ne $value.PSObject.Properties[$_] })
        $lines.Add('JSON_FIELDS: ' + $(if ($names.Count) { $names -join ', ' } else { 'NONE_RECOGNIZED' }))
        $dataValue = Read-DiagnosticProperty $value 'data'
        $errorValue = Read-DiagnosticProperty $value 'error'
        $token = Read-DiagnosticProperty $dataValue 'token'
        $fields = [System.Collections.Generic.List[string]]::new()
        foreach ($container in @($value, $errorValue, $dataValue)) {
            $errors = Read-DiagnosticProperty $container 'errors'
            foreach ($field in @('username', 'password', 'email', 'device_id', 'device_type', 'device_token', 'app_id', 'app_version', 'platform', 'api_key', 'client_id', 'client_secret')) {
                if ($null -ne $errors -and $null -ne $errors.PSObject.Properties[$field] -and -not $fields.Contains($field)) { $fields.Add($field) }
            }
        }
        $lines.Add('VALIDATION_FIELDS: ' + $(if ($fields.Count) { $fields -join ', ' } else { 'NONE_RECOGNIZED' }))
        $codes = @('E01', 'INVALID_CREDENTIALS', 'AUTHENTICATION_FAILED', 'UNAUTHENTICATED', 'UNAUTHORIZED', 'ACCESS_DENIED', 'VALIDATION_ERROR', 'VALIDATION_FAILED', 'BAD_REQUEST', 'METHOD_NOT_ALLOWED', 'UNSUPPORTED_MEDIA_TYPE', 'RATE_LIMITED')
        foreach ($candidate in @((Read-DiagnosticProperty $value 'code'), (Read-DiagnosticProperty $errorValue 'code'), $errorValue)) {
            if ($candidate -is [string] -and $codes -contains $candidate.ToUpperInvariant()) {
                $lines.Add('ERROR_CODE: ' + $candidate.ToUpperInvariant()); break
            }
        }
        $messages = [System.Collections.Generic.List[string]]::new()
        foreach ($container in @($value, $errorValue, $dataValue)) {
            foreach ($field in @('message', 'detail', 'title')) {
                $messageValue = Read-DiagnosticProperty $container $field
                if ($messageValue -is [string]) { $messages.Add($messageValue) }
            }
        }
        if ($errorValue -is [string]) { $messages.Add($errorValue) }
        $messageText = $messages -join ' '
        $category = 'UNCLASSIFIED'
        if ($messageText -match '(?i)api[ _-]?key|client[ _-]?(?:secret|id)|app[ _-]?key') { $category = 'CLIENT_FIELD_MENTIONED' }
        elseif ($messageText -match '(?i)\b(?:required|missing|not provided)\b') { $category = 'MISSING_INPUT_INDICATED' }
        elseif ($messageText -match '(?i)\b(?:invalid|bad)\b.{0,50}\b(?:credentials?|password|username|email|login)\b|\bunauthenticated\b|\bE01\b') { $category = 'AUTHENTICATION_INDICATED' }
        elseif ($messageText -match '(?i)method not allowed|unsupported method') { $category = 'METHOD_INDICATED' }
        elseif ($messageText -match '(?i)unsupported media|content[ -]?type|\bjson\b') { $category = 'REQUEST_FORMAT_MENTIONED' }
        elseif ($messageText -match '(?i)captcha|challenge') { $category = 'CHALLENGE_MENTIONED' }
        $lines.Add('MESSAGE_CATEGORY: ' + $category)
    }
    if ($Status -eq 401 -or $Status -eq 403) { $result = 'AUTH_OR_ACCESS_REJECTED' }
    elseif ($Status -lt 200 -or $Status -ge 300) { $result = 'HTTP_ERROR' }
    elseif ($format -eq 'EMPTY') { $result = 'EMPTY_RESPONSE' }
    elseif ($format -eq 'HTML') { $result = 'HTML_RESPONSE' }
    elseif ($format -ne 'JSON') { $result = 'NON_JSON_RESPONSE' }
    elseif ($token -is [string] -and -not [string]::IsNullOrWhiteSpace($token)) { $result = 'TOKEN_SHAPED_JSON_RECEIVED' }
    else { $result = 'JSON_RECEIVED_WITHOUT_RECOGNIZED_TOKEN' }
    $lines.Add('RESULT: ' + $result + '.')
    return $lines.ToArray()
}

$secureLink = $null
$plainLink = $null
$json = $null
$body = $null
$parsed = $null
$match = $null
$login = $null
$content = $null
$response = $null
$client = $null
$handler = $null
try {
    Add-Type -AssemblyName System.Net.Http -ErrorAction Stop
    Write-Output 'Candidate JSON login test on your supplied host; no catalog request follows.'
    $secureLink = Read-Host 'Paste your complete infolink.me or laon.live login link (input hidden)' -AsSecureString
    $plainLink = ([System.Net.NetworkCredential]::new('', $secureLink)).Password.Trim()
    $match = [regex]::Match($plainLink, '^(?i:https://(infolink\.me|laon\.live)(?::443)?)/api/list/([^/?#\\]+)/([^/?#\\]+)/?$')
    if (-not $match.Success -or $plainLink -match '%(?![0-9A-Fa-f]{2})') {
        Write-Output 'RESULT: INVALID_LINK_FORMAT. Expected your original HTTPS infolink.me or laon.live login link.'
        return
    }
    $providerHost = $match.Groups[1].Value.ToLowerInvariant()
    $endpoint = 'https://' + $providerHost + '/api/login'
    Write-Output ('HOST: ' + $providerHost)
    $login = @{
        username = [Uri]::UnescapeDataString($match.Groups[2].Value)
        password = [Uri]::UnescapeDataString($match.Groups[3].Value)
    }
    if (-not $login.username -or -not $login.password -or $login.username -in @('.', '..') -or $login.password -in @('.', '..')) {
        Write-Output 'RESULT: INVALID_LINK_FORMAT.'
        return
    }
    $json = ConvertTo-Json -InputObject $login -Compress
    $handler = [System.Net.Http.HttpClientHandler]::new()
    $handler.AllowAutoRedirect = $false
    $handler.UseCookies = $false
    $client = [System.Net.Http.HttpClient]::new($handler)
    $client.Timeout = [TimeSpan]::FromSeconds(25)
    $client.MaxResponseContentBufferSize = 1048576
    $content = [System.Net.Http.StringContent]::new($json, [Text.Encoding]::UTF8, 'application/json')
    $response = $client.PostAsync($endpoint, $content).GetAwaiter().GetResult()
    $status = [int]$response.StatusCode
    Write-Output ('HTTP_STATUS: ' + $status)
    if ($status -ge 300 -and $status -lt 400) {
        Get-ProviderResponseSummary -Status $status -Text ''
    } else {
        $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        Get-ProviderResponseSummary -Status $status -Text $body
    }
} catch {
    # Do not echo exceptions: a request or response can contain private data.
    Write-Output 'RESULT: REQUEST_FAILED. Possible network, TLS, timeout or response-size failure.'
} finally {
    if ($null -ne $response) { $response.Dispose() }
    if ($null -ne $content) { $content.Dispose() }
    if ($null -ne $client) { $client.Dispose() }
    if ($null -ne $handler) { $handler.Dispose() }
    if ($null -ne $secureLink) { $secureLink.Dispose() }
    $secureLink = $null; $plainLink = $null; $json = $null
    $body = $null; $parsed = $null; $match = $null; $login = $null
    Write-Output 'Copy only HOST, HTTP_STATUS, BODY_FORMAT, JSON_FIELDS, VALIDATION_FIELDS, ERROR_CODE, MESSAGE_CATEGORY and RESULT lines.'
}
