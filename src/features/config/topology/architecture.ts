import { findReferenceOption } from '../configAnalysis'
import { parseBinding, joinUrl, primaryEndpoint } from './bindings'
import type { BindingInfo } from './bindings'
import {
  diffApplication,
  diffAt,
  diffPool,
  diffScope,
  diffSite,
  diffVirtualDirectory,
  effectiveAttribute,
  effectiveEntries,
  resolveChanges,
  sortChanges,
} from './changes'
import type { Change, ChainBlock } from './changes'
import { parseConnectionString, parseStateServer, defaultDatabasePort } from './databases'
import type { DatabaseTarget } from './databases'
import { getLayers } from './reference'
import type { LayerId, LayerScope } from './reference'
import type { ConfigModel, Origin, XNode } from './types'
import { xChild, xChildren, xPath } from './xnode'

export type Tone = 'ok' | 'info' | 'warn' | 'off' | 'danger'

export interface Chip {
  id: string
  label: string
  tone: Tone
  title?: string
}

export interface PortBadge {
  label: string
  protocol: string
  secure: boolean
}

export interface TreeRow {
  id: string
  kind: 'site' | 'application' | 'virtualDirectory'
  label: string
  urlPath: string
  url: string
  physicalPath: string
  poolName?: string
  depth: number
  /** Number of configuration scopes declared exactly at this path. */
  scoped: number
}

export interface FtpDetails {
  control: string
  data: string
  isolation: string
}

export interface LayerStat {
  id: LayerId
  label: string
  icon: string
  scope: LayerScope
  count: number
  lines: string[]
}

export interface PoolNode {
  id: string
  name: string
  colorIndex: number
  runtime: string
  pipeline: string
  identity: string
  chips: Chip[]
  siteIds: string[]
  appCount: number
  unused: boolean
  shared: boolean
  dbIds: string[]
}

export interface SiteNode {
  id: string
  siteId: string
  name: string
  kind: 'web' | 'ftp'
  bindings: BindingInfo[]
  ports: PortBadge[]
  endpoint: string
  physicalPath: string
  rootPool: string
  poolNames: string[]
  auth: Chip[]
  chips: Chip[]
  tree: TreeRow[]
  applications: number
  virtualDirectories: number
  ftp?: FtpDetails
  layers: LayerStat[]
  farmIds: string[]
  /** Farm names or proxy hosts that this site's own rewrite rules proxy to. */
  routeTargets: string[]
  dbIds: string[]
}

export interface FarmServer {
  address: string
  enabled: boolean
  weight: number
  httpPort: string
  httpsPort: string
}

export interface FarmNode {
  id: string
  name: string
  enabled: boolean
  servers: FarmServer[]
  algorithm: string
  affinity: string
  healthCheck: string
  chips: Chip[]
  routeIds: string[]
  siteIds: string[]
  global: boolean
}

/** Where a rewrite rule lives: IIS Home global rules, server-level rules every site inherits, or a site, application or directory. */
export type RouteLevel = 'global' | 'server' | 'site'

export interface RouteRule {
  id: string
  name: string
  scope: string
  /** Site that owns the rule, or undefined for server-wide rules. */
  siteId?: string
  level: RouteLevel
  global: boolean
  pattern: string
  target: string
  farmId?: string
  proxyHost?: string
  enabled: boolean
  catchAll: boolean
  stop: boolean
  conditions: string[]
}

export interface DbNode {
  id: string
  engineId: string
  engineLabel: string
  host: string
  port?: string
  databases: string[]
  auth: string[]
  local: boolean
  connectionNames: string[]
  poolNames: string[]
  siteIds: string[]
}

export interface DbLink {
  id: string
  poolName: string
  dbId: string
  siteIds: string[]
  names: string[]
}

export type TargetKind =
  | 'server'
  | 'site'
  | 'ftp'
  | 'application'
  | 'virtualDirectory'
  | 'pool'
  | 'farm'
  | 'layer'

export interface TargetInfo {
  id: string
  kind: TargetKind
  title: string
  subtitle?: string
  urls: string[]
  facts: { label: string; value: string }[]
  chips: Chip[]
  changes: Change[]
  /** Scope path used to attach a web.config; set for sites, applications and virtual directories. */
  scopePath?: string
  siteId?: string
  notes: string[]
}

export interface Architecture {
  summary: {
    pools: number
    webSites: number
    ftpSites: number
    applications: number
    virtualDirectories: number
    bindings: number
    farms: number
    databases: number
    modules: number
  }
  pools: PoolNode[]
  sites: SiteNode[]
  farms: FarmNode[]
  routes: RouteRule[]
  databases: DbNode[]
  dbLinks: DbLink[]
  /** Server-level layers (global rules and values inherited by every site); site overrides stay on each site. */
  layers: LayerStat[]
  /** The same server-level layers split by scope for drawing: global rules first, then inherited settings. */
  entry: { global: LayerStat[]; inherited: LayerStat[] }
  proxyEnabled: boolean
  target: (id: string) => TargetInfo | undefined
  /** Targets that can receive an attached web.config, keyed by id with their scope path. */
  attachable: Record<string, string>
}

interface Block extends ChainBlock {
  path: string
  segments: string[]
  rank: number
  order: number
  siteId?: string
}

interface Container {
  id: string
  kind: 'site' | 'application' | 'virtualDirectory'
  siteKey: string
  siteName: string
  urlPath: string
  path: string
  label: string
  physicalPath: string
  poolName: string
  element: XNode
  application?: XNode
  directory?: XNode
}

const EMPTY: XNode = { name: 'empty', attrs: {}, children: [] }
const SERVER: Origin = 'server'

const AUTH_PATH = 'system.webServer/security/authentication'
const FTP_AUTH_METHODS = ['anonymousAuthentication', 'basicAuthentication', 'customAuthentication']
const IIS_AUTH_METHODS: { node: string; label: string; fallback: boolean; tone: Tone }[] = [
  { node: 'anonymousAuthentication', label: 'Anonymous', fallback: true, tone: 'info' },
  { node: 'windowsAuthentication', label: 'Windows', fallback: false, tone: 'ok' },
  { node: 'basicAuthentication', label: 'Basic', fallback: false, tone: 'warn' },
  { node: 'digestAuthentication', label: 'Digest', fallback: false, tone: 'ok' },
  { node: 'clientCertificateMappingAuthentication', label: 'Client certificate', fallback: false, tone: 'ok' },
  { node: 'iisClientCertificateMappingAuthentication', label: 'IIS certificate', fallback: false, tone: 'ok' },
]

