import architectureXml from '../reference/architecture-reference.xml?raw'

export type LayerId =
  | 'global-rules'
  | 'ip-restrictions'
  | 'request-filtering'
  | 'redirect'
  | 'url-rewrite'
  | 'authentication'
  | 'arr-routing'

/** `global` layers are server-wide rules evaluated first; `inherited` layers are server values each site may override. */
export type LayerScope = 'global' | 'inherited'

export type ChangeCategory = 'pool' | 'aspnet' | 'iis'

export interface LayerDefinition {
  id: LayerId
  label: string
  order: number
  scope: LayerScope
  icon: string
  learn: string
  description: string
}

export interface GroupDefinition {
  id: string
  category: ChangeCategory
  label: string
  paths: string[]
  layer?: LayerId
  sub?: string
  parent?: string
  attributes?: string[]
}

export interface DatabaseEngineDefinition {
  id: string
  label: string
  host?: RegExp
  provider?: RegExp
  keys?: RegExp
}

type Entry = Record<string, string>

const parse = () => {
  const document = new DOMParser().parseFromString(architectureXml, 'application/xml')
  const layers = Array.from(document.querySelectorAll('layers > layer'))
    .map<LayerDefinition>((layer) => ({
      id: layer.getAttribute('id') as LayerId,
      label: layer.getAttribute('label') || '',
      order: Number(layer.getAttribute('order') || 0),
      scope: (layer.getAttribute('scope') === 'global' ? 'global' : 'inherited') as LayerScope,
      icon: layer.getAttribute('icon') || '',
      learn: layer.getAttribute('learn') || '',
      description: layer.textContent?.trim() || '',
    }))
    .sort((left, right) => left.order - right.order)

  const groups = Array.from(document.querySelectorAll('groups > group')).map<GroupDefinition>(
    (group) => ({
      id: group.getAttribute('id') || '',
      category: (group.getAttribute('category') || 'iis') as ChangeCategory,
      label: group.getAttribute('label') || '',
      paths: (group.getAttribute('path') || '').split(/\s+/).filter(Boolean),
      layer: (group.getAttribute('layer') as LayerId | null) ?? undefined,
      sub: group.getAttribute('sub') ?? undefined,
      parent: group.getAttribute('parent') ?? undefined,
      attributes: group.getAttribute('attributes')?.split(/\s+/).filter(Boolean),
    }),
  )

  const defaultCollections = new Map<string, Entry[]>()
  document.querySelectorAll('defaultCollections > collection').forEach((collection) => {
    defaultCollections.set(
      collection.getAttribute('path') || '',
      Array.from(collection.querySelectorAll(':scope > item')).map((item) =>
        Object.fromEntries(Array.from(item.attributes).map((a) => [a.name, a.value])),
      ),
    )
  })

  const ignoredCollections = new Set(
    Array.from(document.querySelectorAll('serverBaselineCollections > collection')).map(
      (collection) => collection.getAttribute('path') || '',
    ),
  )

  const valueDefaults = new Map<string, string>()
  document.querySelectorAll('valueDefaults > default').forEach((item) => {
    valueDefaults.set(
      `${item.getAttribute('path')}\u0000${item.getAttribute('name')}`,
      item.getAttribute('value') || '',
    )
  })

  const regex = (value: string | null) => (value ? new RegExp(value, 'i') : undefined)
  const engines = Array.from(document.querySelectorAll('databaseEngines > engine')).map<
    DatabaseEngineDefinition
  >((engine) => ({
    id: engine.getAttribute('id') || '',
    label: engine.getAttribute('label') || '',
    host: regex(engine.getAttribute('host')),
    provider: regex(engine.getAttribute('provider')),
    keys: regex(engine.getAttribute('keys')),
  }))

  return { layers, groups, defaultCollections, ignoredCollections, valueDefaults, engines }
}

let cached: ReturnType<typeof parse> | null = null
const reference = () => (cached ??= parse())

export const getLayers = () => reference().layers
export const getLayer = (id: LayerId) => reference().layers.find((layer) => layer.id === id)
export const getGroups = () => reference().groups
export const getDatabaseEngines = () => reference().engines

const underPath = (path: string, base: string) =>
  path === base || path.startsWith(`${base}/`)

/** Finds the most specific balloon group for a configuration path. */
export function findGroupMatch(
  path: string,
  attribute?: string,
): { group: GroupDefinition; base: string } | undefined {
  let best: { group: GroupDefinition; base: string } | undefined
  reference().groups.forEach((group) => {
    if (group.attributes && (!attribute || !group.attributes.includes(attribute))) return
    group.paths.forEach((base) => {
      if (underPath(path, base) && (!best || base.length > best.base.length)) {
        best = { group, base }
      }
    })
  })
  return best
}

export const findGroup = (path: string, attribute?: string) =>
  findGroupMatch(path, attribute)?.group

export function getGroup(id: string) {
  return reference().groups.find((group) => group.id === id)
}

/** True when a collection entry is one of the built-in IIS entries. */
export function isDefaultEntry(collectionPath: string, attrs: Entry) {
  const entries = reference().defaultCollections.get(collectionPath)
  return Boolean(
    entries?.some((entry) =>
      Object.entries(entry).every(
        ([key, value]) => attrs[key]?.toLowerCase() === value.toLowerCase(),
      ),
    ),
  )
}

export const hasDefaultCollection = (collectionPath: string) =>
  reference().defaultCollections.has(collectionPath)

/** Collections that stock IIS populates at server scope and that are not user decisions. */
export const isBaselineCollection = (collectionPath: string) =>
  reference().ignoredCollections.has(collectionPath)

export const getValueDefault = (path: string, attribute: string) =>
  reference().valueDefaults.get(`${path}\u0000${attribute}`)
