param(
    [string]$OutputPath = (Join-Path $PSScriptRoot '..\src\features\logs\reference\event-viewer-catalog.json')
)

$ErrorActionPreference = 'Stop'
$aliases = @{
    'Microsoft-Windows-IIS-W3SVC' = @('W3SVC')
    'Microsoft-Windows-IIS-W3SVC-WP' = @('W3SVC-WP')
    'Microsoft-Windows-IIS-IISReset' = @('IISCTLS')
    'Microsoft-Windows-WAS' = @('WAS')
    'Microsoft-Windows-WAS-ListenerAdapter' = @('WAS-LA')
    'Microsoft-Windows-HttpEvent' = @('Http')
}
$reference = Get-Content -Raw (Join-Path $PSScriptRoot '..\src\features\logs\reference\event-viewer-reference.json') | ConvertFrom-Json
$display = Get-Content -Raw (Join-Path $PSScriptRoot '..\src\features\logs\reference\event-source-display.json') | ConvertFrom-Json
$names = $reference.sources | ForEach-Object { $_.providerNames } | Sort-Object -Unique
$providers = foreach ($name in $names) {
    $provider = Get-WinEvent -ListProvider $name -ErrorAction SilentlyContinue
    if (-not $provider) { continue }
    $channels = @($provider.LogLinks.LogName | Where-Object { $_ -in @('Application', 'System') })
    if (-not $channels.Count) { continue }
    $templates = foreach ($event in $provider.Events) {
        $message = ($event.Description -replace '\x00', '').Trim()
        if (-not $message -or $message -eq 'Not used.') { continue }
        $eventChannel = $event.LogLink.LogName
        if ($eventChannel -and $eventChannel -notin $channels) { continue }
        [pscustomobject][ordered]@{
            id = ([long]$event.Id -band 65535).ToString()
            version = $event.Version
            message = $message
        }
    }
    $events = @($templates | Group-Object id | Sort-Object { [int]$_.Name } | ForEach-Object {
        $messages = @($_.Group.message | Sort-Object -Unique)
        # Conflicting versions need a version-aware reference, not an ID-only guess.
        if ($messages.Count -eq 1) {
            [ordered]@{
                id = $_.Name
                versions = @($_.Group.version | Sort-Object -Unique)
                message = $messages[0]
            }
        }
    })
    if (-not $events.Count) { continue }
    $sourceNames = @($name)
    if ($name.StartsWith('Microsoft-Windows-')) {
        $sourceNames += $name.Substring('Microsoft-Windows-'.Length)
    }
    if ($aliases.ContainsKey($name)) { $sourceNames += $aliases[$name] }
    $sourceNames += @($display.providers | Where-Object name -EQ $name | ForEach-Object { $_.aliases })
    [ordered]@{
        name = $name
        sourceNames = @($sourceNames | Sort-Object -Unique)
        channels = $channels
        events = $events
    }
}
$windows = Get-ItemProperty 'Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
$catalog = [ordered]@{
    provenance = [ordered]@{
        source = 'Installed Windows provider metadata from Get-WinEvent -ListProvider; no event records are read.'
        windowsBuild = "$($windows.CurrentBuildNumber).$($windows.UBR)"
        scope = 'Available IIS, WAS and HTTP providers linked to Application/System on the generating machine. Not an exhaustive catalog of every Windows Server or IIS version.'
        messageNotes = 'Native message templates contain insertion placeholders such as %1. They are not rendered messages or proven causes. Conflicting templates and unavailable classic provider messages are omitted.'
        url = 'https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.diagnostics/get-winevent'
    }
    providers = @($providers)
}
$catalog | ConvertTo-Json -Depth 9 | Set-Content -LiteralPath $OutputPath -Encoding utf8
Write-Output "Exported $($providers.Count) providers and $(($providers | ForEach-Object { $_.events.Count } | Measure-Object -Sum).Sum) source-specific event templates."
