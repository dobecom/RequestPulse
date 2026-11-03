import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react'
import { Database } from 'lucide-react'
import { DetailBalloon } from './DetailBalloon'
import type { WebConfigOption } from './DetailBalloon'
import {
  ArrRulesCard,
  ClientNode,
  DbCard,
  EntryStack,
  FarmCard,
  PoolCard,
  SiteCard,
} from './DiagramNodes'
import type { NodeContext } from './DiagramNodes'
import { ALWAYS, buildEdges, focusIdsFor, placeBalloon, routeEdge } from './connectors'
import type { BalloonBox, BoxRect, EdgeSpec, Geometry, Route } from './connectors'
import type { Architecture } from '../topology/architecture'
import './architecture.css'

/** Board width at which the five-column layout with measured wires is used. */
const WIDE_MIN = 1100

interface Layout {
  width: number
  height: number
  signature: string
  rects: Record<string, BoxRect>
}

const EMPTY_LAYOUT: Layout = { width: 0, height: 0, signature: '', rects: {} }

const round = (value: number) => Math.round(value * 2) / 2

function measureBoard(board: HTMLElement): Layout {
  const origin = board.getBoundingClientRect()
  const rects: Record<string, BoxRect> = {}
  const parts: string[] = []
  board.querySelectorAll<HTMLElement>('[data-arch-id]').forEach((node) => {
    const id = node.dataset.archId
    if (!id) return
    const box = node.getBoundingClientRect()
    const rect = {
      left: round(box.left - origin.left),
      top: round(box.top - origin.top),
      width: round(box.width),
      height: round(box.height),
    }
    rects[id] = rect
    parts.push(`${id}:${rect.left},${rect.top},${rect.width},${rect.height}`)
  })
  const width = round(board.clientWidth)
  const height = round(board.clientHeight)
  return { width, height, rects, signature: `${width}x${height}|${parts.join(';')}` }
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(query.matches)
    update()
    query.addEventListener?.('change', update)
    return () => query.removeEventListener?.('change', update)
  }, [])
  return reduced
}

export interface ArchitectureDiagramProps {
  architecture: Architecture
  webConfigs: WebConfigOption[]
  /** Attached web.config file id per target id. */
  attachments: Record<string, string>
  onAttach: (targetId: string, fileId: string) => void
}

