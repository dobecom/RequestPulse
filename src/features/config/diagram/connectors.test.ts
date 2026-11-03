import { describe, expect, it } from 'vitest'
import { parseConfigText } from '../configParser'
import { getSampleConfigFiles } from '../sampleConfigs'
import { buildArchitecture } from '../topology/architecture'
import {
  ALWAYS,
  buildEdges,
  curvePath,
  elbowPath,
  focusIdsFor,
  placeBalloon,
  routeEdge,
  type EdgeSpec,
} from './connectors'

const model = getSampleConfigFiles()[0].config!.model!
const architecture = buildArchitecture(model)

const catchAllConfig = `<?xml version="1.0"?>
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
  <webFarms><webFarm name="back" enabled="true"><server address="10.0.0.4" enabled="true" /></webFarm></webFarms>
  <system.webServer>
    <rewrite><globalRules>
      <rule name="all" patternSyntax="Wildcard" stopProcessing="true">
        <match url="*" /><action type="Rewrite" url="http://back/{R:0}" />
      </rule>
    </globalRules></rewrite>
    <proxy enabled="true" />
  </system.webServer>
</configuration>`

describe('connector geometry', () => {
  it('draws a straight line when both ends share a row', () => {
    expect(elbowPath({ x: 0, y: 40 }, { x: 100, y: 40.4 }, 50)).toBe('M0 40H100')
    expect(curvePath({ x: 0, y: 40 }, { x: 100, y: 40 })).toBe('M0 40H100')
  })

  it('routes elbows through the lane with rounded corners', () => {
    expect(elbowPath({ x: 0, y: 0 }, { x: 100, y: 100 }, 50)).toBe('M0 0H38Q50 0 50 12V88Q50 100 62 100H100')
  })

  it('shrinks corner radius for short drops instead of overshooting', () => {
    const path = elbowPath({ x: 0, y: 0 }, { x: 100, y: 8 }, 50)
    expect(path).toContain('Q50 0 50 4')
    expect(path).toContain('V4')
  })

  it('anchors head-of-card edges near the title instead of the card middle', () => {
    const rects = {
      entry: { left: 0, top: 0, width: 40, height: 400 },
      'site:1': { left: 200, top: 100, width: 220, height: 300 },
    }
    const edge: EdgeSpec = { id: 'e', from: 'entry', to: 'site:1', kind: 'site', style: 'bus', related: [] }
    const route = routeEdge(edge, rects, { busX: 120, laneX: 480 })!
    expect(route.start).toEqual({ x: 40, y: 200 })
    expect(route.end).toEqual({ x: 200, y: 127 })
  })

  it('drops from the wide ARR card to a farm stacked below it through the left lane', () => {
    const rects = {
      'arr-rules': { left: 200, top: 0, width: 600, height: 200 },
      'farm:a': { left: 200, top: 240, width: 600, height: 160 },
    }
    const edge: EdgeSpec = { id: 'd', from: 'arr-rules', to: 'farm:a', kind: 'farm', style: 'drop', related: [] }
    const route = routeEdge(edge, rects, { busX: 150, laneX: 186 })!
    expect(route.start).toEqual({ x: 200, y: 100 })
    expect(route.end).toEqual({ x: 200, y: 267 })
    expect(route.d).toContain('V')
    expect(route.d).not.toContain('C')
  })

  it('does not route edges whose endpoints are not laid out yet', () => {
    const edge: EdgeSpec = { id: 'e', from: 'a', to: 'b', kind: 'site', style: 'curve', related: [] }
    expect(routeEdge(edge, { a: { left: 0, top: 0, width: 10, height: 10 } }, { busX: 0, laneX: 0 })).toBeNull()
    expect(
      routeEdge(
        edge,
        { a: { left: 0, top: 0, width: 10, height: 10 }, b: { left: 0, top: 0, width: 0, height: 0 } },
        { busX: 0, laneX: 0 },
      ),
    ).toBeNull()
  })
})

describe('balloon placement', () => {
  const board = { width: 1200, height: 900 }
  const size = { width: 420, height: 500 }

  it('prefers the right side of the anchor', () => {
    const placed = placeBalloon({ left: 100, top: 200, width: 200, height: 100 }, board, size)
    expect(placed).toMatchObject({ side: 'right', left: 314, top: 190 })
  })

  it('flips to the left when the right side would overflow', () => {
    const placed = placeBalloon({ left: 800, top: 200, width: 200, height: 100 }, board, size)
    expect(placed.side).toBe('left')
    expect(placed.left).toBe(800 - 420 - 14)
  })

  it('clamps inside the board without a tail when neither side fits', () => {
    const placed = placeBalloon({ left: 300, top: 880, width: 600, height: 40 }, { width: 900, height: 900 }, size)
    expect(placed.side).toBe('none')
    expect(placed.left).toBe(900 - 420 - 8)
    expect(placed.top).toBe(900 - 500 - 8)
  })

  it('keeps the tail pointing inside the balloon', () => {
    const placed = placeBalloon({ left: 100, top: 20, width: 200, height: 20 }, board, size)
    expect(placed.tail).toBeGreaterThanOrEqual(18)
    expect(placed.tail).toBeLessThanOrEqual(size.height - 30)
  })
})

