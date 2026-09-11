[CmdletBinding()]
param(
    [string]$SchemaDirectory = "$env:windir\System32\inetsrv\config\schema",
    [string]$OutputPath = (Join-Path $PSScriptRoot '..\src\features\config\reference\iis-configuration-reference.xml')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $SchemaDirectory -PathType Container)) {
    throw "IIS configuration schema directory not found: $SchemaDirectory"
}
$schemaFiles = @(Get-ChildItem -LiteralPath $SchemaDirectory -Filter '*.xml' |
    Sort-Object Name)
if ($schemaFiles.Count -eq 0) {
    throw "No IIS configuration schemas were found in: $SchemaDirectory"
}

function Get-NodeAttribute {
    param(
        [System.Xml.XmlNode]$Node,
        [string]$Name
    )

    $attribute = $Node.Attributes[$Name]
    if ($null -eq $attribute) {
        return $null
    }

    return $attribute.Value
}

function Write-Option {
    param(
        [System.Xml.XmlWriter]$Writer,
        [System.Xml.XmlNode]$Attribute,
        [string]$ElementPath
    )

    $Writer.WriteStartElement('option')
    $Writer.WriteAttributeString('elementPath', $ElementPath)
    foreach ($name in @(
        'name',
        'type',
        'defaultValue',
        'required',
        'isUniqueKey',
        'isCombinedKey',
        'encrypted',
        'allowInfinite',
        'timeSpanFormat',
        'validationType',
        'validationParameter'
    )) {
        $value = Get-NodeAttribute -Node $Attribute -Name $name
        if ($null -ne $value -and $value -ne '') {
            $Writer.WriteAttributeString($name, $value)
        }
    }

    $values = @($Attribute.ChildNodes | Where-Object {
        $_.NodeType -eq [System.Xml.XmlNodeType]::Element -and
        ($_.Name -eq 'enum' -or $_.Name -eq 'flags')
    } | ForEach-Object { Get-NodeAttribute -Node $_ -Name 'name' })
    if ($values.Count -gt 0) {
        $Writer.WriteAttributeString('allowedValues', ($values -join '|'))
    }
    $Writer.WriteEndElement()
}

function Get-ElementPath {
    param(
        [System.Xml.XmlNode]$Attribute,
        [System.Xml.XmlNode]$Section
    )

    $segments = [System.Collections.Generic.List[string]]::new()
    $current = $Attribute.ParentNode
    while ($null -ne $current -and $current -ne $Section) {
        if ($current.Name -eq 'collection') {
            $name = Get-NodeAttribute -Node $current -Name 'addElement'
            if (-not $name) {
                $name = 'add'
            }
            $segments.Insert(0, $name)
        }
        elseif ($current.Name -eq 'element') {
            $segments.Insert(0, (Get-NodeAttribute -Node $current -Name 'name'))
        }
        else {
            $segments.Insert(0, $current.Name)
        }
        $current = $current.ParentNode
    }

    return $segments -join '/'
}

$outputDirectory = Split-Path -Parent $OutputPath
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

$settings = [System.Xml.XmlWriterSettings]::new()
$settings.Indent = $true
$settings.Encoding = [System.Text.UTF8Encoding]::new($false)
$writer = [System.Xml.XmlWriter]::Create($OutputPath, $settings)

