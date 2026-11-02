import { describe, expect, it } from 'vitest'
import { parseConfigText } from '../configParser'
import { getSampleConfigFiles } from '../sampleConfigs'
import { buildArchitecture } from './architecture'

const [applicationHost, webConfig] = getSampleConfigFiles()
const baseModel = applicationHost.config!.model!
const webModel = webConfig.config!.model!

const sample = buildArchitecture(baseModel, { 'site:4': webModel })

const arrHost = `<?xml version="1.0"?>
<configuration>
  <system.applicationHost>
    <applicationPools><add name="DefaultAppPool" /></applicationPools>
    <sites>
      <site name="Default Web Site" id="1">
        <application path="/"><virtualDirectory path="/" physicalPath="C:\\inetpub\\wwwroot" /></application>
        <bindings><binding protocol="http" bindingInformation="*:80:" /></bindings>
      </site>
    </sites>
  </system.applicationHost>
  <webFarms>
    <webFarm name="back" enabled="true">
      <server address="10.0.0.4" enabled="true" />
    </webFarm>
  </webFarms>
  <system.webServer>
    <rewrite>
      <globalRules>
        <rule name="ARR_back_loadbalance" patternSyntax="Wildcard" stopProcessing="true">
          <match url="*" />
          <action type="Rewrite" url="http://back/{R:0}" />
        </rule>
      </globalRules>
    </rewrite>
    <proxy enabled="true" />
  </system.webServer>
</configuration>`

describe('IIS architecture model', () => {
  it('keeps the bundled sample to three web sites and two FTP sites', () => {
    expect(sample.sites.filter((site) => site.kind === 'web').map((site) => site.name)).toEqual([
      'Commerce Storefront',
      'Commerce API',
      'Reports Legacy',
    ])
    expect(sample.sites.filter((site) => site.kind === 'ftp').map((site) => site.name)).toEqual([
      'Partner FTP',
      'Public Downloads FTP',
    ])
  })

  it('maps the bundled synthetic server into topology counts', () => {
    expect(sample.summary).toMatchObject({
      pools: 9,
      webSites: 3,
      ftpSites: 2,
      applications: 11,
      virtualDirectories: 12,
      bindings: 9,
      farms: 2,
      databases: 6,
    })
    expect(sample.proxyEnabled).toBe(true)
  })

  it('keeps FTP sites out of the application pool column', () => {
    const ftpIds = sample.sites.filter((site) => site.kind === 'ftp').map((site) => site.id)
    expect(ftpIds).toHaveLength(2)
    sample.pools.forEach((pool) => {
      ftpIds.forEach((id) => expect(pool.siteIds).not.toContain(id))
    })
    sample.sites
      .filter((site) => site.kind === 'ftp')
      .forEach((site) => expect(site.ftp).toBeDefined())
  })

  it('reports ARR farms with enabled state, servers and the rules that feed them', () => {
    const commerce = sample.farms.find((farm) => farm.name === 'commerce-api-farm')
    const legacy = sample.farms.find((farm) => farm.name === 'legacy-reports-farm')
    expect(commerce?.enabled).toBe(true)
    expect(commerce?.servers.map((server) => server.enabled)).toEqual([true, true, false])
    expect(legacy?.enabled).toBe(false)
    expect(sample.routes.filter((route) => route.farmId === commerce?.id)).toHaveLength(2)
    expect(sample.routes.every((route) => !route.catchAll)).toBe(true)
  })

  it('flags a catch-all global ARR rule that bypasses site content', () => {
    const parsed = parseConfigText(arrHost, 'applicationHost.config', arrHost.length, 'config-applicationhost')
    const architecture = buildArchitecture(parsed.config!.model!)
    expect(architecture.farms).toHaveLength(1)
    const route = architecture.routes[0]
    expect(route).toMatchObject({ global: true, catchAll: true, enabled: true, farmId: 'farm:back' })
  })

  it('shows a farm-less server without an ARR lane', () => {
    const plain = arrHost.replace(/<webFarms>[\s\S]*?<\/webFarms>/, '')
    const parsed = parseConfigText(plain, 'applicationHost.config', plain.length, 'config-applicationhost')
    const architecture = buildArchitecture(parsed.config!.model!)
    expect(architecture.farms).toHaveLength(0)
    expect(architecture.proxyEnabled).toBe(true)
  })

  it('merges connection strings that differ only by default port', () => {
    const ids = sample.databases.map((database) => database.id)
    expect(new Set(ids).size).toBe(ids.length)
    const sql01 = sample.databases.filter((database) => database.host === 'sql01.corp.contoso.test')
    expect(sql01).toHaveLength(1)
    expect(sql01[0].engineLabel).toBe('SQL Server')
    expect(sql01[0].port).toBe('1433')
  })

  it('lists only values changed from IIS defaults for a selected site', () => {
    const target = sample.target('site:2')
    expect(target?.kind).toBe('site')
    expect(target?.changes.length).toBeGreaterThan(0)
    const queueLength = target?.changes.find((change) => change.label === 'queueLength')
    expect(queueLength).toMatchObject({ value: '5000', defaultValue: '1000' })
    expect(target?.changes.every((change) => change.value !== change.defaultValue || change.kind === 'removed')).toBe(true)
  })

  it('adds web.config settings only when the file is attached and never exposes secrets', () => {
    const without = buildArchitecture(baseModel).target('site:4')
    const attached = sample.target('site:4')
    expect(attached!.changes.length).toBeGreaterThan(without!.changes.length)
    const everything = JSON.stringify(attached)
    expect(everything).not.toContain('P@ssw0rd-demo-only')
    expect(everything).not.toContain('synthetic-secret-for-preview')
  })

  it('summarises each entry layer from the customised sites', () => {
    const layers = Object.fromEntries(sample.layers.map((layer) => [layer.id, layer.count]))
    expect(layers['ip-restrictions']).toBeGreaterThan(0)
    expect(layers['url-rewrite']).toBeGreaterThan(0)
    expect(layers['request-filtering']).toBeGreaterThan(0)
    expect(layers['arr-routing']).toBeGreaterThan(0)
  })
})