const isTrue = (value: string | undefined, fallback = false) =>
  value === undefined ? fallback : value.toLowerCase() === 'true'

const segmentsOf = (path: string) =>
  path
    .split('/')
    .filter(Boolean)
    .map((segment) => segment.toLowerCase())

const isPrefix = (prefix: string[], full: string[]) =>
  prefix.length <= full.length && prefix.every((segment, index) => segment === full[index])

const joinPath = (...parts: string[]) =>
  parts
    .join('/')
    .split('/')
    .filter(Boolean)
    .join('/')

const normalizeUrlPath = (value: string | undefined) => `/${(value ?? '/').replace(/^\/+|\/+$/g, '')}`

const changeKey = (change: Change) => `${change.id}|${change.scope}|${change.origin}`

function dedupe(changes: Change[]) {
  const seen = new Set<string>()
  return changes.filter((change) => {
    const key = changeKey(change)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function layerLines(id: LayerId, changes: Change[]): string[] {
  const inLayer = changes.filter((change) => change.layer === id)
  const subCount = (sub: string) => inLayer.filter((change) => change.sub === sub).length
  const lines: string[] = []
  const add = (label: string, count: number) => {
    if (count > 0) lines.push(`${label} ${count}`)
  }

  if (id === 'ip-restrictions') {
    const entries = inLayer.filter((change) => change.sub === 'ip' && change.kind === 'entry')
    add('Deny', entries.filter((change) => change.label === 'Deny').length)
    add('Allow', entries.filter((change) => change.label === 'Allow').length)
    if (inLayer.some((change) => change.label === 'allowUnlisted' && change.value === 'false')) {
      lines.push('Unlisted clients denied')
    }
    if (inLayer.some((change) => change.sub === 'dynamic' && /enabled$/.test(change.label) && change.value === 'true')) {
      lines.push('Dynamic blocking')
    }
  } else if (id === 'request-filtering') {
    add('Extensions', subCount('extensions'))
    add('Rules', subCount('rules'))
    add('Verbs', subCount('verbs'))
    add('URL', subCount('url'))
    add('Headers', subCount('headers'))
    add('Query', subCount('query'))
    add('Options', subCount('general'))
  } else if (id === 'global-rules') {
    add('Global rules', subCount('global'))
  } else if (id === 'url-rewrite') {
    add('Inbound rules', subCount('inbound'))
    add('Outbound rules', subCount('outbound'))
    add('Rewrite maps', subCount('maps'))
    add('Options', subCount('general'))
  } else if (id === 'redirect') {
    const destination = inLayer.find((change) => change.label === 'destination')
    if (destination) lines.push(`To ${destination.value}`)
    const others = inLayer.length - (destination ? 1 : 0)
    if (others > 0) lines.push(`${others} option${others === 1 ? '' : 's'}`)
  } else if (id === 'authentication') {
    inLayer
      .filter((change) => change.sub === 'methods' && / · enabled$/.test(change.label))
      .forEach((change) => {
        const method = change.label.replace(/Authentication.*$/, '')
        lines.push(`${method.charAt(0).toUpperCase()}${method.slice(1)} ${change.value === 'true' ? 'on' : 'off'}`)
      })
    add('Authorization rules', subCount('authorization'))
    add('SSL options', subCount('ssl'))
    add(
      'Method options',
      inLayer.filter((change) => change.sub === 'methods' && !/ · enabled$/.test(change.label)).length,
    )
  } else if (id === 'arr-routing') {
    add('Proxy options', subCount('proxy'))
    add('Farm options', subCount('farm'))
  }
  return lines
}

function buildLayerStats(
  changes: Change[],
  extra: Partial<Record<LayerId, string[]>> = {},
  summaryOnly: LayerId[] = [],
) {
  return getLayers().map<LayerStat>((layer) => {
    const count = changes.filter((change) => change.layer === layer.id).length
    const generated = summaryOnly.includes(layer.id) ? [] : layerLines(layer.id, changes)
    const lines = [...(extra[layer.id] ?? []), ...generated]
    return {
      id: layer.id,
      label: layer.label,
      icon: layer.icon,
      scope: layer.scope,
      count: count + (extra[layer.id]?.length ?? 0),
      lines,
    }
  })
}

function poolColor(index: number) {
  return index % 8
}

export function buildArchitecture(
  model: ConfigModel,
  attachments: Record<string, ConfigModel> = {},
): Architecture {
  const poolDefaults = model.poolDefaults
  const siteDefaults = model.siteDefaults
  const applicationDefaults = model.applicationDefaults
  const directoryDefaults = model.virtualDirectoryDefaults

  /* ---------- sites and containers ---------- */
  const siteNames = new Set(model.sites.map((site) => (site.attrs.name ?? '').toLowerCase()))
  const containers: Container[] = []
  const siteMeta = new Map<
    string,
    {
      node: XNode
      siteKey: string
      kind: 'web' | 'ftp'
      bindings: BindingInfo[]
      root: Container
    }
  >()

  model.sites.forEach((site, index) => {
    const siteKey = site.attrs.id || String(index + 1)
    const name = site.attrs.name || `Site ${siteKey}`
    const bindings = xChildren(xChild(site, 'bindings'), 'binding').map(parseBinding)
    const kind = bindings.length > 0 && bindings.every((binding) => binding.protocol === 'ftp') ? 'ftp' : 'web'
    const applications = xChildren(site, 'application')
    const rootApplication = applications.find((app) => normalizeUrlPath(app.attrs.path) === '/') ?? applications[0]
    const defaultPool = applicationDefaults?.attrs.applicationPool || 'DefaultAppPool'
    const poolOf = (app: XNode | undefined) => app?.attrs.applicationPool || defaultPool
    const rootDirectory = xChildren(rootApplication, 'virtualDirectory').find(
      (directory) => normalizeUrlPath(directory.attrs.path) === '/',
    )

    const root: Container = {
      id: `site:${siteKey}`,
      kind: 'site',
      siteKey,
      siteName: name,
      urlPath: '/',
      path: name,
      label: name,
      physicalPath: rootDirectory?.attrs.physicalPath ?? '',
      poolName: poolOf(rootApplication),
      element: site,
      application: rootApplication,
      directory: rootDirectory,
    }
    containers.push(root)
    siteMeta.set(siteKey, { node: site, siteKey, kind, bindings, root })

    applications.forEach((app) => {
      const appPath = normalizeUrlPath(app.attrs.path)
      const isRoot = app === rootApplication
      const appDirectory = xChildren(app, 'virtualDirectory').find(
        (directory) => normalizeUrlPath(directory.attrs.path) === '/',
      )
      if (!isRoot) {
        containers.push({
          id: `app:${siteKey}:${appPath}`,
          kind: 'application',
          siteKey,
          siteName: name,
          urlPath: appPath,
          path: joinPath(name, appPath),
          label: appPath,
          physicalPath: appDirectory?.attrs.physicalPath ?? '',
          poolName: poolOf(app),
          element: app,
          application: app,
          directory: appDirectory,
        })
      }
      xChildren(app, 'virtualDirectory').forEach((directory) => {
        const directoryPath = normalizeUrlPath(directory.attrs.path)
        if (directoryPath === '/') return
        const urlPath = normalizeUrlPath(`${isRoot ? '' : appPath}${directoryPath}`)
        containers.push({
          id: `vdir:${siteKey}:${urlPath}`,
          kind: 'virtualDirectory',
          siteKey,
          siteName: name,
          urlPath,
          path: joinPath(name, urlPath),
          label: urlPath,
          physicalPath: directory.attrs.physicalPath ?? '',
          poolName: poolOf(app),
          element: directory,
          application: app,
        })
      })
    })
  })

  const containerById = new Map(containers.map((container) => [container.id, container]))
  const appPaths = new Set(
    containers.filter((container) => container.kind === 'application').map((container) => container.path.toLowerCase()),
  )

  /* ---------- scope blocks ---------- */
  const blocks: Block[] = []
  const classify = (path: string): Origin => {
    if (!path) return SERVER
    const lower = path.toLowerCase()
    if (siteNames.has(lower)) return 'site'
    return appPaths.has(lower) ? 'app' : 'dir'
  }
  const siteKeyByName = new Map(
    containers.filter((container) => container.kind === 'site').map((container) => [container.siteName.toLowerCase(), container.siteKey]),
  )

  model.scopes.forEach((scope, order) => {
    const segments = segmentsOf(scope.path)
    blocks.push({
      path: scope.path,
      segments,
      root: scope.root,
      scope: scope.path,
      origin: classify(scope.path),
      rank: 0,
      order,
      siteId: segments.length ? siteKeyByName.get(segments[0]) : undefined,
    })
  })

  Object.entries(attachments).forEach(([targetId, attached]) => {
    const target = containerById.get(targetId)
    if (!target) return
    attached.scopes.forEach((scope, order) => {
      const path = joinPath(target.path, scope.path)
      blocks.push({
        path,
        segments: segmentsOf(path),
        root: scope.root,
        scope: path,
        origin: 'web.config',
        rank: 1,
        order: 10_000 + order,
        siteId: target.siteKey,
      })
    })
  })

  const chainCache = new Map<string, Block[]>()
  const chainFor = (path: string) => {
    const key = path.toLowerCase()
    let chain = chainCache.get(key)
    if (!chain) {
      const wanted = segmentsOf(path)
      chain = blocks
        .filter((block) => isPrefix(block.segments, wanted))
        .sort(
          (left, right) =>
            left.segments.length - right.segments.length || left.rank - right.rank || left.order - right.order,
        )
      chainCache.set(key, chain)
    }
    return chain
  }

  const diffCache = new WeakMap<Block, Change[]>()
  const blockDiff = (block: Block) => {
    let diff = diffCache.get(block)
    if (!diff) {
      diff = diffScope(block.root, { origin: block.origin, scope: block.scope })
      diffCache.set(block, diff)
    }
    return diff
  }

  const chainChanges = (path: string) => resolveChanges(chainFor(path).map(blockDiff))

  const descendantPaths = (path: string) => {
    const wanted = segmentsOf(path)
    const paths = new Map<string, string>()
    blocks.forEach((block) => {
      if (block.segments.length > wanted.length && isPrefix(wanted, block.segments)) {
        paths.set(block.path.toLowerCase(), block.path)
      }
    })
    return [...paths.values()]
  }

  const subtreeChanges = (path: string) =>
    dedupe([path, ...descendantPaths(path)].flatMap((candidate) => chainChanges(candidate)))

  /* ---------- pools ---------- */
  const poolAttribute = (pool: XNode, element: string | null, attribute: string) => {
    const read = (node: XNode | null) => (element ? xChild(node, element)?.attrs[attribute] : node?.attrs[attribute])
    return read(pool) ?? read(poolDefaults)
  }

  const poolChanges = (pool: XNode) =>
    resolveChanges([
      diffPool(poolDefaults ?? EMPTY, { origin: 'defaults', scope: 'applicationPoolDefaults' }),
      diffPool(pool, { origin: 'pool', scope: pool.attrs.name ?? '' }),
    ])

  const poolSites = new Map<string, Set<string>>()
  const poolApps = new Map<string, number>()
  containers.forEach((container) => {
    if (container.kind === 'virtualDirectory') return
    const site = siteMeta.get(container.siteKey)
    if (!site || site.kind === 'ftp') return
    poolApps.set(container.poolName, (poolApps.get(container.poolName) ?? 0) + 1)
    if (!poolSites.has(container.poolName)) poolSites.set(container.poolName, new Set())
    poolSites.get(container.poolName)?.add(container.siteKey)
  })

  const pools: PoolNode[] = model.pools.map((pool, index) => {
    const name = pool.attrs.name ?? `Pool ${index + 1}`
    const runtimeValue = poolAttribute(pool, null, 'managedRuntimeVersion') ?? 'v4.0'
    const runtime = runtimeValue === '' ? 'No managed code' : `.NET CLR ${runtimeValue}`
    const classic = (poolAttribute(pool, null, 'managedPipelineMode') ?? 'Integrated') === 'Classic'
    const identityType = poolAttribute(pool, 'processModel', 'identityType') ?? 'ApplicationPoolIdentity'
    const userName = poolAttribute(pool, 'processModel', 'userName')
    const identity = identityType === 'SpecificUser' && userName ? userName : identityType
    const siteIds = [...(poolSites.get(name) ?? [])]
    const unused = !poolSites.has(name)
    const chips: Chip[] = [
      { id: 'runtime', label: runtime.replace('.NET CLR ', 'CLR '), tone: runtimeValue === '' ? 'info' : 'off', title: runtime },
      { id: 'pipeline', label: classic ? 'Classic' : 'Integrated', tone: classic ? 'warn' : 'off', title: 'Managed pipeline mode' },
      {
        id: 'identity',
        label: identityType === 'ApplicationPoolIdentity' ? 'AppPoolIdentity' : identity,
        tone: identityType === 'LocalSystem' ? 'danger' : identityType === 'ApplicationPoolIdentity' ? 'off' : 'info',
        title: `Process identity: ${identity}`,
      },
    ]
    if (isTrue(poolAttribute(pool, null, 'enable32BitAppOnWin64'))) {
      chips.push({ id: '32bit', label: '32-bit', tone: 'warn', title: 'enable32BitAppOnWin64 is true' })
    }
    if (poolAttribute(pool, null, 'startMode') === 'AlwaysRunning') {
      chips.push({ id: 'always', label: 'AlwaysRunning', tone: 'info', title: 'startMode AlwaysRunning' })
    }
    if (poolAttribute(pool, null, 'autoStart') === 'false') {
      chips.push({ id: 'autostart', label: 'Auto-start off', tone: 'warn', title: 'autoStart is false' })
    }
    const idle = poolAttribute(pool, 'processModel', 'idleTimeout')
    if (idle && idle !== '00:20:00') {
      chips.push({ id: 'idle', label: idle === '00:00:00' ? 'No idle timeout' : `Idle ${idle}`, tone: 'info', title: `idleTimeout ${idle}` })
    }
    if (poolAttribute(pool, 'failure', 'rapidFailProtection') === 'false') {
      chips.push({ id: 'rapid', label: 'Rapid-fail off', tone: 'warn', title: 'Rapid-fail protection is disabled' })
    }
    const maxProcesses = Number(poolAttribute(pool, 'processModel', 'maxProcesses') ?? 1)
    if (maxProcesses > 1) {
      chips.push({ id: 'garden', label: `Web garden ×${maxProcesses}`, tone: 'info', title: `maxProcesses ${maxProcesses}` })
    }
    if (Number(poolAttribute(pool, 'cpu', 'limit') ?? 0) > 0) {
      chips.push({ id: 'cpu', label: 'CPU limit', tone: 'info', title: `cpu limit ${poolAttribute(pool, 'cpu', 'limit')}` })
    }
    const recycle = poolAttribute(pool, 'recycling', 'disallowOverlappedRotation')
    if (isTrue(recycle)) {
      chips.push({ id: 'overlap', label: 'No overlapped recycle', tone: 'info' })
    }
    if (siteIds.length > 1) {
      chips.push({ id: 'shared', label: `Shared ×${siteIds.length}`, tone: 'info', title: 'Used by more than one site' })
    }
    if (unused) chips.push({ id: 'unused', label: 'Unused', tone: 'warn', title: 'No web site or application uses this pool' })

    return {
      id: `pool:${name}`,
      name,
      colorIndex: poolColor(index),
      runtime,
      pipeline: classic ? 'Classic' : 'Integrated',
      identity,
      chips,
      siteIds: siteIds.map((siteKey) => `site:${siteKey}`),
      appCount: poolApps.get(name) ?? 0,
      unused,
      shared: siteIds.length > 1,
      dbIds: [],
    }
  })

  /* ---------- farms and routes ---------- */
  const farmNodes = xChildren(model.webFarms, 'webFarm')
  const farms: FarmNode[] = farmNodes.map((farm) => {
    const name = farm.attrs.name ?? 'farm'
    const routing = xChild(farm, 'applicationRequestRouting')
    const servers = xChildren(farm, 'server').map<FarmServer>((server) => {
      const options = xChild(server, 'applicationRequestRouting')
      return {
        address: server.attrs.address ?? '',
        enabled: isTrue(server.attrs.enabled, true),
        weight: Number(options?.attrs.weight ?? 100),
        httpPort: options?.attrs.httpPort ?? '80',
        httpsPort: options?.attrs.httpsPort ?? '443',
      }
    })
    const algorithm = xChild(routing, 'loadBalancing')?.attrs.algorithm ?? 'WeightedRoundRobin'
    const affinityNode = xChild(routing, 'affinity')
    const affinity = isTrue(affinityNode?.attrs.useCookie)
      ? `Cookie ${affinityNode?.attrs.cookieName ?? 'ARRAffinity'}`
      : 'None'
    const health = xChild(routing, 'healthCheck')
    const protocol = xChild(routing, 'protocol')
    const enabled = isTrue(farm.attrs.enabled, true)
    const chips: Chip[] = [
      { id: 'state', label: enabled ? 'Enabled' : 'Disabled', tone: enabled ? 'ok' : 'off' },
      { id: 'algorithm', label: algorithm.replace(/([a-z])([A-Z])/g, '$1 $2'), tone: 'info', title: 'Load-balancing algorithm' },
    ]
    if (affinity !== 'None') chips.push({ id: 'affinity', label: 'Affinity', tone: 'info', title: affinity })
    if (health?.attrs.url) chips.push({ id: 'health', label: 'Health check', tone: 'info', title: health.attrs.url })
    if (isTrue(protocol?.attrs.preserveHostHeader)) chips.push({ id: 'host', label: 'Preserve Host', tone: 'info' })
    if (isTrue(xChild(protocol, 'cache')?.attrs.enabled)) chips.push({ id: 'cache', label: 'Cache', tone: 'info' })
    return {
      id: `farm:${name}`,
      name,
      enabled,
      servers,
      algorithm,
      affinity,
      healthCheck: health?.attrs.url ?? '',
      chips,
      routeIds: [],
      siteIds: [],
      global: false,
    }
  })
  const farmByName = new Map(farms.map((farm) => [farm.name.toLowerCase(), farm]))

  const routes: RouteRule[] = []
  const collectRules = (block: Block, collection: 'globalRules' | 'rules', global: boolean) => {
    const rules = xChildren(xPath(block.root, 'system.webServer', 'rewrite', collection), 'rule')
    rules.forEach((rule) => {
      const action = xChild(rule, 'action')
      if ((action?.attrs.type ?? 'Rewrite') !== 'Rewrite') return
      const url = action?.attrs.url ?? ''
      const host = /^https?:\/\/([^/:{?\s]+)/i.exec(url)?.[1]
      if (!host) return
      const farm = farmByName.get(host.toLowerCase())
      const match = xChild(rule, 'match')
      const pattern = match?.attrs.url ?? ''
      const conditions = xChildren(xChild(rule, 'conditions'), 'add').map(
        (condition) => `${condition.attrs.input ?? ''} ${isTrue(condition.attrs.negate) ? '!~' : '~'} ${condition.attrs.pattern ?? ''}`,
      )
      const route: RouteRule = {
        id: `rule:${global ? 'global' : 'rules'}:${block.scope || 'server'}:${rule.attrs.name ?? routes.length}`,
        name: rule.attrs.name ?? 'Unnamed rule',
        scope: block.scope,
        siteId: block.siteId ? `site:${block.siteId}` : undefined,
        level: global ? 'global' : block.siteId ? 'site' : 'server',
        global,
        pattern,
        target: url,
        farmId: farm?.id,
        proxyHost: farm ? undefined : host,
        enabled: rule.attrs.enabled === undefined || isTrue(rule.attrs.enabled),
        // Only an unconditional match-everything pattern captures every request; a condition narrows it.
        catchAll:
          !isTrue(match?.attrs.negate) &&
          conditions.length === 0 &&
          /^(\*|\.\*|\(\.\*\)|\^\(\.\*\)\$?|\^\.\*\$)$/.test(pattern.trim()),
        stop: isTrue(rule.attrs.stopProcessing),
        conditions,
      }
      routes.push(route)
    })
  }
  blocks
    .filter((block) => block.origin === SERVER)
    .forEach((block) => {
      collectRules(block, 'globalRules', true)
      collectRules(block, 'rules', false)
    })
  blocks.filter((block) => block.origin !== SERVER).forEach((block) => collectRules(block, 'rules', false))

  routes.forEach((route) => {
    const farm = route.farmId ? farms.find((candidate) => candidate.id === route.farmId) : undefined
    if (!farm) return
    farm.routeIds.push(route.id)
    if (route.global || !route.siteId) farm.global = true
    if (route.siteId && !farm.siteIds.includes(route.siteId)) farm.siteIds.push(route.siteId)
  })

  const serverChain = chainFor('')
  const proxyEnabled = isTrue(effectiveAttribute(serverChain, 'system.webServer/proxy', 'enabled'))

  // A rewrite rule that targets a farm or proxy host is an ARR routing rule; the ARR lane lists it, not the URL Rewrite layers.
  const proxyRuleNames = new Set(routes.map((route) => route.name.toLowerCase()))
  const isProxyRuleChange = (change: Change) =>
    change.kind === 'entry' &&
    (change.layer === 'global-rules' || (change.layer === 'url-rewrite' && change.sub === 'inbound')) &&
    proxyRuleNames.has(change.label.toLowerCase())
  const withoutProxyRules = (changes: Change[]) => changes.filter((change) => !isProxyRuleChange(change))

  /* ---------- databases ---------- */
  const databaseNodes = new Map<string, DbNode>()
  const links = new Map<string, DbLink>()
  const addConnection = (container: Container, name: string, target: DatabaseTarget | null) => {
    if (!target) return
    const port = target.port || defaultDatabasePort(target.engineId) || undefined
    const key = `${target.engineId}|${target.host.toLowerCase()}|${port ?? ''}`
    const id = `db:${key}`
    let node = databaseNodes.get(key)
    if (!node) {
      node = {
        id,
        engineId: target.engineId,
        engineLabel: target.engineLabel,
        host: target.host,
        port,
        databases: [],
        auth: [],
        local: target.local,
        connectionNames: [],
        poolNames: [],
        siteIds: [],
      }
      databaseNodes.set(key, node)
    }
    if (target.database && !node.databases.includes(target.database)) node.databases.push(target.database)
    if (!node.auth.includes(target.auth)) node.auth.push(target.auth)
    if (!node.connectionNames.includes(name)) node.connectionNames.push(name)
    if (!node.poolNames.includes(container.poolName)) node.poolNames.push(container.poolName)
    const siteId = `site:${container.siteKey}`
    if (!node.siteIds.includes(siteId)) node.siteIds.push(siteId)

    const linkKey = `${container.poolName}|${id}`
    const link = links.get(linkKey) ?? { id: `link:${linkKey}`, poolName: container.poolName, dbId: id, siteIds: [], names: [] }
    if (!link.siteIds.includes(siteId)) link.siteIds.push(siteId)
    if (!link.names.includes(name)) link.names.push(name)
    links.set(linkKey, link)
  }

  containers.forEach((container) => {
    if (siteMeta.get(container.siteKey)?.kind === 'ftp') return
    const chain = chainFor(container.path)
    effectiveEntries(chain, 'connectionStrings').forEach((entry) => {
      addConnection(
        container,
        entry.attrs.name ?? 'connection',
        parseConnectionString(entry.attrs.connectionString ?? '', entry.attrs.providerName ?? ''),
      )
    })
    effectiveEntries(chain, 'appSettings').forEach((entry) => {
      const key = entry.attrs.key ?? ''
      const value = entry.attrs.value ?? ''
      if (!value || value === '******') return
      if (/redis|cache/i.test(key) && /^[\w.-]+:\d+/.test(value)) {
        addConnection(container, key, parseConnectionString(value, 'redis'))
      } else if (/(conn(ection)?\s*string|database|sql)/i.test(key) && /=/.test(value) && /;/.test(value)) {
        addConnection(container, key, parseConnectionString(value))
      }
    })
    const mode = effectiveAttribute(chain, 'system.web/sessionState', 'mode')
    if (mode === 'SQLServer') {
      const value = effectiveAttribute(chain, 'system.web/sessionState', 'sqlConnectionString')
      if (value) addConnection(container, 'Session state', parseConnectionString(value, 'sqlclient'))
    } else if (mode === 'StateServer') {
      const value = effectiveAttribute(chain, 'system.web/sessionState', 'stateConnectionString')
      if (value) addConnection(container, 'Session state', parseStateServer(value))
    }
  })

  const databases = [...databaseNodes.values()]
  const dbLinks = [...links.values()]
  pools.forEach((pool) => {
    pool.dbIds = dbLinks.filter((link) => link.poolName.toLowerCase() === pool.name.toLowerCase()).map((link) => link.dbId)
  })

  /* ---------- site nodes ---------- */
  const targetCache = new Map<string, TargetInfo>()
  const scopedCount = (path: string) => blocks.filter((block) => block.path.toLowerCase() === path.toLowerCase()).length

  const siteElementChanges = (container: Container) =>
    resolveChanges([
      diffSite(siteDefaults ?? EMPTY, { origin: 'defaults', scope: 'siteDefaults' }),
      diffSite(container.element, { origin: 'site', scope: container.siteName }),
    ])

  const applicationChanges = (container: Container) =>
    container.application
      ? resolveChanges([
          diffApplication(applicationDefaults ?? EMPTY, { origin: 'defaults', scope: 'applicationDefaults' }),
          diffApplication(container.application, { origin: 'app', scope: container.urlPath }),
        ])
      : []

  const directoryChanges = (container: Container) => {
    const node = container.kind === 'virtualDirectory' ? container.element : container.directory
    return node
      ? resolveChanges([
          diffVirtualDirectory(directoryDefaults ?? EMPTY, { origin: 'defaults', scope: 'virtualDirectoryDefaults' }),
          diffVirtualDirectory(node, { origin: 'dir', scope: container.urlPath }),
        ])
      : []
  }

  const poolsOfSite = (siteKey: string) => {
    const names: string[] = []
    containers
      .filter((container) => container.siteKey === siteKey && container.kind !== 'virtualDirectory')
      .forEach((container) => {
        if (!names.includes(container.poolName)) names.push(container.poolName)
      })
    return names
  }

  const poolChangesByName = (name: string) => {
    const pool = model.pools.find((candidate) => (candidate.attrs.name ?? '').toLowerCase() === name.toLowerCase())
    return pool ? poolChanges(pool) : []
  }

  const FTP_GROUPS = /^(ftp|logging$|tracing$|site$|site-limits$|virtual-directory$|application$)/

  const containerChanges = (container: Container): Change[] => {
    const own =
      container.kind === 'site'
        ? [...siteElementChanges(container), ...applicationChanges(container), ...directoryChanges(container)]
        : container.kind === 'application'
          ? [...applicationChanges(container), ...directoryChanges(container)]
          : directoryChanges(container)
    const isFtp = siteMeta.get(container.siteKey)?.kind === 'ftp'
    const poolNames = container.kind === 'site' ? poolsOfSite(container.siteKey) : [container.poolName]
    const poolSet = isFtp ? [] : poolNames.flatMap(poolChangesByName)
    const combined = sortChanges(dedupe([...poolSet, ...own, ...subtreeChanges(container.path)]))
    // FTP sites ignore ASP.NET and HTTP pipeline settings; web sites ignore the FTP service.
    return combined.filter((change) =>
      isFtp
        ? change.category === 'iis' && FTP_GROUPS.test(change.groupId)
        : !change.groupId.startsWith('ftp'),
    )
  }

  /** Counts per entry layer. Settings inherited from the server are shown once on the server entry stack. */
  const siteLayerChanges = (changes: Change[]) =>
    changes.filter((change) => change.origin !== 'server' && change.origin !== 'defaults' && change.origin !== 'pool')

  const authenticationChips = (container: Container, kind: 'web' | 'ftp'): Chip[] => {
    if (kind === 'ftp') {
      const site = container.element
      const read = (method: string) =>
        xPath(site, 'ftpServer', 'security', 'authentication', method)?.attrs.enabled ??
        xPath(siteDefaults, 'ftpServer', 'security', 'authentication', method)?.attrs.enabled
      const chips: Chip[] = []
      FTP_AUTH_METHODS.forEach((method) => {
        if (!isTrue(read(method))) return
        const label = method.replace('Authentication', '')
        chips.push({
          id: `auth:${method}`,
          label: label.charAt(0).toUpperCase() + label.slice(1),
          tone: method === 'basicAuthentication' ? 'warn' : method === 'anonymousAuthentication' ? 'info' : 'ok',
          title: `FTP ${method} is enabled`,
        })
      })
      return chips.length
        ? chips
        : [{ id: 'auth:none', label: 'No auth enabled', tone: 'warn', title: 'No FTP authentication method is enabled for this site' }]
    }

    const chain = chainFor(container.path)
    const chips: Chip[] = []
    IIS_AUTH_METHODS.forEach((method) => {
      const value = effectiveAttribute(chain, `${AUTH_PATH}/${method.node}`, 'enabled')
      if (isTrue(value, method.fallback)) {
        chips.push({ id: `auth:${method.node}`, label: method.label, tone: method.tone, title: `${method.label} authentication is enabled` })
      }
    })
    if (effectiveAttribute(chain, 'system.web/authentication', 'mode') === 'Forms') {
      chips.push({ id: 'auth:forms', label: 'Forms', tone: 'ok', title: 'ASP.NET Forms authentication' })
    }
    return chips
  }

  const readSetting = (container: Container, element: string, attribute: string, fallback: string) =>
    xChild(container.element, element)?.attrs[attribute] ??
    xChild(siteDefaults, element)?.attrs[attribute] ??
    fallback

  const ftpPolicy = (container: Container, attribute: string) => {
    const path = 'system.applicationHost/sites/site/ftpServer/security/ssl'
    return (
      xPath(container.element, 'ftpServer', 'security', 'ssl')?.attrs[attribute] ??
      xPath(siteDefaults, 'ftpServer', 'security', 'ssl')?.attrs[attribute] ??
      findReferenceOption(path, attribute)?.defaultValue ??
      'SslAllow'
    )
  }

  const buildTree = (siteKey: string, endpoint: string, kind: 'web' | 'ftp'): TreeRow[] => {
    const own = containers.filter((container) => container.siteKey === siteKey)
    const rows = own.map((container) => ({ container, segments: segmentsOf(container.urlPath) }))
    rows.sort((left, right) => {
      const length = Math.min(left.segments.length, right.segments.length)
      for (let index = 0; index < length; index += 1) {
        const order = left.segments[index].localeCompare(right.segments[index])
        if (order !== 0) return order
      }
      return left.segments.length - right.segments.length
    })
    return rows.map(({ container, segments }) => {
      const depth =
        container.kind === 'site'
          ? 0
          : 1 +
            rows.filter(
              (other) =>
                other.container !== container &&
                other.container.kind !== 'site' &&
                other.segments.length < segments.length &&
                isPrefix(other.segments, segments),
            ).length
      return {
        id: container.id,
        kind: container.kind,
        label: container.kind === 'site' ? container.siteName : container.urlPath.split('/').filter(Boolean).slice(-1)[0] ?? container.urlPath,
        urlPath: container.urlPath,
        url: joinUrl(endpoint, container.urlPath),
        physicalPath: container.physicalPath,
        poolName: container.kind === 'virtualDirectory' || kind === 'ftp' ? undefined : container.poolName,
        depth,
        scoped: scopedCount(container.path),
      }
    })
  }

  const sites: SiteNode[] = [...siteMeta.values()].map(({ node, siteKey, kind, bindings, root }) => {
    const endpoint = primaryEndpoint(bindings)
    const tree = buildTree(siteKey, endpoint, kind)
    const auth = authenticationChips(root, kind)
    const ports: PortBadge[] = []
    bindings.forEach((binding) => {
      const label = binding.port || binding.protocol
      if (!ports.some((port) => port.label === label && port.protocol === binding.protocol)) {
        ports.push({ label, protocol: binding.protocol, secure: binding.secure })
      }
    })

    const chips: Chip[] = []
    if (isTrue(xChild(node, 'hsts')?.attrs.enabled ?? xChild(siteDefaults, 'hsts')?.attrs.enabled)) {
      chips.push({ id: 'hsts', label: 'HSTS', tone: 'ok', title: 'HTTP Strict Transport Security' })
    }
    if (isTrue(readSetting(root, 'traceFailedRequestsLogging', 'enabled', 'false'))) {
      chips.push({ id: 'freb', label: 'FREB', tone: 'info', title: 'Failed request tracing is enabled' })
    }
    if (node.attrs.serverAutoStart === 'false') {
      chips.push({ id: 'autostart', label: 'Auto-start off', tone: 'warn', title: 'serverAutoStart is false' })
    }
    if (bindings.some((binding) => binding.sni)) chips.push({ id: 'sni', label: 'SNI', tone: 'info', title: 'Server Name Indication' })
    if (kind === 'ftp') {
      const control = ftpPolicy(root, 'controlChannelPolicy')
      const data = ftpPolicy(root, 'dataChannelPolicy')
      const required = control === 'SslRequire' && data === 'SslRequire'
      chips.push({
        id: 'ftps',
        label: required ? 'FTPS required' : control === 'SslAllow' ? 'FTPS optional' : 'Plain FTP',
        tone: required ? 'ok' : 'warn',
        title: `Control channel ${control}, data channel ${data}`,
      })
    }

    const siteRoutes = routes.filter((route) => route.siteId === root.id)
    const farmIds = [...new Set(siteRoutes.flatMap((route) => (route.farmId ? [route.farmId] : [])))]
    const routeTargets = [
      ...new Set(
        siteRoutes.map((route) => farms.find((farm) => farm.id === route.farmId)?.name ?? route.proxyHost ?? route.target),
      ),
    ]
    if (siteRoutes.length) {
      chips.push({
        id: 'arr',
        label: 'ARR rule',
        tone: 'info',
        title: 'A site-level URL Rewrite rule proxies matching requests to a server farm or host through ARR',
      })
    }

    const dbIds = [...new Set(dbLinks.filter((link) => link.siteIds.includes(root.id)).map((link) => link.dbId))]
    const applications =
      containers.filter((container) => container.siteKey === siteKey && container.kind === 'application').length +
      (kind === 'web' ? 1 : 0)
    const virtualDirectories = containers.filter((container) => container.siteKey === siteKey && container.kind === 'virtualDirectory').length

    const changes = containerChanges(root)
    return {
      id: root.id,
      siteId: siteKey,
      name: root.siteName,
      kind,
      bindings,
      ports,
      endpoint,
      physicalPath: root.physicalPath,
      rootPool: kind === 'ftp' ? '' : root.poolName,
      poolNames: kind === 'ftp' ? [] : poolsOfSite(siteKey),
      auth,
      chips,
      tree,
      applications,
      virtualDirectories,
      ftp:
        kind === 'ftp'
          ? {
              control: ftpPolicy(root, 'controlChannelPolicy'),
              data: ftpPolicy(root, 'dataChannelPolicy'),
              isolation: xPath(node, 'ftpServer', 'userIsolation')?.attrs.mode ?? 'None',
            }
          : undefined,
      layers: buildLayerStats(withoutProxyRules(siteLayerChanges(changes)), {
        'arr-routing': routeTargets.map((name) => `Site rule → ${name}`),
      }),
      farmIds,
      routeTargets,
      dbIds,
    }
  })
  const siteById = new Map(sites.map((site) => [site.id, site]))

  /* ---------- server-wide layers ---------- */
  const farmChanges = (farm: XNode) =>
    resolveChanges([
      diffAt(farm, 'webFarms/webFarm', { origin: SERVER, scope: `Farm ${farm.attrs.name ?? ''}` }, {
        skipAttributes: new Set(['name']),
        skipChildren: new Set(['server']),
      }),
    ])
  const globalArr = xChild(model.webFarms, 'applicationRequestRouting')
  const arrGlobalChanges = globalArr
    ? resolveChanges([diffAt(globalArr, 'webFarms/applicationRequestRouting', { origin: SERVER, scope: 'ARR global' })])
    : []

  const serverChanges = dedupe([...chainChanges(''), ...arrGlobalChanges])
  const allFarmChanges = farmNodes.flatMap(farmChanges)
  // Only server-level values: what each site overrides stays on its own card.
  const serverLayerChanges = dedupe([...serverChanges, ...allFarmChanges])

  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`
  const routesAt = (level: RouteLevel) => routes.filter((route) => route.level === level)
  const globalRoutes = routesAt('global')
  const hasArr = farms.length > 0 || routes.length > 0 || proxyEnabled
  const arrLines = [
    ...(globalRoutes.length ? [plural(globalRoutes.length, 'global rule')] : []),
    ...(farms.length ? [plural(farms.length, 'server farm')] : []),
    ...(hasArr ? [proxyEnabled ? 'Proxy enabled' : 'Proxy disabled'] : []),
    ...(routesAt('site').length ? [plural(routesAt('site').length, 'site-level rule')] : []),
    ...(routesAt('server').length ? [plural(routesAt('server').length, 'server-level rule')] : []),
  ]
  const enabledAuth = IIS_AUTH_METHODS.filter((method) =>
    isTrue(effectiveAttribute(serverChain, `${AUTH_PATH}/${method.node}`, 'enabled'), method.fallback),
  ).map((method) => method.label)
  const authLines = [enabledAuth.length ? `Enabled: ${enabledAuth.join(', ')}` : 'No method enabled']
  const authChangeCount = serverLayerChanges.filter((change) => change.layer === 'authentication').length
  const layers = buildLayerStats(
    withoutProxyRules(serverLayerChanges),
    { authentication: authLines, 'arr-routing': arrLines },
    ['authentication'],
  ).map((layer) => (layer.id === 'authentication' ? { ...layer, count: authChangeCount } : layer))
  const entry = {
    // The ARR slab sits with the global rules only when a global rule actually routes into ARR.
    global: layers
      .filter((layer) => layer.scope === 'global' && (layer.id === 'arr-routing' ? globalRoutes.length > 0 : layer.count > 0))
      .map((layer) => (layer.id === 'arr-routing' ? { ...layer, count: globalRoutes.length } : layer)),
    inherited: layers.filter((layer) => layer.scope === 'inherited'),
  }

  /* ---------- targets ---------- */
  const attachable: Record<string, string> = Object.fromEntries(containers.map((container) => [container.id, container.path]))

  function targetFor(id: string): TargetInfo | undefined {
    const cached = targetCache.get(id)
    if (cached) return cached
    const built = buildTarget(id)
    if (built) targetCache.set(id, built)
    return built
  }

  function buildTarget(id: string): TargetInfo | undefined {
    const container = containerById.get(id)
    if (container) {
      const meta = siteMeta.get(container.siteKey)
      const site = siteById.get(`site:${container.siteKey}`)
      const kind = container.kind === 'site' ? (meta?.kind === 'ftp' ? 'ftp' : 'site') : container.kind
      const endpoint = site?.endpoint ?? ''
      const urls =
        container.kind === 'site'
          ? (meta?.bindings ?? []).map((binding) => joinUrl(binding.url, '/'))
          : [joinUrl(endpoint, container.urlPath)]
      const facts = [
        { label: 'Physical path', value: container.physicalPath || '—' },
        ...(meta?.kind === 'ftp' ? [] : [{ label: 'Application pool', value: container.poolName }]),
      ]
      if (container.kind === 'site') {
        facts.push({ label: 'Bindings', value: (meta?.bindings ?? []).map((binding) => `${binding.protocol}://${binding.host || '*'}:${binding.port}`).join(', ') || '—' })
      } else {
        facts.push({ label: 'Site', value: container.siteName })
      }
      return {
        id,
        kind,
        title: container.kind === 'site' ? container.siteName : container.label,
        subtitle:
          container.kind === 'site'
            ? meta?.kind === 'ftp'
              ? 'FTP site'
              : 'Web site'
            : container.kind === 'application'
              ? 'Application'
              : 'Virtual directory',
        urls,
        facts,
        chips: container.kind === 'site' ? [...(site?.auth ?? []), ...(site?.chips ?? [])] : [],
        changes: containerChanges(container),
        scopePath: container.path,
        siteId: `site:${container.siteKey}`,
        notes: [],
      }
    }

    if (id.startsWith('pool:')) {
      const pool = pools.find((candidate) => candidate.id === id)
      if (!pool) return undefined
      const siteNames = pool.siteIds.map((siteId) => siteById.get(siteId)?.name).filter((name): name is string => Boolean(name))
      return {
        id,
        kind: 'pool',
        title: pool.name,
        subtitle: 'Application pool',
        urls: [],
        facts: [
          { label: 'Runtime', value: pool.runtime },
          { label: 'Pipeline', value: pool.pipeline },
          { label: 'Identity', value: pool.identity },
          { label: 'Sites', value: siteNames.join(', ') || 'None' },
        ],
        chips: pool.chips,
        changes: poolChangesByName(pool.name),
        notes: [],
      }
    }

    if (id.startsWith('farm:')) {
      const farm = farms.find((candidate) => candidate.id === id)
      const node = farmNodes.find((candidate) => candidate.attrs.name === farm?.name)
      if (!farm || !node) return undefined
      return {
        id,
        kind: 'farm',
        title: farm.name,
        subtitle: 'ARR server farm',
        urls: [],
        facts: [
          ...farm.servers.map((server) => ({
            label: server.address,
            value: `${server.enabled ? 'Enabled' : 'Disabled'} · weight ${server.weight} · HTTP ${server.httpPort} · HTTPS ${server.httpsPort}`,
          })),
        ],
        chips: farm.chips,
        changes: farmChanges(node),
        notes: routes.filter((route) => route.farmId === farm.id).map((route) => `${route.name}: ${route.pattern} → ${route.target}`),
      }
    }

    if (id === 'server') {
      return {
        id,
        kind: 'server',
        title: 'IIS server',
        subtitle: 'applicationHost.config',
        urls: [],
        facts: [
          { label: 'Sites', value: String(sites.length) },
          { label: 'Application pools', value: String(pools.length) },
        ],
        chips: proxyEnabled ? [{ id: 'proxy', label: 'ARR proxy on', tone: 'info' }] : [],
        changes: serverChanges,
        notes: [],
      }
    }

    if (id.startsWith('layer:')) {
      const [layerId, scopeId] = id.slice('layer:'.length).split('@')
      const definition = getLayers().find((layer) => layer.id === layerId)
      if (!definition) return undefined
      const scopeSite = scopeId ? siteById.get(scopeId) : undefined
      const source = scopeId ? siteLayerChanges(targetFor(scopeId)?.changes ?? []) : serverLayerChanges
      const levelName: Record<RouteLevel, string> = { global: 'Global', server: 'Server', site: 'Site' }
      const routeNotes =
        definition.id === 'arr-routing'
          ? routes
              .filter((route) => (scopeId ? route.siteId === scopeId : true))
              .map(
                (route) =>
                  `${levelName[route.level]}${route.siteId ? ` · ${siteById.get(route.siteId)?.name ?? route.scope}` : ''} — ${route.name}: ${route.pattern} → ${route.target}`,
              )
          : []
      const subtitle = scopeSite
        ? `Site-level layer · ${scopeSite.name}`
        : definition.id === 'global-rules'
          ? 'Server level · global rules (applicationHost.config only)'
          : definition.id === 'arr-routing'
            ? 'Server level · ARR routing'
            : 'Server level · inherited by every site'
      return {
        id,
        kind: 'layer',
        title: definition.label,
        subtitle,
        urls: [],
        facts: [],
        chips: [],
        changes: source.filter((change) => change.layer === definition.id && !isProxyRuleChange(change)),
        notes: [definition.description, ...routeNotes],
      }
    }
    return undefined
  }

  return {
    summary: {
      pools: pools.length,
      webSites: sites.filter((site) => site.kind === 'web').length,
      ftpSites: sites.filter((site) => site.kind === 'ftp').length,
      applications: containers.filter((container) => container.kind === 'application').length + sites.filter((site) => site.kind === 'web').length,
      virtualDirectories: containers.filter((container) => container.kind === 'virtualDirectory').length,
      bindings: sites.reduce((total, site) => total + site.bindings.length, 0),
      farms: farms.length,
      databases: databases.length,
      modules: model.globalModules.length,
    },
    pools,
    sites,
    farms,
    routes,
    databases,
    dbLinks,
    layers,
    entry,
    proxyEnabled,
    target: targetFor,
    attachable,
  }
}