describe('diagram edges', () => {
  const parse = (text: string) =>
    parseConfigText(text, 'applicationHost.config', text.length, 'config-applicationhost').config!.model!
  const withoutRewrite = (text: string) => text.replace(/<rewrite>[\s\S]*?<\/rewrite>/, '')

  it('wires the client into the entry stack and every site from the server-level tier', () => {
    const edges = buildEdges(architecture)
    expect(edges[0]).toMatchObject({ from: 'client', to: 'entry-stack', related: [ALWAYS] })
    const siteEdges = edges.filter((edge) => edge.id.startsWith('entry-server>site:'))
    expect(siteEdges).toHaveLength(architecture.sites.length)
    expect(siteEdges.every((edge) => edge.from === 'entry-server' && !edge.muted)).toBe(true)
    expect(new Set(edges.map((edge) => edge.id)).size).toBe(edges.length)
  })

  it('draws a pool link per site pool and database links from the pool that connects', () => {
    const edges = buildEdges(architecture)
    expect(edges.filter((edge) => edge.kind === 'database')).toHaveLength(architecture.dbLinks.length)
    expect(architecture.dbLinks.length).toBeGreaterThan(0)
    edges
      .filter((edge) => edge.kind === 'database')
      .forEach((edge) => expect(edge.from.startsWith('pool:')).toBe(true))
  })

  it('reaches ARR from the global tier and from the one site that owns a site-level rule', () => {
    const edges = buildEdges(architecture)
    expect(edges.some((edge) => edge.id === 'entry-global>arr-rules' && edge.from === 'entry-global')).toBe(true)
    expect(edges.filter((edge) => edge.style === 'lane').map((edge) => edge.from)).toEqual(['site:3'])
    architecture.farms.forEach((farm) => {
      expect(edges.some((edge) => edge.id === `arr-rules>${farm.id}`)).toBe(farm.routeIds.length > 0)
    })
  })

  it('draws no ARR wire for a farm that no rewrite rule targets', () => {
    const edges = buildEdges(buildArchitecture(parse(withoutRewrite(catchAllConfig))))
    expect(edges.some((edge) => edge.kind === 'arr' || edge.kind === 'farm')).toBe(false)
  })

  it('wires a global rule that proxies to a host without any server farm', () => {
    const edges = buildEdges(buildArchitecture(parse(catchAllConfig.replace(/<webFarms>[\s\S]*?<\/webFarms>/, ''))))
    expect(edges.some((edge) => edge.id === 'entry-global>arr-rules')).toBe(true)
    expect(edges.some((edge) => edge.kind === 'farm')).toBe(false)
  })

  it('wires a site-level rule from its own site even when it proxies to a plain host', () => {
    const siteRule = withoutRewrite(catchAllConfig).replace(
      '</configuration>',
      `<location path="Default Web Site"><system.webServer><rewrite><rules>
        <rule name="api"><match url="^api/(.*)" /><action type="Rewrite" url="http://10.0.0.9:8080/{R:1}" /></rule>
      </rules></rewrite></system.webServer></location></configuration>`,
    )
    const built = buildArchitecture(parse(siteRule))
    expect(built.routes.map((route) => [route.level, route.proxyHost])).toEqual([['site', '10.0.0.9']])
    const edges = buildEdges(built)
    expect(edges.filter((edge) => edge.style === 'lane').map((edge) => edge.from)).toEqual(['site:1'])
    expect(edges.some((edge) => edge.id === 'entry-global>arr-rules')).toBe(false)
  })

  it('mutes the direct site wires when an unconditional global rule sends everything to a farm', () => {
    const edges = buildEdges(buildArchitecture(parse(catchAllConfig)))
    expect(edges.find((edge) => edge.id === 'entry-server>site:1')?.muted).toBe(true)
  })
})

describe('focus ids', () => {
  const site = architecture.sites.find((candidate) => candidate.kind === 'web' && candidate.tree.some((row) => row.id.startsWith('vdir:')))!
  const vdir = site.tree.find((row) => row.id.startsWith('vdir:'))!

  it('keeps nothing lit without a selection', () => {
    expect(focusIdsFor(null, architecture)).toEqual([])
  })

  it('lights the owning site and pool for an application or virtual directory', () => {
    const ids = focusIdsFor(vdir.id, architecture)
    expect(ids[0]).toBe(site.id)
    expect(ids.length).toBeLessThanOrEqual(2)
  })

  it('lights the site that a scoped layer belongs to and nothing for a global layer', () => {
    expect(focusIdsFor('layer:url-rewrite@site:2', architecture)).toEqual(['site:2'])
    expect(focusIdsFor('layer:url-rewrite', architecture)).toEqual([])
  })

  it('lights the ARR lane and its farms when ARR routing is selected', () => {
    expect(focusIdsFor('layer:arr-routing', architecture)).toEqual(['arr-rules', ...architecture.farms.map((farm) => farm.id)])
  })

  it('lights the selected node itself otherwise', () => {
    expect(focusIdsFor('pool:DefaultAppPool', architecture)).toEqual(['pool:DefaultAppPool'])
  })
})
