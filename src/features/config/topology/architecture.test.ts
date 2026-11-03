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

  it('tells global, server and site-level routing rules apart', () => {
    const level = (name: string) => sample.routes.find((route) => route.name === name)?.level
    expect(level('API gateway to commerce-api-farm')).toBe('global')
    expect(level('Proxy archive to legacy-reports-farm')).toBe('global')
    expect(level('Proxy v3 to commerce-api-farm')).toBe('site')
    expect(sample.routes.find((route) => route.level === 'site')?.siteId).toBe('site:3')
    expect(sample.sites.find((site) => site.id === 'site:3')?.routeTargets).toEqual(['commerce-api-farm'])
    expect(sample.sites.find((site) => site.id === 'site:4')?.routeTargets).toEqual([])
  })

  it('flags a catch-all global ARR rule that bypasses site content', () => {
    const parsed = parseConfigText(arrHost, 'applicationHost.config', arrHost.length, 'config-applicationhost')
    const architecture = buildArchitecture(parsed.config!.model!)
    expect(architecture.farms).toHaveLength(1)
    const route = architecture.routes[0]
    expect(route).toMatchObject({ global: true, catchAll: true, enabled: true, farmId: 'farm:back' })
    const layerCount = (id: string) => architecture.layers.find((layer) => layer.id === id)?.count
    expect(layerCount('url-rewrite')).toBe(0)
    expect(layerCount('arr-routing')).toBeGreaterThan(0)
  })

  it('lists farm-routing rules under ARR only, never in the rewrite layers', () => {
    const routed = new Set(sample.routes.map((route) => route.name))
    expect(routed.size).toBeGreaterThan(0)
    const global = sample.target('layer:global-rules')
    expect(global?.changes.map((change) => change.label)).toContain('Retire legacy shop host')
    ;[global, sample.target('layer:url-rewrite'), sample.target('layer:url-rewrite@site:3')].forEach((target) => {
      expect(target?.changes.some((change) => routed.has(change.label))).toBe(false)
    })
    const arr = sample.target('layer:arr-routing')
    expect(arr?.notes.join('\n')).toMatch(/Global — Proxy archive to legacy-reports-farm/)
    expect(arr?.notes.join('\n')).toMatch(/Site · Commerce API — Proxy v3 to commerce-api-farm/)
  })

  it('shows a farm-less server without an ARR farm lane', () => {
    const plain = arrHost.replace(/<webFarms>[\s\S]*?<\/webFarms>/, '')
    const parsed = parseConfigText(plain, 'applicationHost.config', plain.length, 'config-applicationhost')
    const architecture = buildArchitecture(parsed.config!.model!)
    expect(architecture.farms).toHaveLength(0)
    expect(architecture.proxyEnabled).toBe(true)
    // The same global rule still proxies, now straight to a host instead of a farm.
    expect(architecture.routes[0]).toMatchObject({ level: 'global', proxyHost: 'back', farmId: undefined })
  })

  it('does not call a conditional rule a catch-all', () => {
    const conditional = arrHost.replace(
      '<match url="*" />',
      '<match url="*" /><conditions><add input="{HTTP_HOST}" pattern="^api\\." /></conditions>',
    )
    const parsed = parseConfigText(conditional, 'applicationHost.config', conditional.length, 'config-applicationhost')
    expect(buildArchitecture(parsed.config!.model!).routes[0]).toMatchObject({ catchAll: false, level: 'global' })
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

  it('summarises server-level layers and leaves site overrides on their own sites', () => {
    const layers = Object.fromEntries(sample.layers.map((layer) => [layer.id, layer.count]))
    expect(layers['global-rules']).toBeGreaterThan(0)
    expect(layers['ip-restrictions']).toBeGreaterThan(0)
    expect(layers['request-filtering']).toBeGreaterThan(0)
    expect(layers['arr-routing']).toBeGreaterThan(0)

    const serverRewrite = sample.target('layer:url-rewrite')
    expect(serverRewrite?.subtitle).toBe('Server level · inherited by every site')
    expect(serverRewrite?.changes.some((change) => change.label === 'Block scraper user agents')).toBe(false)
    const siteRewrite = sample.target('layer:url-rewrite@site:4')
    expect(siteRewrite?.subtitle).toBe('Site-level layer · Reports Legacy')
    expect(siteRewrite?.changes.some((change) => change.label === 'Block scraper user agents')).toBe(true)
  })

  it('splits the entry tiers into global rules and inherited server-level settings', () => {
    expect(sample.entry.global.map((layer) => layer.id)).toEqual(['global-rules', 'arr-routing'])
    expect(sample.entry.global.every((layer) => layer.scope === 'global')).toBe(true)
    expect(sample.entry.inherited.map((layer) => layer.id)).toEqual([
      'ip-restrictions',
      'request-filtering',
      'redirect',
      'url-rewrite',
      'authentication',
    ])
    expect(sample.entry.inherited.every((layer) => layer.scope === 'inherited')).toBe(true)
    expect(sample.layers.map((layer) => layer.id).sort()).toEqual(
      [...sample.entry.global, ...sample.entry.inherited].map((layer) => layer.id).sort(),
    )
  })

  it('omits the global ARR slab when no global rule routes into ARR and keeps the inherited tier', () => {
    const noGlobal = arrHost.replace(/<globalRules>[\s\S]*?<\/globalRules>/, '')
    const parsed = parseConfigText(noGlobal, 'applicationHost.config', noGlobal.length, 'config-applicationhost')
    const architecture = buildArchitecture(parsed.config!.model!)
    expect(architecture.routes).toHaveLength(0)
    expect(architecture.entry.global).toEqual([])
    expect(architecture.entry.inherited).toHaveLength(5)
  })
})
