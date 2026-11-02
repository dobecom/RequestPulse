import type { CSSProperties } from 'react'
import { ArrowRight, ChevronDown, ChevronRight, KeyRound, ShieldAlert } from 'lucide-react'
import { assetUrl } from './assets'
import type {
  Architecture,
  Chip,
  DbNode,
  FarmNode,
  LayerStat,
  PoolNode,
  RouteRule,
  SiteNode,
  TreeRow,
} from '../topology/architecture'
import { routingHighlights } from './highlights'

export interface NodeContext {
  architecture: Architecture
  selectedId: string | null
  /** Ids that stay lit while something is selected; null when nothing is selected. */
  lit: Set<string> | null
  expanded: Set<string>
  onSelect: (id: string) => void
  onToggleRows: (siteId: string) => void
}

const ROW_PREVIEW = 6
const MINOR_PROTOCOLS = new Set(['net.tcp', 'net.pipe', 'net.msmq', 'msmq.formatname'])

const dimmed = (context: NodeContext, id: string) => (context.lit && !context.lit.has(id) ? true : undefined)

export function ChipList({ chips, label }: { chips: Chip[]; label?: string }) {
  if (!chips.length) return null
  return (
    <span className="arch-chips" role={label ? 'group' : undefined} aria-label={label}>
      {chips.map((chip) => (
        <span key={chip.id} className={`arch-chip arch-chip--${chip.tone}`} title={chip.title}>
          {chip.label}
        </span>
      ))}
    </span>
  )
}

/* ---------- client and entry ---------- */

export function ClientNode() {
  return (
    <div className="arch-client arch-card" data-arch-id="client">
      <img className="arch-icon arch-icon--lg" src={assetUrl('client')} alt="" width={64} height={64} />
      <strong>Client requests</strong>
      <small>Browsers, APIs and FTP clients</small>
    </div>
  )
}

export function EntryStack({ layers, context }: { layers: LayerStat[]; context: NodeContext }) {
  return (
    <div className="arch-entry" data-arch-id="entry-stack">
      <ol className="arch-slabs" aria-label="Entry point layers, in request order">
        {layers.map((layer, index) => {
          const id = `layer:${layer.id}`
          const selected = context.selectedId === id
          return (
            <li key={layer.id} style={{ '--i': index } as CSSProperties}>
              <button
                type="button"
                className="arch-slab"
                data-arch-id={id}
                data-layer={layer.id}
                data-state={layer.count > 0 ? 'custom' : 'default'}
                data-selected={selected || undefined}
                aria-expanded={selected}
                aria-controls="arch-balloon"
                title={layer.lines.join('\n') || 'IIS defaults'}
                onClick={() => context.onSelect(id)}
              >
                <img className="arch-icon" src={assetUrl(layer.icon)} alt="" width={40} height={40} />
                <span className="arch-slab__text">
                  <strong>{layer.label}</strong>
                  <small>{layer.count > 0 ? layer.lines.slice(0, 2).join(' · ') || 'Customised' : 'IIS defaults'}</small>
                </span>
                {layer.count > 0 && <span className="arch-slab__count">{layer.count}</span>}
              </button>
            </li>
          )
        })}
      </ol>
      <div className="arch-gateway arch-card" data-arch-id="entry">
        <img className="arch-icon" src={assetUrl('entry-gateway')} alt="" width={48} height={48} />
        <span>
          <strong>IIS entry point</strong>
          <small>http.sys · W3SVC · FTPSVC</small>
        </span>
      </div>
    </div>
  )
}

/* ---------- sites ---------- */

