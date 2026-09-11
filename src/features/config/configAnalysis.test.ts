import { describe, expect, it } from 'vitest'
import { analyzeConfigFile, getReferenceStats } from './configAnalysis'
import { parseConfigText } from './configParser'
import { sampleConfigFiles } from './sampleConfigs'

const applicationHostXml = `<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.applicationHost>
    <applicationPools>
      <add name="LegacyPool" queueLength="2500" enable32BitAppOnWin64="true">
        <processModel loadUserProfile="true" />
      </add>
    </applicationPools>
    <sites>
      <site name="Default Web Site" id="1">
        <application path="/" applicationPool="LegacyPool">
          <virtualDirectory path="/" physicalPath="C:\\inetpub\\wwwroot" />
        </application>
        <bindings>
          <binding protocol="http" bindingInformation="*:80:" />
          <binding protocol="ftp" bindingInformation="*:21:" />
        </bindings>
      </site>
    </sites>
  </system.applicationHost>
  <system.webServer>
    <proxy enabled="true" />
  </system.webServer>
</configuration>`

const webConfigXml = `<configuration>
  <system.web>
    <compilation debug="true" />
    <httpRuntime executionTimeout="300" maxRequestLength="8192" />
  </system.web>
  <system.webServer>
    <directoryBrowse enabled="true" />
  </system.webServer>
</configuration>`

describe('IIS configuration analysis', () => {
  it('extracts applicationHost topology and explicit settings', () => {
    const parsed = parseConfigText(
      applicationHostXml,
      'applicationHost.config',
    )

    expect(parsed.kind).toBe('config-applicationhost')
    expect(parsed.config?.inventory.applicationPools).toEqual([
      {
        name: 'LegacyPool',
        runtime: 'inherited',
        pipeline: 'inherited',
        startMode: 'inherited',
      },
    ])
    expect(parsed.config?.inventory).toMatchObject({
      applications: 1,
      virtualDirectories: 1,
      bindings: 2,
      ftpSites: 1,
      arrEnabled: true,
    })
  })

  it('reports non-default values and focused risk comments', () => {
    const appHost = parseConfigText(
      applicationHostXml,
      'applicationHost.config',
    )
    const webConfig = parseConfigText(webConfigXml, 'web.config')
    const findings = [
      ...analyzeConfigFile(appHost),
      ...analyzeConfigFile(webConfig),
    ]

    expect(
      findings.some(
        (finding) =>
          finding.attribute === 'queueLength' &&
          finding.defaultValue === '1000',
      ),
    ).toBe(true)
    expect(
      findings.some(
        (finding) =>
          finding.attribute === 'enable32BitAppOnWin64' &&
          finding.severity === 'high',
      ),
    ).toBe(true)
    expect(
      findings.some(
        (finding) =>
          finding.attribute === 'debug' && finding.severity === 'high',
      ),
    ).toBe(true)
  })

  it('bundles the complete installed IIS and ASP.NET schema catalog', () => {
    const stats = getReferenceStats()
    expect(stats.sections).toBeGreaterThan(90)
    expect(stats.options).toBeGreaterThan(890)
    expect(stats.riskRules).toBe(24)
  })

  it('provides dramatic synthetic configuration findings', () => {
    const findings = sampleConfigFiles.flatMap(analyzeConfigFile)
    const titles = findings.map((finding) => finding.title)

    expect(sampleConfigFiles).toHaveLength(2)
    expect(titles).toContain('32-bit worker process enabled')
    expect(titles).toContain('Rapid-Fail Protection disabled')
    expect(titles).toContain('ARR proxy enabled')
    expect(titles).toContain('ASP.NET debug compilation enabled')
    expect(titles).toContain('Windows Authentication enabled')
  })
})