export function ArchitectureDiagram({ architecture, webConfigs, attachments, onAttach }: ArchitectureDiagramProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [anchorId, setAnchorId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [layout, setLayout] = useState<Layout>(EMPTY_LAYOUT)
  const [balloonSize, setBalloonSize] = useState({ width: 0, height: 0 })
  const boardRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()

  const mode: 'wide' | 'stack' = layout.width === 0 || layout.width >= WIDE_MIN ? 'wide' : 'stack'
  const target = selectedId ? architecture.target(selectedId) : undefined

  const select = useCallback(
    (id: string, anchor?: string) => {
      setSelectedId((current) => (current === id ? null : id))
      setAnchorId(anchor ?? null)
      const [kind, siteKey] = id.split(':')
      if (kind === 'app' || kind === 'vdir') {
        setExpanded((current) => (current.has(`site:${siteKey}`) ? current : new Set(current).add(`site:${siteKey}`)))
      }
    },
    [],
  )
  const toggleRows = useCallback((siteId: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (!next.delete(siteId)) next.add(siteId)
      return next
    })
  }, [])

  /* ---------- measurement ---------- */
  const measure = useCallback(() => {
    const board = boardRef.current
    if (!board) return
    const next = measureBoard(board)
    setLayout((current) => (current.signature === next.signature ? current : next))
  }, [])

  useLayoutEffect(() => {
    measure()
  }, [measure, architecture, expanded, selectedId, mode])

  useEffect(() => {
    const board = boardRef.current
    if (!board) return
    let frame = 0
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    observer?.observe(board)
    window.addEventListener('resize', schedule)
    void document.fonts?.ready?.then(schedule)
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }, [measure])

  /* ---------- highlight ---------- */
  const edges = useMemo(() => buildEdges(architecture), [architecture])
  const focus = useMemo(() => focusIdsFor(selectedId, architecture), [selectedId, architecture])
  const { lit, activeEdges } = useMemo(() => {
    if (!selectedId) return { lit: null as Set<string> | null, activeEdges: new Set<string>() }
    const related = new Set(focus)
    const active = new Set<string>()
    edges.forEach((edge) => {
      if (edge.related.includes(ALWAYS) || edge.related.some((id) => focus.includes(id))) {
        active.add(edge.id)
        edge.related.filter((id) => id.startsWith('site:')).forEach((id) => related.add(id))
        related.add(edge.from)
        related.add(edge.to)
      }
    })
    // Global rules and server-level settings apply to every request, so both tiers stay lit with the gateway.
    ;['entry', 'entry-global', 'entry-server', 'client'].forEach((id) => related.add(id))
    edges.forEach((edge) => {
      if (related.has(edge.from) && related.has(edge.to) && edge.kind !== 'secondary') active.add(edge.id)
    })
    return { lit: related, activeEdges: active }
  }, [selectedId, focus, edges])

  const geometry = useMemo<Geometry | null>(() => {
    const entry = layout.rects['entry-stack'] ?? layout.rects['entry']
    const first = architecture.sites.map((site) => layout.rects[site.id]).find(Boolean)
    if (!entry || !first) return null
    const busX = first.left - 30
    return { busX: Math.max(entry.left + entry.width + 14, busX), laneX: first.left - 14 }
  }, [layout.rects, architecture.sites])

  const wires = useMemo(() => {
    if (mode !== 'wide') return [] as { edge: EdgeSpec; route: Route }[]
    const fallback: Geometry = geometry ?? { busX: 0, laneX: 0 }
    return edges.flatMap((edge) => {
      const route = routeEdge(edge, layout.rects, fallback)
      return route ? [{ edge, route }] : []
    })
  }, [mode, edges, layout.rects, geometry])

  /* ---------- balloon ---------- */
  const anchorRect = selectedId
    ? (anchorId ? layout.rects[anchorId] : undefined) ?? layout.rects[selectedId] ?? layout.rects[focus[0] ?? '']
    : undefined
  const box: BalloonBox | null = useMemo(() => {
    if (!target || mode !== 'wide') return null
    const board = { width: layout.width, height: layout.height }
    const size = balloonSize.width ? balloonSize : { width: 440, height: 480 }
    return anchorRect
      ? placeBalloon(anchorRect, board, size)
      : { left: 12, top: 12, tail: 24, side: 'none' as const }
  }, [target, mode, balloonSize, layout.width, layout.height, anchorRect])

  const balloonOpen = Boolean(target)
  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    const update = () => {
      const next = { width: host.offsetWidth, height: host.offsetHeight }
      setBalloonSize((current) => (current.width === next.width && current.height === next.height ? current : next))
    }
    update()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(host)
    return () => observer.disconnect()
  }, [balloonOpen, mode])

  useEffect(() => {
    if (!selectedId) return
    const frame = requestAnimationFrame(() => {
      hostRef.current?.scrollIntoView?.({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' })
    })
    return () => cancelAnimationFrame(frame)
  }, [selectedId, reduceMotion])

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && selectedId) {
      event.stopPropagation()
      setSelectedId(null)
    }
  }
  const onBoardClick = (event: MouseEvent<HTMLElement>) => {
    if (!(event.target as HTMLElement).closest('button, a, select, [data-arch-id], aside')) setSelectedId(null)
  }

  /* ---------- ordering ---------- */
  const webSites = architecture.sites.filter((site) => site.kind === 'web')
  const ftpSites = architecture.sites.filter((site) => site.kind === 'ftp')
  const orderedSites = [...webSites, ...ftpSites]
  const pools = useMemo(() => {
    const order = new Map<string, number>()
    orderedSites.forEach((site, index) =>
      site.poolNames.forEach((name) => {
        const key = name.toLowerCase()
        if (!order.has(key)) order.set(key, index)
      }),
    )
    return [...architecture.pools].sort(
      (left, right) =>
        (order.get(left.name.toLowerCase()) ?? 999) - (order.get(right.name.toLowerCase()) ?? 999),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [architecture])
  const databases = useMemo(() => {
    const poolIndex = new Map(pools.map((pool, index) => [pool.name.toLowerCase(), index]))
    const rank = (id: string) => {
      const links = architecture.dbLinks.filter((link) => link.dbId === id)
      if (!links.length) return 999
      return Math.min(...links.map((link) => poolIndex.get(link.poolName.toLowerCase()) ?? 999))
    }
    return [...architecture.databases].sort((left, right) => rank(left.id) - rank(right.id))
  }, [architecture, pools])

  const context: NodeContext = {
    architecture,
    selectedId,
    lit,
    expanded,
    onSelect: select,
    onToggleRows: toggleRows,
  }

  const summary = architecture.summary
  const arrCount = architecture.layers.find((layer) => layer.id === 'arr-routing')?.count ?? 0
  const showArr =
    architecture.farms.length > 0 || architecture.routes.length > 0 || architecture.proxyEnabled || arrCount > 0
  const packets = !reduceMotion

  return (
    <section className="arch" aria-labelledby="arch-title" onKeyDown={onKeyDown}>
      <header className="arch__header">
        <div>
          <span className="eyebrow">Server architecture</span>
          <h2 id="arch-title">IIS request architecture</h2>
          <p>
            Follow a request from the client through the IIS entry point. Global rules and server-level settings
            apply to the whole server; each site card then shows what that site changes on its own. Requests that a
            URL Rewrite rule proxies through ARR go to a server farm or host instead. Select any element to see
            only the settings changed from IIS defaults.
          </p>
        </div>
        <ul className="arch__summary" aria-label="Inventory">
          <li><strong>{summary.webSites}</strong> web</li>
          <li><strong>{summary.ftpSites}</strong> FTP</li>
          <li><strong>{summary.pools}</strong> pools</li>
          <li><strong>{summary.applications}</strong> apps</li>
          <li><strong>{summary.virtualDirectories}</strong> vdirs</li>
          <li><strong>{summary.bindings}</strong> bindings</li>
          {summary.farms > 0 && <li><strong>{summary.farms}</strong> farms</li>}
          {summary.databases > 0 && <li><strong>{summary.databases}</strong> databases</li>}
        </ul>
      </header>

      <div className="arch__toolbar">
        <ul className="arch__legend" aria-label="Legend">
          <li data-kind="flow">Request path</li>
          <li data-kind="pool">Pool</li>
          <li data-kind="database">Data</li>
          <li data-kind="arr">ARR</li>
          <li data-kind="custom">Customised layer</li>
        </ul>
      </div>

      <div className="arch__stage">
        <div
          ref={boardRef}
          className="arch__board"
          data-mode={mode}
          data-focus={selectedId ? 'on' : 'off'}
          role="group"
          aria-label="IIS architecture diagram"
          onClick={onBoardClick}
        >
          {mode === 'wide' && layout.width > 0 && (
            <svg className="arch-wires" width={layout.width} height={layout.height} aria-hidden="true" focusable="false">
              {wires.map(({ edge, route }, index) => {
                const state = !selectedId ? 'idle' : activeEdges.has(edge.id) ? 'active' : 'dim'
                const moving = packets && state !== 'dim' && (state === 'active' || ['client', 'site', 'arr'].includes(edge.kind)) && !edge.muted
                return (
                  <g key={edge.id} className="arch-wire" data-kind={edge.kind} data-state={state} data-muted={edge.muted || undefined}>
                    <path className="arch-wire__base" d={route.d} />
                    <path className="arch-wire__flow" d={route.d} />
                    <circle className="arch-wire__end" cx={route.end.x} cy={route.end.y} r={3} />
                    {moving && (
                      <circle className="arch-packet" r={3.6}>
                        <animateMotion
                          dur={`${2.4 + (index % 4) * 0.35}s`}
                          begin={`${(index % 7) * 0.37}s`}
                          repeatCount="indefinite"
                          path={route.d}
                        />
                      </circle>
                    )}
                  </g>
                )
              })}
            </svg>
          )}

          <div className="arch__col arch__col--client">
            <h3 className="arch__caption">Clients</h3>
            <ClientNode />
          </div>

          <div className="arch__col arch__col--entry">
            <h3 className="arch__caption">Entry point</h3>
            <EntryStack entry={architecture.entry} context={context} />
          </div>

          <div className="arch__col arch__col--sites">
            <h3 className="arch__caption">Web sites</h3>
            {webSites.map((site) => (
              <SiteCard key={site.id} site={site} context={context} />
            ))}
            {!webSites.length && <p className="arch__empty">No web site is declared.</p>}
            {ftpSites.length > 0 && <h3 className="arch__caption">FTP sites</h3>}
            {ftpSites.map((site) => (
              <SiteCard key={site.id} site={site} context={context} />
            ))}
          </div>

          <div className="arch__col arch__col--pools">
            <h3 className="arch__caption">Application pools</h3>
            {pools.map((pool) => (
              <PoolCard key={pool.id} pool={pool} context={context} />
            ))}
            {!pools.length && <p className="arch__empty">No application pool is declared.</p>}
          </div>

          <div className="arch__col arch__col--data">
            <h3 className="arch__caption">
              <Database size={13} aria-hidden="true" /> Data connections
            </h3>
            {databases.map((db) => (
              <DbCard key={db.id} db={db} context={context} />
            ))}
            {!databases.length && <p className="arch__empty">No connection string or state server was found.</p>}
          </div>

          {showArr && (
            <div className="arch__lane">
              <h3 className="arch__caption">Application Request Routing · server level</h3>
              <p className="arch__lane-note">
                ARR is an HTTP-level reverse proxy and load balancer; its Enable proxy setting is server-wide. Its routing rule
                is a URL Rewrite rule that targets a server farm or a proxy host: usually a global rule created by the
                farm wizard, but a rule in a site’s web.config also works and is labelled as site-level below. The
                request still arrives through the site that matches its binding; when a rule matches, ARR proxies it
                instead of the site’s own content handler. A server farm on its own routes nothing.
              </p>
              <div className="arch__lane-body">
                <ArrRulesCard architecture={architecture} context={context} />
                <div className="arch__farms">
                  {architecture.farms.map((farm) => (
                    <FarmCard key={farm.id} farm={farm} context={context} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {target && (
            <div
              ref={hostRef}
              className="arch-balloon-host"
              data-mode={mode === 'wide' ? 'float' : 'sheet'}
              style={
                mode === 'wide'
                  ? ({ left: box?.left ?? 0, top: box?.top ?? 0 } as CSSProperties)
                  : undefined
              }
            >
              <DetailBalloon
                target={target}
                placement={{ mode: mode === 'wide' ? 'float' : 'sheet', tail: box?.tail, side: box?.side }}
                webConfigs={webConfigs}
                attachedId={attachments[target.id]}
                onAttach={onAttach}
                onClose={() => setSelectedId(null)}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