function TreeRows({ site, rows, context }: { site: SiteNode; rows: TreeRow[]; context: NodeContext }) {
  const open = context.expanded.has(site.id)
  const shown = open ? rows : rows.slice(0, ROW_PREVIEW)
  const hidden = rows.length - shown.length
  const pools = context.architecture.pools
  return (
    <div className="arch-tree">
      <ul aria-label={`${site.name} applications and virtual directories`}>
        {shown.map((row) => {
          const selected = context.selectedId === row.id
          const pool = row.poolName ? pools.find((candidate) => candidate.name.toLowerCase() === row.poolName?.toLowerCase()) : undefined
          return (
            <li key={row.id} style={{ '--depth': Math.max(0, row.depth - 1) } as CSSProperties}>
              <button
                type="button"
                className="arch-row"
                data-arch-id={row.id}
                data-kind={row.kind}
                data-selected={selected || undefined}
                aria-expanded={selected}
                aria-controls="arch-balloon"
                title={`${row.url}\n${row.physicalPath}`}
                onClick={() => context.onSelect(row.id)}
              >
                <img
                  src={assetUrl(row.kind === 'application' ? 'application' : 'virtual-directory')}
                  alt=""
                  width={22}
                  height={22}
                />
                <span className="arch-row__text">
                  <strong>{row.urlPath}</strong>
                  <code>{row.url}</code>
                </span>
                {row.poolName && (
                  <span
                    className="arch-row__pool"
                    data-pool={pool ? pool.colorIndex : undefined}
                    title={`Application pool ${row.poolName}`}
                  >
                    {row.poolName}
                  </span>
                )}
                {row.scoped > 0 && row.kind !== 'site' && (
                  <span className="arch-row__scoped" title="Has its own configuration scope" aria-label="Own configuration scope" />
                )}
              </button>
            </li>
          )
        })}
      </ul>
      {rows.length > ROW_PREVIEW && (
        <button type="button" className="arch-more" aria-expanded={open} onClick={() => context.onToggleRows(site.id)}>
          {open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
          {open ? 'Show fewer' : `Show ${hidden} more`}
        </button>
      )}
    </div>
  )
}

export function SiteCard({ site, context }: { site: SiteNode; context: NodeContext }) {
  const selected = context.selectedId === site.id
  const rows = site.tree.filter((row) => row.kind !== 'site')
  const customLayers = site.layers.filter((layer) => layer.count > 0)
  const highlights = routingHighlights(context.architecture.target(site.id)?.changes ?? [])
  const farmNames = site.farmIds
    .map((id) => context.architecture.farms.find((farm) => farm.id === id)?.name)
    .filter((name): name is string => Boolean(name))

  return (
    <article
      className="arch-card arch-site"
      data-kind={site.kind}
      data-arch-id={site.id}
      data-selected={selected || undefined}
      data-dim={dimmed(context, site.id)}
    >
      <button
        type="button"
        className="arch-site__head"
        aria-expanded={selected}
        aria-controls="arch-balloon"
        onClick={() => context.onSelect(site.id)}
      >
        <img className="arch-icon" src={assetUrl(site.kind === 'ftp' ? 'site-ftp' : 'site-web')} alt="" width={44} height={44} />
        <span className="arch-site__title">
          <strong>{site.name}</strong>
          <small>
            {site.kind === 'ftp' ? 'FTP site' : 'Web site'} · ID {site.siteId}
            {site.kind === 'web' && ` · ${site.applications} app${site.applications === 1 ? '' : 's'}`}
            {site.virtualDirectories > 0 && ` · ${site.virtualDirectories} vdir`}
          </small>
        </span>
      </button>

      <div className="arch-site__ports" aria-label="Bindings and ports">
        {site.ports.map((port) => (
          <span
            key={`${port.protocol}:${port.label}`}
            className="arch-port"
            data-secure={port.secure || undefined}
            data-minor={MINOR_PROTOCOLS.has(port.protocol) || undefined}
            title={`${port.protocol} ${port.label}`}
          >
            {port.label}
            {port.label !== port.protocol && <small>{port.protocol}</small>}
          </span>
        ))}
        {!site.ports.length && <span className="arch-port">No binding</span>}
      </div>
      <code className="arch-site__endpoint" title={site.endpoint}>
        {site.endpoint}
      </code>

      <div className="arch-site__status">
        {site.auth.length > 0 ? (
          <span className="arch-auth" role="group" aria-label="Enabled authentication">
            <KeyRound size={13} aria-hidden="true" />
            <ChipList chips={site.auth} />
          </span>
        ) : (
          <span className="arch-chip arch-chip--warn">
            <ShieldAlert size={12} aria-hidden="true" /> No authentication
          </span>
        )}
        <ChipList chips={site.chips} label="Site status" />
      </div>

      {customLayers.length > 0 && (
        <div className="arch-site__layers" role="group" aria-label="Customised entry layers">
          {customLayers.map((layer) => {
            const id = `layer:${layer.id}@${site.id}`
            const active = context.selectedId === id
            return (
              <button
                key={layer.id}
                type="button"
                className="arch-layerchip"
                data-arch-id={id}
                data-layer={layer.id}
                data-selected={active || undefined}
                aria-expanded={active}
                aria-controls="arch-balloon"
                title={`${layer.label}\n${layer.lines.join('\n')}`}
                onClick={() => context.onSelect(id)}
              >
                <img src={assetUrl(layer.icon)} alt="" width={20} height={20} />
                <span>{layer.label}</span>
                <b>{layer.count}</b>
              </button>
            )
          })}
        </div>
      )}

      {highlights.length > 0 && (
        <ul className="arch-site__rules" aria-label="Rewrite and redirect rules">
          {highlights.map((rule) => (
            <li key={rule.id} data-kind={rule.kind} title={`${rule.name}: ${rule.text}`}>
              <ArrowRight size={12} aria-hidden="true" />
              <span>{rule.name}</span>
              <code>{rule.text}</code>
            </li>
          ))}
        </ul>
      )}

      {farmNames.length > 0 && (
        <p className="arch-site__farm">
          <ArrowRight size={12} aria-hidden="true" /> Proxied to {farmNames.join(', ')} by ARR
        </p>
      )}

      {rows.length > 0 && <TreeRows site={site} rows={rows} context={context} />}
    </article>
  )
}

/* ---------- pools and data ---------- */

export function PoolCard({ pool, context }: { pool: PoolNode; context: NodeContext }) {
  const selected = context.selectedId === pool.id
  return (
    <button
      type="button"
      className="arch-card arch-pool"
      data-arch-id={pool.id}
      data-pool={pool.colorIndex}
      data-unused={pool.unused || undefined}
      data-shared={pool.shared || undefined}
      data-selected={selected || undefined}
      data-dim={dimmed(context, pool.id)}
      aria-expanded={selected}
      aria-controls="arch-balloon"
      onClick={() => context.onSelect(pool.id)}
    >
      <img className="arch-icon" src={assetUrl('app-pool')} alt="" width={36} height={36} />
      <span className="arch-pool__text">
        <strong>{pool.name}</strong>
        <small>
          {pool.appCount} app{pool.appCount === 1 ? '' : 's'}
          {pool.shared ? ` · ${pool.siteIds.length} sites` : ''}
        </small>
      </span>
      <ChipList chips={pool.chips} />
    </button>
  )
}

export function DbCard({ db, context }: { db: DbNode; context: NodeContext }) {
  const selected = context.selectedId === db.id
  const endpoint = `${db.host}${db.port ? `:${db.port}` : ''}`
  return (
    <button
      type="button"
      className="arch-card arch-db"
      data-arch-id={db.id}
      data-selected={selected || undefined}
      data-dim={dimmed(context, db.id)}
      aria-pressed={selected}
      title={`Connection strings: ${db.connectionNames.join(', ') || '—'}`}
      onClick={() => context.onSelect(db.id)}
    >
      <img className="arch-icon" src={assetUrl('database')} alt="" width={40} height={40} />
      <span className="arch-db__text">
        <strong>{db.engineLabel}</strong>
        <code>{endpoint}</code>
        {db.databases.length > 0 && <small>{db.databases.join(', ')}</small>}
        <small>{[db.local ? 'Local' : 'Remote', ...db.auth].join(' · ')}</small>
      </span>
    </button>
  )
}

/* ---------- ARR ---------- */

const scopeLabel = (route: RouteRule, architecture: Architecture) =>
  route.global ? 'Server rule' : architecture.sites.find((site) => site.id === route.siteId)?.name ?? route.scope

export function ArrRulesCard({ architecture, context }: { architecture: Architecture; context: NodeContext }) {
  const selected = context.selectedId === 'layer:arr-routing'
  const bypass = architecture.routes.find((route) => route.global && route.catchAll && route.enabled && route.farmId)
  return (
    <article
      className="arch-card arch-arr"
      data-arch-id="arr-rules"
      data-dim={context.lit && !context.lit.has('arr-rules') ? true : undefined}
    >
      <button
        type="button"
        className="arch-arr__head"
        aria-expanded={selected}
        aria-controls="arch-balloon"
        onClick={() => context.onSelect('layer:arr-routing')}
      >
        <img className="arch-icon" src={assetUrl('layer-arr-routing')} alt="" width={44} height={44} />
        <span>
          <strong>ARR routing</strong>
          <small>
            Proxy {architecture.proxyEnabled ? 'enabled' : 'disabled'} · {architecture.routes.length} rule
            {architecture.routes.length === 1 ? '' : 's'}
          </small>
        </span>
        <span className={`arch-chip arch-chip--${architecture.proxyEnabled ? 'ok' : 'off'}`}>
          {architecture.proxyEnabled ? 'Active' : 'Inactive'}
        </span>
      </button>
      {bypass && (
        <p className="arch-arr__note" role="note">
          <ShieldAlert size={14} aria-hidden="true" /> Catch-all rule “{bypass.name}” forwards every request to the
          farm, so site content is bypassed.
        </p>
      )}
      <ul className="arch-routes">
        {architecture.routes.map((route) => (
          <li key={route.id} data-enabled={route.enabled}>
            <div className="arch-route__flow">
              <code title={route.pattern}>{route.pattern}</code>
              <ArrowRight size={12} aria-hidden="true" />
              <code title={route.target}>{route.target}</code>
            </div>
            <div className="arch-route__meta">
              <span>{route.name}</span>
              <span className="arch-origin">{scopeLabel(route, architecture)}</span>
              {route.catchAll && <span className="arch-tag arch-tag--medium">Catch-all</span>}
              {route.stop && <span className="arch-tag arch-tag--info">Stop</span>}
              {!route.enabled && <span className="arch-tag arch-tag--off">Disabled</span>}
              {route.conditions.length > 0 && (
                <span className="arch-tag arch-tag--info" title={route.conditions.join('\n')}>
                  {route.conditions.length} condition{route.conditions.length === 1 ? '' : 's'}
                </span>
              )}
            </div>
          </li>
        ))}
        {!architecture.routes.length && <li className="arch-routes__empty">No rewrite rule points at a server farm.</li>}
      </ul>
    </article>
  )
}

export function FarmCard({ farm, context }: { farm: FarmNode; context: NodeContext }) {
  const selected = context.selectedId === farm.id
  return (
    <article
      className="arch-card arch-farm"
      data-arch-id={farm.id}
      data-enabled={farm.enabled}
      data-selected={selected || undefined}
      data-dim={dimmed(context, farm.id)}
    >
      <button
        type="button"
        className="arch-farm__head"
        aria-expanded={selected}
        aria-controls="arch-balloon"
        onClick={() => context.onSelect(farm.id)}
      >
        <img className="arch-icon" src={assetUrl('server-farm')} alt="" width={44} height={44} />
        <span>
          <strong>{farm.name}</strong>
          <small>
            {farm.algorithm} · {farm.affinity === 'None' ? 'No affinity' : `Affinity ${farm.affinity}`}
          </small>
        </span>
        <span className={`arch-chip arch-chip--${farm.enabled ? 'ok' : 'off'}`}>{farm.enabled ? 'Enabled' : 'Disabled'}</span>
      </button>
      <ChipList chips={farm.chips} />
      <ul className="arch-servers" aria-label={`${farm.name} servers`}>
        {farm.servers.map((server) => (
          <li key={server.address} data-enabled={server.enabled}>
            <img src={assetUrl('server-node')} alt="" width={28} height={28} />
            <span>
              <strong>{server.address}</strong>
              <small>
                weight {server.weight} · HTTP {server.httpPort} · HTTPS {server.httpsPort}
              </small>
            </span>
            <span className={`arch-chip arch-chip--${server.enabled ? 'ok' : 'off'}`}>{server.enabled ? 'On' : 'Off'}</span>
          </li>
        ))}
        {!farm.servers.length && <li className="arch-routes__empty">No server is registered.</li>}
      </ul>
    </article>
  )
}
