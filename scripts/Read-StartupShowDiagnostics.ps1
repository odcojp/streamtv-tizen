# Read-only ADB metadata capture for the user's own Google TV.
# No rooting, app-data reads, log clearing, APK changes or HTTPS interception.
# Do not share raw logcat output. This script never prints or saves raw lines.

function Get-StartupShowLogSummary {
    param([AllowEmptyCollection()][string[]]$Lines)
    $domains = [System.Collections.Generic.HashSet[string]]::new()
    $statuses = [System.Collections.Generic.HashSet[string]]::new()
    $events = [System.Collections.Generic.HashSet[string]]::new()
    $count = 0
    foreach ($entry in $Lines) {
        if ($null -eq $entry) { continue }
        $count++
        # JSON-style slash escaping can otherwise hide a URL from extraction.
        $normalized = $entry.Replace('\/', '/')
        foreach ($match in [regex]::Matches($normalized, '(?i)https?://[^\s<>"'']+')) {
            $uri = $null
            if (-not [Uri]::TryCreate($match.Value, [UriKind]::Absolute, [ref]$uri)) { continue }
            $hostName = $uri.DnsSafeHost.ToLowerInvariant().TrimEnd('.')
            $ip = $null
            if ([Net.IPAddress]::TryParse($hostName.Trim('[', ']'), [ref]$ip)) {
                [void]$events.Add('IP_ADDRESS_URL_PRESENT'); continue
            }
            if ($hostName -notmatch '^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$') { continue }
            $labels = $hostName.Split('.')
            if ($labels.Count -lt 2 -or $labels[-1] -notmatch '^[a-z]{2,24}$') { continue }
            # Reveal public domain suffixes, not arbitrary per-account subdomains.
            $suffixLength = 2
            if (($labels[-2] + '.' + $labels[-1]) -in @('co.uk', 'org.uk', 'com.au', 'co.nz', 'co.jp')) { $suffixLength = 3 }
            if ($labels.Count -lt $suffixLength) { continue }
            $rootLabels = @($labels[($labels.Count - $suffixLength)..($labels.Count - 1)])
            if (@($rootLabels | Where-Object { $_.Length -gt 24 }).Count) { [void]$events.Add('OPAQUE_HOST_LABEL_WITHHELD'); continue }
            $root = $rootLabels -join '.'
            if ($labels.Count -gt $suffixLength) {
                $prefix = $labels[$labels.Count - $suffixLength - 1]
                if ($prefix -in @('api', 'auth', 'login', 'portal', 'service', 'services', 'app', 'backend', 'media', 'stream', 'streams', 'cdn', 'vod', 'www')) { $root = $prefix + '.' + $root }
            }
            [void]$domains.Add($root)
        }
        foreach ($match in [regex]::Matches($normalized, '(?i)(?:HTTP/\d(?:\.\d)?\s+|\b(?:http\s+status|http|status(?:code)?|response\s+code)\s*[:=]\s*)([1-5]\d\d)\b')) {
            [void]$statuses.Add($match.Groups[1].Value)
        }
        foreach ($definition in @(
            @('TLS_ERROR_TEXT', 'SSLHandshakeException|CertPathValidator|CERTIFICATE_VERIFY_FAILED|SSLProtocolException'),
            @('NETWORK_ERROR_TEXT', 'UnknownHostException|ConnectException|ECONNREFUSED|network is unreachable'),
            @('TIMEOUT_TEXT', 'timed out|\btimeout\b|ETIMEDOUT'),
            @('AUTH_TEXT', '\blogin\b|\bauthentication\b|\bauthorization\b|\bunauthenticated\b'),
            @('CATALOG_TEXT', '\bplaylist\b|\bcatalog\b|\bm3u8?\b'),
            @('CLIENT_FIELD_TEXT', 'client[_ -]?id|client[_ -]?secret|api[_ -]?key'),
            @('CHALLENGE_TEXT', '\bcaptcha\b|challenge-platform')
        )) {
            if ($normalized -match ('(?i)' + $definition[1])) { [void]$events.Add($definition[0]) }
        }
    }
    return [pscustomobject]@{
        LinesInspected = $count
        ServerDomains = @($domains | Sort-Object)
        HttpStatuses = @($statuses | Sort-Object)
        Events = @($events | Sort-Object)
    }
}

