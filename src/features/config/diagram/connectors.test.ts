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
  it('wires the client into the entry stack and every site from the entry bus', () => {
    const edges = buildEdges(architecture)
    expect(edges[0]).toMatchObject({ from: 'client', to: 'entry-stack', related: [ALWAYS] })
    const siteEdges = edges.filter((edge) => edge.id.startsWith('entry>site:'))
    expect(siteEdges).toHaveLength(architecture.sites.length)
    expect(siteEdges.every((edge) => !edge.muted)).toBe(true)
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

  it('adds an ARR lane only when farms exist and links each farm', () => {
    const edges = buildEdges(architecture)
    expect(edges.some((edge) => edge.id === 'entry>arr-rules')).toBe(true)
    architecture.farms.forEach((farm) => {
      expect(edges.some((edge) => edge.id === `arr-rules>${farm.id}`)).toBe(true)
    })
    expect(edges.some((edge) => edge.style === 'lane')).toBe(true)

    const noFarm = parseConfigText(
      catchAllConfig.replace(/<webFarms>[\s\S]*?<\/webFarms>/, ''),
      'applicationHost.config',
      10,
      'config-applicationhost',
    ).config!.model!
    expect(buildEdges(buildArchitecture(noFarm)).some((edge) => edge.kind === 'arr' || edge.kind === 'farm')).toBe(false)
  })

  it('mutes the direct site wires when a catch-all rule sends everything to a farm', () => {
    const parsed = parseConfigText(catchAllConfig, 'applicationHost.config', catchAllConfig.length, 'config-applicationhost')
    const edges = buildEdges(buildArchitecture(parsed.config!.model!))
    const siteEdge = edges.find((edge) => edge.id === 'entry>site:1')
    expect(siteEdge?.muted).toBe(true)
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

  it('lights the selected node itself otherwise', () => {
    expect(focusIdsFor('pool:DefaultAppPool', architecture)).toEqual(['pool:DefaultAppPool'])
  })
})
