# Candidate normal JSON login diagnostic, based on an older public community
# client. /api/login is NOT yet verified for the user's infolink.me account.
# Run on your own Windows PC. No private link/password/token is printed or saved.
# Only one request is sent, to https://infolink.me/api/login, without redirects.
# This script has not been executed in the Linux cloud (PowerShell unavailable).

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
    Write-Output 'Candidate JSON login test on infolink.me; no catalog request follows.'
    $secureLink = Read-Host 'Paste your complete infolink.me login link (input hidden)' -AsSecureString
    $plainLink = ([System.Net.NetworkCredential]::new('', $secureLink)).Password.Trim()
    $match = [regex]::Match($plainLink, '^(?i:https://infolink\.me(?::443)?)/api/list/([^/?#\\]+)/([^/?#\\]+)/?$')
    if (-not $match.Success -or $plainLink -match '%(?![0-9A-Fa-f]{2})') {
        Write-Output 'RESULT: INVALID_LINK_FORMAT. Expected your original HTTPS infolink.me login link.'
        return
    }
    $login = @{
        username = [Uri]::UnescapeDataString($match.Groups[1].Value)
        password = [Uri]::UnescapeDataString($match.Groups[2].Value)
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
    $response = $client.PostAsync('https://infolink.me/api/login', $content).GetAwaiter().GetResult()
    $status = [int]$response.StatusCode
    Write-Output ('HTTP_STATUS: ' + $status)
    if ($status -ge 300 -and $status -lt 400) {
        Write-Output 'RESULT: REDIRECT_BLOCKED.'
        return
    }
    if ($status -eq 401 -or $status -eq 403) {
        Write-Output 'RESULT: AUTH_OR_ACCESS_REJECTED.'
        return
    }
    if (-not $response.IsSuccessStatusCode) {
        Write-Output 'RESULT: HTTP_ERROR.'
        return
    }
    $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    if ([string]::IsNullOrWhiteSpace($body)) {
        Write-Output 'RESULT: EMPTY_RESPONSE.'
        return
    }
    try {
        $parsed = ConvertFrom-Json -InputObject $body -ErrorAction Stop
    } catch {
        if ($body -match '(?is)^\s*(?:<!doctype\s+html|<html\b)') {
            Write-Output 'RESULT: HTML_RESPONSE.'
        } else {
            Write-Output 'RESULT: NON_JSON_RESPONSE.'
        }
        return
    }
    if ($null -ne $parsed -and $null -ne $parsed.PSObject.Properties['data'] -and
        $null -ne $parsed.data -and $null -ne $parsed.data.PSObject.Properties['token'] -and
        $parsed.data.token -is [string] -and -not [string]::IsNullOrWhiteSpace($parsed.data.token)) {
        Write-Output 'RESULT: TOKEN_SHAPED_JSON_RECEIVED. Token value withheld; catalog access not verified.'
    } else {
        Write-Output 'RESULT: JSON_RECEIVED_WITHOUT_RECOGNIZED_TOKEN.'
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
    Write-Output 'Copy only HTTP_STATUS and RESULT lines when reporting the outcome.'
}
