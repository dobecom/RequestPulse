import type { Architecture } from '../topology/architecture'

export interface Point {
  x: number
  y: number
}

export interface BoxRect {
  left: number
  top: number
  width: number
  height: number
}

export type EdgeStyle = 'bus' | 'curve' | 'lane'
export type EdgeKind = 'client' | 'site' | 'pool' | 'secondary' | 'database' | 'arr' | 'farm'

export interface EdgeSpec {
  id: string
  from: string
  to: string
  kind: EdgeKind
  style: EdgeStyle
  /** Target ids that light this edge when selected; ALWAYS keeps it lit. */
  related: string[]
  muted?: boolean
}

export interface Geometry {
  /** X of the shared trunk the entry point fans out from. */
  busX: number
  /** X of the secondary lane used for rules that run site to ARR. */
  laneX: number
}

export const ALWAYS = '*'

const HEAD_ANCHOR = 27

export const edgeAnchors = (rect: BoxRect, side: 'left' | 'right', head: boolean): Point => ({
  x: side === 'left' ? rect.left : rect.left + rect.width,
  y: rect.top + (head ? Math.min(HEAD_ANCHOR, rect.height / 2) : rect.height / 2),
})

const round = (value: number) => Math.round(value * 10) / 10

/**
 * Orthogonal path with rounded corners: horizontal from the start to the lane,
 * vertical along the lane, then horizontal into the end.
 */
export function elbowPath(from: Point, to: Point, laneX: number, radius = 12): string {
  const dy = to.y - from.y
  if (Math.abs(dy) < 1) return `M${round(from.x)} ${round(from.y)}H${round(to.x)}`
  const vertical = Math.sign(dy)
  const first = Math.sign(laneX - from.x) || 1
  const last = Math.sign(to.x - laneX) || 1
  const r = Math.max(
    0,
    Math.min(radius, Math.abs(dy) / 2, Math.abs(laneX - from.x), Math.abs(to.x - laneX)),
  )
  return [
    `M${round(from.x)} ${round(from.y)}`,
    `H${round(laneX - first * r)}`,
    `Q${round(laneX)} ${round(from.y)} ${round(laneX)} ${round(from.y + vertical * r)}`,
    `V${round(to.y - vertical * r)}`,
    `Q${round(laneX)} ${round(to.y)} ${round(laneX + last * r)} ${round(to.y)}`,
    `H${round(to.x)}`,
  ].join('')
}

/** Smooth horizontal S-curve between two points. */
export function curvePath(from: Point, to: Point): string {
  if (Math.abs(to.y - from.y) < 1) return `M${round(from.x)} ${round(from.y)}H${round(to.x)}`
  const reach = Math.max(28, Math.abs(to.x - from.x) / 2)
  return `M${round(from.x)} ${round(from.y)}C${round(from.x + reach)} ${round(from.y)} ${round(to.x - reach)} ${round(to.y)} ${round(to.x)} ${round(to.y)}`
}

const hasArea = (rect: BoxRect | undefined): rect is BoxRect =>
  Boolean(rect && (rect.width > 0 || rect.height > 0))

export interface Route {
  d: string
  start: Point
  end: Point
}

/** Returns the SVG path and endpoints for an edge, or null when an endpoint is not laid out. */
export function routeEdge(
  edge: EdgeSpec,
  rects: Record<string, BoxRect>,
  geometry: Geometry,
): Route | null {
  const source = rects[edge.from]
  const target = rects[edge.to]
  if (!hasArea(source) || !hasArea(target)) return null
  const headSource = edge.from.startsWith('site:')
  const headTarget = edge.to.startsWith('site:') || edge.to === 'arr-rules' || edge.to === 'entry-stack'

  if (edge.style === 'lane') {
    const start = edgeAnchors(source, 'left', headSource)
    const end = edgeAnchors(target, 'left', headTarget)
    return { d: elbowPath(start, end, geometry.laneX), start, end }
  }
  const start = edgeAnchors(source, 'right', headSource)
  const end = edgeAnchors(target, 'left', headTarget)
  return { d: edge.style === 'bus' ? elbowPath(start, end, geometry.busX) : curvePath(start, end), start, end }
}

export interface BalloonBox {
  left: number
  top: number
  tail: number
  side: 'left' | 'right' | 'none'
}