$adbPath = $null; $capture = $null; $line = $null; $lineTask = $null; $errorTask = $null
try {
    $adbPath = (Get-Command adb -CommandType Application -ErrorAction Stop).Source
    $devices = @(& $adbPath devices 2>$null | Where-Object { $_ -match '^\S+\s+device\b' })
    if ($devices.Count -ne 1) { Write-Output 'RESULT: CONNECT_EXACTLY_ONE_AUTHORIZED_ADB_DEVICE'; return }
    $deviceSerial = ($devices[0] -split '\s+')[0]
    if ($deviceSerial -notmatch '^[A-Za-z0-9_.:\[\]-]+$') { Write-Output 'RESULT: UNSUPPORTED_ADB_DEVICE_IDENTIFIER'; return }
    $processText = ((& $adbPath -s $deviceSerial shell pidof tv.startupshow.android 2>$null) -join ' ').Trim()
    if ($processText -notmatch '^\d+$') { Write-Output 'RESULT: OPEN_STARTUP_SHOW_FIRST'; return }
    $startupProcessId = $processText
    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $adbPath
    $startInfo.Arguments = '-s ' + $deviceSerial + ' logcat --pid=' + $startupProcessId + ' -v brief -T 1'
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardOutput = $true; $startInfo.RedirectStandardError = $true
    $startInfo.CreateNoWindow = $true
    $capture = [Diagnostics.Process]::new(); $capture.StartInfo = $startInfo
    [void]$capture.Start()
    $errorTask = $capture.StandardError.ReadToEndAsync()
    $lineTask = $capture.StandardOutput.ReadLineAsync()
    $watch = [Diagnostics.Stopwatch]::StartNew()
    $seenDomains = [System.Collections.Generic.HashSet[string]]::new()
    $seenStatuses = [System.Collections.Generic.HashSet[string]]::new()
    $seenEvents = [System.Collections.Generic.HashSet[string]]::new()
    $totalLines = 0
    Write-Output 'CAPTURE_STARTED: 45 seconds. Reproduce your successful Startup Show login now.'
    while ($watch.Elapsed.TotalSeconds -lt 45) {
        if (-not $lineTask.IsCompleted) { Start-Sleep -Milliseconds 100; continue }
        $line = $lineTask.GetAwaiter().GetResult()
        if ($null -eq $line) { break }
        $summary = Get-StartupShowLogSummary -Lines @($line)
        $totalLines += $summary.LinesInspected
        foreach ($value in $summary.ServerDomains) { [void]$seenDomains.Add($value) }
        foreach ($value in $summary.HttpStatuses) { [void]$seenStatuses.Add($value) }
        foreach ($value in $summary.Events) { [void]$seenEvents.Add($value) }
        $line = $null
        $lineTask = $capture.StandardOutput.ReadLineAsync()
    }
    $watch.Stop()
    if (-not $capture.HasExited) { $capture.Kill(); $capture.WaitForExit() }
    if ($capture.ExitCode -ne 0 -and $watch.Elapsed.TotalSeconds -lt 44) {
        Write-Output 'RESULT: ADB_LOGCAT_EXITED_WITH_ERROR'; return
    }
    $currentProcess = ((& $adbPath -s $deviceSerial shell pidof tv.startupshow.android 2>$null) -join ' ').Trim()
    if ($currentProcess -ne $startupProcessId) { [void]$seenEvents.Add('APP_PROCESS_CHANGED_DURING_CAPTURE') }
    Write-Output ('LINES_INSPECTED: ' + $totalLines)
    Write-Output ('SERVER_DOMAINS: ' + $(if ($seenDomains.Count) { ($seenDomains | Sort-Object) -join ', ' } else { 'NONE_OBSERVED' }))
    Write-Output ('HTTP_STATUS_CODES: ' + $(if ($seenStatuses.Count) { ($seenStatuses | Sort-Object) -join ', ' } else { 'NONE_OBSERVED' }))
    Write-Output ('EVENT_LABELS: ' + $(if ($seenEvents.Count) { ($seenEvents | Sort-Object) -join ', ' } else { 'NONE_OBSERVED' }))
    if ($seenDomains.Count -or $seenStatuses.Count) { Write-Output 'RESULT: NETWORK_METADATA_OBSERVED; this does not establish request paths or authentication.' }
    else { Write-Output 'RESULT: NO_NETWORK_METADATA_OBSERVED; release apps may not log HTTP details.' }
    Write-Output 'Review server domains locally before sharing these summary lines. Never share raw logcat output.'
} catch {
    Write-Output 'RESULT: ADB_CAPTURE_FAILED; no raw error or log text displayed.'
} finally {
    if ($null -ne $capture) {
        try { if (-not $capture.HasExited) { $capture.Kill(); $capture.WaitForExit() } } catch {}
        $capture.Dispose()
    }
    $line = $null; $lineTask = $null; $errorTask = $null; $summary = $null
}