try {
    $writer.WriteStartDocument()
    $writer.WriteStartElement('iisConfigurationReference')
    $writer.WriteAttributeString('schemaVersion', '1')
    $writer.WriteAttributeString(
        'source',
        'Microsoft configuration schema XML files installed with IIS'
    )
    $writer.WriteAttributeString(
        'documentation',
        'https://learn.microsoft.com/iis/get-started/planning-your-iis-architecture/introduction-to-applicationhostconfig'
    )

    foreach ($schemaFile in $schemaFiles) {
        [xml]$schema = Get-Content -LiteralPath $schemaFile.FullName -Raw
        foreach ($section in $schema.SelectNodes('//sectionSchema')) {
            $writer.WriteStartElement('section')
            $writer.WriteAttributeString('path', $section.name)
            $writer.WriteAttributeString('source', $schemaFile.Name)
            foreach ($attribute in $section.SelectNodes('.//attribute')) {
                $elementPath = Get-ElementPath -Attribute $attribute -Section $section
                Write-Option -Writer $writer -Attribute $attribute -ElementPath $elementPath
            }
            $writer.WriteEndElement()
        }
    }

    $writer.WriteStartElement('riskRules')
    $riskRules = @(
        @{ path='system.applicationHost/applicationPools/*'; attribute='enable32BitAppOnWin64'; operator='equals'; value='true'; severity='high'; title='32-bit worker process enabled'; comment='A 32-bit worker process has a substantially smaller user-mode address space and can encounter out-of-memory failures earlier than a 64-bit process.'; recommendation='Confirm that 32-bit dependencies require this setting and correlate memory pressure with private bytes, virtual bytes, and crash evidence.' },
        @{ path='system.applicationHost/applicationPools/*'; attribute='queueLength'; operator='greaterThan'; value='1000'; severity='medium'; title='Application pool queue length increased'; comment='A larger queue can retain more waiting requests, increasing latency and memory pressure while masking downstream saturation.'; recommendation='Validate sustained throughput, request latency, HTTPERR QueueFull records, and the capacity of downstream dependencies.' },
        @{ path='system.applicationHost/applicationPools/*'; attribute='queueLength'; operator='lessThan'; value='1000'; severity='medium'; title='Application pool queue length reduced'; comment='A smaller queue can reject bursts sooner and may increase HTTP 503 responses when worker processes are saturated or starting.'; recommendation='Correlate with HTTPERR QueueFull records and confirm that the reduced limit is intentional.' },
        @{ path='system.applicationHost/applicationPools/*/failure'; attribute='rapidFailProtection'; operator='equals'; value='false'; severity='high'; title='Rapid-Fail Protection disabled'; comment='Repeated worker-process crashes may continue without the application pool being stopped, increasing churn and resource consumption.'; recommendation='Confirm why crash-loop protection is disabled and review WAS and Application event logs for repeated failures.' },
        @{ path='system.applicationHost/applicationPools/*/processModel'; attribute='loadUserProfile'; operator='equals'; value='true'; severity='medium'; title='Worker-process user profile loading enabled'; comment='Profile loading can affect startup, registry access, temporary paths, and resource usage for the application pool identity.'; recommendation='Verify that the application requires a user profile and correlate profile service warnings with pool startup failures.' },
        @{ path='system.applicationHost/applicationPools/*/processModel'; attribute='maxProcesses'; operator='greaterThan'; value='1'; severity='medium'; title='Web garden enabled'; comment='Multiple worker processes can duplicate in-process cache and session state and complicate request affinity and memory analysis.'; recommendation='Confirm the application is designed for multiple worker processes and does not depend on in-process state.' },
        @{ path='system.applicationHost/applicationPools/*/recycling/periodicRestart'; attribute='time'; operator='notEquals'; value='29:00:00'; severity='low'; title='Periodic recycle interval customized'; comment='Custom recycle timing can cause cold starts or interrupt long-running work at a schedule that differs from the IIS default.'; recommendation='Correlate recycle events with traffic and ensure overlapped recycling and application warm-up are appropriate.' },
        @{ path='system.webServer/security/requestFiltering/requestLimits'; attribute='maxAllowedContentLength'; operator='greaterThan'; value='30000000'; severity='medium'; title='Request body limit increased'; comment='Allowing larger request bodies can increase upload time, disk use, and memory or bandwidth pressure.'; recommendation='Confirm the business requirement and align proxy, ASP.NET, and application-level request limits.' },
        @{ path='system.webServer/security/requestFiltering'; attribute='allowDoubleEscaping'; operator='equals'; value='true'; severity='high'; title='Double escaping allowed'; comment='Allowing double-escaped URL sequences broadens accepted input and can weaken path and request validation assumptions.'; recommendation='Keep disabled unless a verified application requirement exists and test canonicalization and authorization behavior.' },
        @{ path='system.webServer/directoryBrowse'; attribute='enabled'; operator='equals'; value='true'; severity='medium'; title='Directory browsing enabled'; comment='Directory listings can disclose file names, application structure, backups, or other unintended content.'; recommendation='Disable unless directory listing is an explicit feature and confirm authorization boundaries.' },
        @{ path='system.webServer/httpErrors'; attribute='errorMode'; operator='equals'; value='Detailed'; severity='medium'; title='Detailed IIS errors enabled'; comment='Detailed errors can expose implementation and environment information to clients.'; recommendation='Use detailed errors only in controlled troubleshooting scopes and return generic errors to remote production clients.' },
        @{ path='system.webServer/proxy'; attribute='enabled'; operator='equals'; value='true'; severity='medium'; title='ARR proxy enabled'; comment='The server is acting as a reverse proxy, so timeout, buffering, affinity, and upstream health settings can affect availability and latency.'; recommendation='Review proxy timeouts, preserve-host-header requirements, upstream health, and forwarded-header trust.' },
        @{ path='system.webServer/security/authentication/basicAuthentication'; attribute='enabled'; operator='equals'; value='true'; severity='high'; title='Basic authentication enabled'; comment='Basic authentication transmits reusable credentials and requires TLS protection for every request path.'; recommendation='Require HTTPS, disable plaintext access, and confirm credential delegation and storage requirements.' },
        @{ path='system.webServer/security/authentication/windowsAuthentication'; attribute='enabled'; operator='equals'; value='true'; severity='medium'; title='Windows Authentication enabled'; comment='Windows Authentication changes the request identity flow and can introduce repeated challenges, delegation constraints, and Kerberos or NTLM dependency issues.'; recommendation='Review providers, kernel-mode settings, SPNs, delegation, application-pool identity, and 401 substatus evidence.' },
        @{ path='system.webServer/security/authentication/anonymousAuthentication'; attribute='enabled'; operator='equals'; value='true'; severity='low'; title='Anonymous authentication enabled'; comment='Anonymous access may be expected for public sites but can expose resources if authorization rules are incomplete.'; recommendation='Confirm authorization rules and filesystem permissions for every anonymous application path.' },
        @{ path='system.web/compilation'; attribute='debug'; operator='equals'; value='true'; severity='high'; title='ASP.NET debug compilation enabled'; comment='Debug compilation increases execution overhead, disables important optimizations, and can extend request timeouts.'; recommendation='Disable in production and rebuild with production diagnostics and symbol handling.' },
        @{ path='system.web/httpRuntime'; attribute='executionTimeout'; operator='greaterThan'; value='110'; severity='medium'; title='ASP.NET execution timeout increased'; comment='Long execution timeouts can retain blocked requests and associated resources for longer during dependency failures.'; recommendation='Confirm the workload requires the higher timeout and correlate with request queues, thread usage, and downstream latency.' },
        @{ path='system.web/httpRuntime'; attribute='maxRequestLength'; operator='greaterThan'; value='4096'; severity='medium'; title='ASP.NET request size limit increased'; comment='Larger managed request bodies can increase memory, disk, and bandwidth pressure.'; recommendation='Align this limit with IIS requestFiltering and enforce application-specific upload validation.' },
        @{ path='system.web/sessionState'; attribute='mode'; operator='equals'; value='InProc'; severity='medium'; title='In-process ASP.NET session state'; comment='Session data consumes worker-process memory and is lost on recycle or crash; large sessions can amplify memory growth.'; recommendation='Measure session size and growth, and consider an out-of-process provider when resilience or scale-out is required.' },
        @{ path='system.web/customErrors'; attribute='mode'; operator='equals'; value='Off'; severity='medium'; title='ASP.NET custom errors disabled'; comment='Detailed exception information may be returned to remote clients.'; recommendation='Use RemoteOnly or On in production and preserve detailed diagnostics in protected server-side logs.' },
        @{ path='system.web/httpCookies'; attribute='httpOnlyCookies'; operator='equals'; value='false'; severity='medium'; title='HttpOnly cookies disabled'; comment='Client-side script can access cookies that do not set HttpOnly, increasing impact if script injection occurs.'; recommendation='Enable HttpOnly for cookies that do not require script access.' },
        @{ path='system.web/httpCookies'; attribute='requireSSL'; operator='equals'; value='false'; severity='medium'; title='Secure cookies not required'; comment='Cookies may be sent over unencrypted HTTP when the application is reachable without strict HTTPS enforcement.'; recommendation='Require HTTPS and Secure cookies for production authentication and session data.' },
        @{ path='system.web/identity'; attribute='impersonate'; operator='equals'; value='true'; severity='medium'; title='ASP.NET impersonation enabled'; comment='Request execution identity changes can broaden access paths and make authorization and auditing harder to reason about.'; recommendation='Verify the intended identity flow, least-privilege permissions, and delegation boundaries.' },
        @{ path='system.web/trace'; attribute='enabled'; operator='equals'; value='true'; severity='medium'; title='ASP.NET tracing enabled'; comment='Tracing can expose request, control, cookie, header, and server details and adds runtime overhead.'; recommendation='Disable after troubleshooting and restrict local-only access while enabled.' }
    )

    foreach ($rule in $riskRules) {
        $writer.WriteStartElement('risk')
        foreach ($name in @('path', 'attribute', 'operator', 'value', 'severity', 'title', 'comment', 'recommendation')) {
            $writer.WriteAttributeString($name, $rule[$name])
        }
        $writer.WriteEndElement()
    }
    $writer.WriteEndElement()
    $writer.WriteEndElement()
    $writer.WriteEndDocument()
}
finally {
    $writer.Dispose()
}

Write-Host "Generated IIS configuration reference: $OutputPath"