/** Places the balloon beside its anchor, flipping to the other side or clamping inside the board. */
export function placeBalloon(
  anchor: BoxRect,
  board: { width: number; height: number },
  size: { width: number; height: number },
  gap = 14,
): BalloonBox {
  const margin = 8
  const rightEdge = anchor.left + anchor.width + gap
  const leftEdge = anchor.left - size.width - gap
  let side: BalloonBox['side'] = 'right'
  let left = rightEdge
  if (rightEdge + size.width > board.width - margin) {
    if (leftEdge >= margin) {
      side = 'left'
      left = leftEdge
    } else {
      side = 'none'
      left = Math.max(margin, board.width - size.width - margin)
    }
  }
  const top = Math.min(Math.max(margin, anchor.top - 10), Math.max(margin, board.height - size.height - margin))
  const centre = anchor.top + Math.min(anchor.height, 54) / 2 - top
  const tail = Math.min(Math.max(18, centre), Math.max(18, size.height - 30))
  return { left: Math.round(left), top: Math.round(top), tail: Math.round(tail), side }
}

/** Declares every visible wire for an architecture. Pure so it can be tested. */
export function buildEdges(architecture: Architecture): EdgeSpec[] {
  const poolIds = new Map(architecture.pools.map((pool) => [pool.name.toLowerCase(), pool.id]))
  const poolId = (name: string) => poolIds.get(name.toLowerCase()) ?? `pool:${name}`
  const bypass = architecture.routes.some(
    (route) => route.global && route.catchAll && route.enabled && route.farmId,
  )

  const edges: EdgeSpec[] = [
    { id: 'client>entry', from: 'client', to: 'entry-stack', kind: 'client', style: 'curve', related: [ALWAYS] },
  ]

  architecture.sites.forEach((site) => {
    edges.push({
      id: `entry>${site.id}`,
      from: 'entry',
      to: site.id,
      kind: 'site',
      style: 'bus',
      related: [site.id],
      muted: bypass,
    })
    site.poolNames.forEach((name) => {
      const target = poolId(name)
      edges.push({
        id: `${site.id}>${target}`,
        from: site.id,
        to: target,
        kind: name.toLowerCase() === site.rootPool.toLowerCase() ? 'pool' : 'secondary',
        style: 'curve',
        related: [site.id, target],
      })
    })
  })

  architecture.dbLinks.forEach((link) => {
    const pool = poolId(link.poolName)
    edges.push({
      id: `${pool}>${link.dbId}`,
      from: pool,
      to: link.dbId,
      kind: 'database',
      style: 'curve',
      related: [pool, link.dbId, ...link.siteIds],
    })
  })

  if (architecture.farms.length) {
    edges.push({
      id: 'entry>arr-rules',
      from: 'entry',
      to: 'arr-rules',
      kind: 'arr',
      style: 'bus',
      related: ['arr-rules', ...architecture.farms.map((farm) => farm.id)],
    })
    const sitesWithRules = new Set<string>()
    architecture.routes.forEach((route) => {
      if (!route.siteId || !route.farmId || sitesWithRules.has(`${route.siteId}>${route.farmId}`)) return
      sitesWithRules.add(`${route.siteId}>${route.farmId}`)
      edges.push({
        id: `${route.siteId}>arr-rules:${route.farmId}`,
        from: route.siteId,
        to: 'arr-rules',
        kind: 'arr',
        style: 'lane',
        related: [route.siteId, route.farmId],
      })
    })
    architecture.farms.forEach((farm) => {
      edges.push({
        id: `arr-rules>${farm.id}`,
        from: 'arr-rules',
        to: farm.id,
        kind: 'farm',
        style: 'curve',
        related: [farm.id, 'arr-rules', ...farm.siteIds],
      })
    })
  }

  return edges
}

/** Maps a selection to the diagram nodes that should stay lit. */
export function focusIdsFor(selectedId: string | null, architecture: Architecture): string[] {
  if (!selectedId) return []
  const [kind, ...rest] = selectedId.split(':')
  if (kind === 'app' || kind === 'vdir') {
    const siteId = `site:${rest[0]}`
    const site = architecture.sites.find((candidate) => candidate.id === siteId)
    const row = site?.tree.find((candidate) => candidate.id === selectedId)
    const pool = row?.poolName ? architecture.pools.find((candidate) => candidate.name.toLowerCase() === row.poolName?.toLowerCase()) : undefined
    return [siteId, ...(pool ? [pool.id] : [])]
  }
  if (kind === 'layer') {
    const at = selectedId.indexOf('@')
    return at >= 0 ? [selectedId.slice(at + 1)] : []
  }
  return [selectedId]
}
