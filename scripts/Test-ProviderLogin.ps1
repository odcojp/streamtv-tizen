# RETIRED LIVE DIAGNOSTIC. The supplied provider guide documents M3U playlist
# access; guessed same-host JSON login did not establish a working API contract.
# Pure response/redaction functions remain for offline privacy tests only.
# This file no longer prompts for credentials or makes network requests.

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
    if ($format -eq 'HTML') {
        $markers = [System.Collections.Generic.List[string]]::new()
        if ($Text -match '(?i)<script\b') { $markers.Add('SCRIPT_TAG_PRESENT') }
        if ($Text -match '(?i)<app-root\b|id\s*=\s*["''](?:app|root)["'']') { $markers.Add('APP_CONTAINER_PRESENT') }
        if ($Text -match '(?i)type\s*=\s*["'']password["'']') { $markers.Add('PASSWORD_FIELD_PRESENT') }
        if ($Text -match '(?i)captcha|cloudflare|challenge-platform') { $markers.Add('CHALLENGE_TEXT_PRESENT') }
        if ($Text -match '(?i)\bE01\b') { $markers.Add('E01_TEXT_PRESENT') }
        if ($Text -match '(?i)http-equiv\s*=\s*["'']refresh["'']') { $markers.Add('META_REFRESH_PRESENT') }
        $lines.Add('HTML_MARKERS: ' + $(if ($markers.Count) { $markers -join ', ' } else { 'NONE_RECOGNIZED' }))
    }
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


# Only a root JSON message or bounded HTML title is eligible; bodies remain withheld.
# Known credentials are mandatory, and redaction happens before truncation.
function Get-RedactedProviderMessage {
    param([AllowNull()][AllowEmptyString()][string]$Text,
          [AllowNull()][AllowEmptyString()][string]$Username,
          [AllowNull()][AllowEmptyString()][string]$Password)
    if ([string]::IsNullOrEmpty($Username) -or [string]::IsNullOrEmpty($Password)) {
        return 'PROVIDER_MESSAGE_REDACTED: WITHHELD_WITHOUT_CREDENTIAL_CONTEXT'
    }
    try {
        $prefix = 'PROVIDER_MESSAGE_REDACTED: '
        $detail = $null
        try {
            $value = ConvertFrom-Json -InputObject $Text -ErrorAction Stop
            if ($null -eq $value) { return $prefix + 'NO_TEXT_MESSAGE' }
            $property = $value.PSObject.Properties['message']
            if ($null -eq $property -or $property.Value -isnot [string]) { return $prefix + 'NO_TEXT_MESSAGE' }
            $detail = $property.Value
        } catch {
            $titleMatch = [regex]::Match($Text, '(?is)<title\b[^>]*>(.{0,4096}?)</title>')
            if (-not $titleMatch.Success) { return $prefix + 'NO_TEXT_MESSAGE' }
            $detail = $titleMatch.Groups[1].Value
            $prefix = 'PAGE_TITLE_REDACTED: '
        }
        $textMessage = [Net.WebUtility]::HtmlDecode($detail).Replace('\/', '/')
        $textMessage = [regex]::Replace($textMessage, '(?i)https?://[^\s<>"'']+', '[REDACTED URL]')
        $textMessage = [regex]::Replace($textMessage, '(?i)/api/(?:list|login)/[^\s<>"'']+', '/api/[REDACTED]')
        $textMessage = [regex]::Replace($textMessage, '(?i)\b(access[_ -]?token|refresh[_ -]?token|token|api[_ -]?key|client[_ -]?secret|session[_ -]?id)\b\s*[:=]\s*["'']?[^ \t\r\n,;"'']+', '$1=[REDACTED]')
        $textMessage = [regex]::Replace($textMessage, '\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b', '[REDACTED TOKEN]')
        $textMessage = [regex]::Replace($textMessage, '(?i)\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b', '[REDACTED ID]')
        $secrets = [System.Collections.Generic.List[string]]::new()
        foreach ($secret in @($Username, $Password, ($Username + ':' + $Password))) {
            foreach ($form in @($secret, $secret.Normalize([Text.NormalizationForm]::FormC), $secret.Normalize([Text.NormalizationForm]::FormD))) {
                $secrets.Add($form)
                $encoded = [Uri]::EscapeDataString($form)
                $secrets.Add($encoded); $secrets.Add([Uri]::EscapeDataString($encoded))
                $secrets.Add([Net.WebUtility]::UrlEncode($form))
                $base64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($form))
                $secrets.Add($base64); $secrets.Add($base64.TrimEnd('=').Replace('+','-').Replace('/','_'))
            }
        }
        foreach ($secret in ($secrets | Select-Object -Unique | Sort-Object Length -Descending)) {
            if ($secret.Length) { $textMessage = [regex]::Replace($textMessage, [regex]::Escape($secret), '[REDACTED]', [Text.RegularExpressions.RegexOptions]::IgnoreCase) }
        }
        $textMessage = [regex]::Replace($textMessage, '(?i)[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}', '[REDACTED EMAIL]')
        $textMessage = [regex]::Replace($textMessage, '\b[A-Za-z0-9_+/=-]{24,}\b', '[REDACTED VALUE]')
        $textMessage = [regex]::Replace($textMessage, '[\x00-\x1f\x7f-\x9f]', ' ')
        $textMessage = [regex]::Replace($textMessage, '\s+', ' ').Trim()
        if ($textMessage.Length -gt 600) { $textMessage = $textMessage.Substring(0,600) + ' [TRUNCATED]' }
        if (-not $textMessage.Length) { $textMessage = 'EMPTY_TEXT_MESSAGE' }
        return $prefix + $textMessage
    } catch { return 'PROVIDER_MESSAGE_REDACTED: WITHHELD_UNPARSABLE_MESSAGE' }
}

Write-Output 'RESULT: JSON_LOGIN_DIAGNOSTIC_RETIRED_UNVERIFIED_CONTRACT'
Write-Output 'No request sent. Follow the provider-documented M3U playlist setup.'
