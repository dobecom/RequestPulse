import { findReferenceOption, matchRiskRule, matchesDefault } from '../configAnalysis'
import type { FindingSeverity } from '../configAnalysis'
import {
  findGroup,
  findGroupMatch,
  getGroups,
  getValueDefault,
  hasDefaultCollection,
  isBaselineCollection,
  isDefaultEntry,
} from './reference'
import type { ChangeCategory, LayerId } from './reference'
import type { Origin, XNode } from './types'
import { ITEM_TAGS, entryKey, xChild, xChildren } from './xnode'

export type ChangeKind = 'value' | 'entry' | 'removed' | 'default'

export interface Change {
  id: string
  category: ChangeCategory
  groupId: string
  layer?: LayerId
  sub?: string
  path: string
  label: string
  value: string
  defaultValue?: string
  origin: Origin
  scope: string
  kind: ChangeKind
  detail?: string[]
  severity?: FindingSeverity
  note?: string
  disabled?: boolean
  collection?: string
  key?: string
  /** Applied while resolving scopes but never listed, such as a clear that precedes new entries. */
  silent?: boolean
}

export interface ScopeInfo {
  origin: Origin
  scope: string
}

interface VisitOptions {
  skipAttributes?: ReadonlySet<string>
  skipChildren?: ReadonlySet<string>
}

export const POOL_PATH = 'system.applicationHost/applicationPools/add'
export const SITE_PATH = 'system.applicationHost/sites/site'
export const APPLICATION_PATH = `${SITE_PATH}/application`
export const VDIR_PATH = `${APPLICATION_PATH}/virtualDirectory`

const POOL_SKIP = { skipAttributes: new Set(['name']) }
const SITE_SKIP = {
  skipAttributes: new Set(['name', 'id']),
  skipChildren: new Set(['bindings', 'application', 'applicationDefaults', 'virtualDirectoryDefaults']),
}
const APPLICATION_SKIP = {
  skipAttributes: new Set(['path', 'applicationPool']),
  skipChildren: new Set(['virtualDirectory']),
}
const VDIR_SKIP = { skipAttributes: new Set(['path', 'physicalPath']) }

const RULE_TYPES: Record<string, string> = {
  Permanent: '301',
  Found: '302',
  SeeOther: '303',
  Temporary: '307',
}

const isTrue = (value: string | undefined, fallback = false) =>
  value === undefined ? fallback : value.toLowerCase() === 'true'

const joinAttributes = (attrs: Record<string, string>, skip: string[] = []) =>
  Object.entries(attrs)
    .filter(([key]) => !skip.includes(key))
    .map(([key, value]) => `${key}=${value}`)
    .join(', ')

function describeAction(action: XNode | undefined) {
  const type = action?.attrs.type ?? 'None'
  const url = action?.attrs.url ?? ''
  if (type === 'Rewrite') return `Rewrite to ${url || '(unchanged)'}`
  if (type === 'Redirect') {
    const kind = action?.attrs.redirectType ?? 'Permanent'
    return `Redirect ${RULE_TYPES[kind] ?? kind} to ${url}`
  }
  if (type === 'CustomResponse') {
    return `Respond ${action?.attrs.statusCode ?? ''} ${action?.attrs.statusReason ?? ''}`.trim()
  }
  if (type === 'AbortRequest') return 'Abort the connection'
  return 'No action'
}

function describeRule(node: XNode, outbound: boolean) {
  const match = xChild(node, 'match')
  const pattern = match?.attrs.url ?? match?.attrs.serverVariable ?? match?.attrs.filterByTags ?? ''
  const negate = isTrue(match?.attrs.negate) ? 'not ' : ''
  const syntax = node.attrs.patternSyntax && node.attrs.patternSyntax !== 'ECMAScript'
    ? ` [${node.attrs.patternSyntax}]`
    : ''
  const action = xChild(node, 'action')
  const detail: string[] = []

  const conditions = xChild(node, 'conditions')
  xChildren(conditions, 'add').forEach((condition) => {
    const operator = isTrue(condition.attrs.negate) ? 'does not match' : 'matches'
    detail.push(`If ${condition.attrs.input ?? ''} ${operator} ${condition.attrs.pattern ?? ''}`)
  })
  if (conditions && xChildren(conditions, 'add').length > 1) {
    detail.unshift(
      conditions.attrs.logicalGrouping === 'MatchAny'
        ? 'Any condition may match'
        : 'All conditions must match',
    )
  }
  xChildren(xChild(node, 'serverVariables'), 'set').forEach((set) =>
    detail.push(`Set ${set.attrs.name ?? ''} = ${set.attrs.value ?? ''}`),
  )
  if (isTrue(node.attrs.stopProcessing)) detail.push('Stops rule processing')
  if (action?.attrs.appendQueryString === 'false') detail.push('Query string is not appended')

  const summary = outbound && action?.attrs.type === 'Rewrite'
    ? `Rewrite response to ${action.attrs.value ?? ''}`
    : describeAction(action)

  return {
    label: node.attrs.name ?? 'Unnamed rule',
    value: `${negate}${pattern}${syntax} → ${summary}`,
    detail,
    disabled: node.attrs.enabled !== undefined && !isTrue(node.attrs.enabled),
  }
}

function describeFilteringRule(node: XNode) {
  const deny = xChildren(xChild(node, 'denyStrings'), 'add').map((add) => add.attrs.string)
  const scans = [
    isTrue(node.attrs.scanUrl, true) ? 'URL' : '',
    isTrue(node.attrs.scanQueryString) ? 'query string' : '',
    ...xChildren(xChild(node, 'scanHeaders'), 'add').map(
      (add) => `header ${add.attrs.requestHeader}`,
    ),
  ].filter(Boolean)
  const applies = xChildren(xChild(node, 'appliesTo'), 'add').map((add) => add.attrs.fileExtension)

  return {
    label: node.attrs.name ?? 'Filtering rule',
    value: `Deny ${deny.join(', ') || '(no strings)'} in ${scans.join(', ') || 'URL'}`,
    detail: applies.length ? [`Applies to ${applies.join(', ')}`] : undefined,
  }
}

const ipSecurityValue = (attrs: Record<string, string>) => {
  if (attrs.domainName) return attrs.domainName
  const mask = attrs.subnetMask && attrs.subnetMask !== '255.255.255.255' ? `/${attrs.subnetMask}` : ''
  return `${attrs.ipAddress ?? ''}${mask}`
}

/** Turns a collection entry into a readable label, value and optional detail lines. */
export interface EntryDescription {
  label: string
  value: string
  detail?: string[]
  disabled?: boolean
}

export function describeEntry(collection: string, node: XNode): EntryDescription {
  const attrs = node.attrs
  const tail = collection.split('/').slice(-1)[0]

  if (/\/rewrite\/(globalRules|rules)$/.test(collection)) return describeRule(node, false)
  if (collection.endsWith('/rewrite/outboundRules')) return describeRule(node, true)
  if (collection.endsWith('/rewriteMaps')) {
    const mappings = xChildren(node, 'add')
    return {
      label: attrs.name ?? 'Rewrite map',
      value: `${mappings.length} mapping${mappings.length === 1 ? '' : 's'}`,
      detail: mappings.slice(0, 5).map((add) => `${add.attrs.key} → ${add.attrs.value}`),
    }
  }
  if (tail === 'filteringRules') return describeFilteringRule(node)
  if (tail === 'fileExtensions') {
    return { label: attrs.fileExtension ?? '(extension)', value: isTrue(attrs.allowed, true) ? 'Allowed' : 'Denied' }
  }
  if (tail === 'verbs') {
    return { label: attrs.verb ?? '(verb)', value: isTrue(attrs.allowed, true) ? 'Allowed' : 'Denied' }
  }
  if (tail === 'hiddenSegments') return { label: 'Hidden segment', value: attrs.segment ?? '' }
  if (tail === 'denyUrlSequences' || tail === 'denyQueryStringSequences') {
    return { label: 'Denied sequence', value: attrs.sequence ?? '' }
  }
  if (tail === 'alwaysAllowedUrls') return { label: 'Always allowed URL', value: attrs.url ?? '' }
  if (tail === 'alwaysAllowedQueryStrings') {
    return { label: 'Always allowed query string', value: attrs.queryString ?? '' }
  }
  if (tail === 'headerLimits') {
    return { label: attrs.header ?? 'Header', value: `${attrs.sizeLimit ?? ''} bytes` }
  }
  if (collection.endsWith('/ipSecurity')) {
    return {
      label: isTrue(attrs.allowed, true) ? 'Allow' : 'Deny',
      value: ipSecurityValue(attrs),
    }
  }
  if (tail === 'authorization') {
    const subject = attrs.users ? `users ${attrs.users}` : attrs.roles ? `roles ${attrs.roles}` : ''
    return {
      label: attrs.accessType ?? 'Rule',
      value: [subject, attrs.verbs ? `verbs ${attrs.verbs}` : ''].filter(Boolean).join(' · '),
    }
  }
  if (collection.endsWith('/defaultDocument/files')) {
    return { label: 'Default document', value: attrs.value ?? '' }
  }
  if (collection.endsWith('/httpErrors')) {
    const sub = attrs.subStatusCode && attrs.subStatusCode !== '-1' ? `.${attrs.subStatusCode}` : ''
    return {
      label: `HTTP ${attrs.statusCode ?? ''}${sub}`,
      value: `${attrs.responseMode ?? 'File'} · ${attrs.path ?? ''}`,
    }
  }
  if (tail === 'customHeaders' || tail === 'redirectHeaders') {
    const label = tail === 'customHeaders' ? 'Response header' : 'Redirect header'
    return {
      label: node.name === 'remove' ? `${label} ${attrs.name ?? ''}`.trim() : label,
      value: node.name === 'remove' ? 'Removed' : `${attrs.name}: ${attrs.value}`,
    }
  }
  if (collection.endsWith('/periodicRestart/schedule')) {
    return { label: 'Scheduled restart', value: attrs.value ?? '' }
  }
  if (collection.endsWith('/webFarm') && node.name === 'server') {
    const routing = xChild(node, 'applicationRequestRouting')
    return {
      label: attrs.address ?? 'server',
      value: [
        isTrue(attrs.enabled, true) ? 'Enabled' : 'Disabled',
        `weight ${routing?.attrs.weight ?? 100}`,
        routing?.attrs.httpPort ? `HTTP ${routing.attrs.httpPort}` : '',
        routing?.attrs.httpsPort ? `HTTPS ${routing.attrs.httpsPort}` : '',
      ]
        .filter(Boolean)
        .join(' · '),
    }
  }
  if (collection === 'appSettings') return { label: attrs.key ?? '(key)', value: attrs.value ?? '' }
  if (tail === 'customFields') {
    return {
      label: 'Custom log field',
      value: `${attrs.logFieldName ?? ''} ← ${attrs.sourceType ?? ''}: ${attrs.sourceName ?? ''}`,
    }
  }
  if (tail === 'allowedServerVariables') {
    return { label: 'Allowed server variable', value: attrs.name ?? '' }
  }
  if (node.name === 'preCondition') {
    const checks = xChildren(node, 'add').map(
      (add) => `${add.attrs.input ?? ''} matches ${add.attrs.pattern ?? ''}`,
    )
    return { label: `Precondition ${attrs.name ?? ''}`, value: checks.join('; ') || 'always' }
  }
  if (collection.endsWith('/traceFailedRequests')) {
    const failure = xChild(node, 'failureDefinitions')
    const areas = xChildren(xChild(node, 'traceAreas'), 'add').map((area) => area.attrs.provider)
    return {
      label: `Rule ${attrs.path ?? '*'}`,
      value: [
        failure?.attrs.statusCodes ? `status ${failure.attrs.statusCodes}` : '',
        failure?.attrs.timeTaken ? `slower than ${failure.attrs.timeTaken}` : '',
        areas.length ? `areas ${areas.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join(' · ') || 'all requests',
    }
  }
  if (collection === 'connectionStrings') {
    return {
      label: attrs.name ?? '(connection)',
      value: [attrs.providerName, attrs.connectionString].filter(Boolean).join(' · '),
    }
  }

  const identity = ['name', 'key', 'path', 'value', 'segment'].find((key) => attrs[key])
  const children = node.children
    .map((child) => `${child.name}(${joinAttributes(child.attrs)})`)
    .join(' ')
  return {
    label: identity ? attrs[identity] : node.name,
    value: [joinAttributes(attrs, identity ? [identity] : []), children].filter(Boolean).join(' ') || '(entry)',
  }
}

const isPasswordAttribute = (attribute: string) => /password$/i.test(attribute)

function pushAttributes(
  node: XNode,
  path: string,
  info: ScopeInfo,
  out: Change[],
  skip?: ReadonlySet<string>,
) {
  Object.entries(node.attrs).forEach(([attribute, value]) => {
    if (skip?.has(attribute)) return
    const option = findReferenceOption(path, attribute)
    if (option?.isKey || /^lock/i.test(attribute)) return
    const match = findGroupMatch(path, attribute)
    if (!match) return
    const { group, base } = match
    const element = path.length > base.length ? path.slice(base.length + 1) : ''

    if (isPasswordAttribute(attribute)) {
      const identity = node.attrs.identityType
      if (value === '' || (path.endsWith('/processModel') && identity && identity !== 'SpecificUser')) return
      out.push({
        id: `${path}|@${attribute}`,
        category: group.category,
        groupId: group.id,
        layer: group.layer,
        sub: group.sub,
        path,
        label: element ? `${element.replace(/\//g, ' › ')} · ${attribute}` : attribute,
        value,
        origin: info.origin,
        scope: info.scope,
        kind: 'value',
      })
      return
    }

    const override = getValueDefault(path, attribute)
    const defaultValue = override ?? (option ? option.defaultValue ?? '' : undefined)
    const equal =
      defaultValue !== undefined &&
      (override !== undefined || !option
        ? value.trim().toLowerCase() === defaultValue.trim().toLowerCase()
        : matchesDefault(option, value))
    const risk = equal ? undefined : matchRiskRule(path, attribute, value)

    out.push({
      id: `${path}|@${attribute}`,
      category: group.category,
      groupId: group.id,
      layer: group.layer,
      sub: group.sub,
      path,
      label: element ? `${element.replace(/\//g, ' › ')} · ${attribute}` : attribute,
      value: attribute === 'managedRuntimeVersion' && value === '' ? 'No Managed Code' : value,
      defaultValue,
      origin: info.origin,
      scope: info.scope,
      kind: equal || (defaultValue === undefined && value === '') ? 'default' : 'value',
      severity: risk?.severity,
      note: risk?.title,
    })
  })
}

function visit(
  node: XNode,
  path: string,
  info: ScopeInfo,
  out: Change[],
  options: VisitOptions = {},
) {
  if (!findGroup(path)) return
  pushAttributes(node, path, info, out, options.skipAttributes)

  node.children.forEach((child, childIndex) => {
    if (options.skipChildren?.has(child.name)) return

    if (child.name === 'clear' || child.name === 'remove') {
      const group = findGroup(path)
      if (!group) return
      const key = child.name === 'clear' ? '*' : entryKey(child.attrs)
      const description = child.name === 'clear' ? undefined : describeEntry(path, child)
      const refills =
        child.name === 'clear' &&
        node.children.slice(childIndex + 1).some((sibling) => ITEM_TAGS.has(sibling.name))
      const baseline =
        info.origin === 'server' && (hasDefaultCollection(path) || isBaselineCollection(path))
      out.push({
        id: `rm|${path}|${key}`,
        category: group.category,
        groupId: group.id,
        layer: group.layer,
        sub: group.sub,
        path,
        label: child.name === 'clear' ? 'Inherited entries' : `Removed: ${description?.label ?? key}`,
        value:
          child.name === 'clear'
            ? 'Cleared'
            : description?.value && !/(^|:\s*)undefined$/.test(description.value)
              ? description.value
              : 'Removed',
        origin: info.origin,
        scope: info.scope,
        kind: 'removed',
        collection: path,
        key,
        silent: refills || (baseline && child.name === 'clear'),
      })
      return
    }

    if (ITEM_TAGS.has(child.name)) {
      const group = findGroup(path)
      if (!group) return
      const key = entryKey(child.attrs)
      const builtIn =
        isDefaultEntry(path, child.attrs) ||
        (info.origin === 'server' && isBaselineCollection(path))
      const description: EntryDescription = builtIn
        ? { label: key, value: '' }
        : describeEntry(path, child)
      out.push({
        id: `${path}|entry:${key}`,
        category: group.category,
        groupId: group.id,
        layer: group.layer,
        sub: group.sub,
        path,
        label: description.label,
        value: description.value,
        detail: description.detail,
        disabled: description.disabled,
        origin: info.origin,
        scope: info.scope,
        kind: builtIn ? 'default' : 'entry',
        collection: path,
        key,
      })
      return
    }

    visit(child, `${path}/${child.name}`, info, out)
  })
}

export function diffScope(root: XNode, info: ScopeInfo): Change[] {
  const out: Change[] = []
  root.children.forEach((child) => visit(child, child.name, info, out))
  return out
}

export const diffPool = (node: XNode, info: ScopeInfo) => {
  const out: Change[] = []
  visit(node, POOL_PATH, info, out, POOL_SKIP)
  return out
}

export const diffSite = (node: XNode, info: ScopeInfo) => {
  const out: Change[] = []
  visit(node, SITE_PATH, info, out, SITE_SKIP)
  return out
}

export const diffApplication = (node: XNode, info: ScopeInfo) => {
  const out: Change[] = []
  visit(node, APPLICATION_PATH, info, out, APPLICATION_SKIP)
  return out
}

export const diffVirtualDirectory = (node: XNode, info: ScopeInfo) => {
  const out: Change[] = []
  visit(node, VDIR_PATH, info, out, VDIR_SKIP)
  return out
}

/** Diffs an arbitrary node placed at a schema path, such as a server farm. */
export const diffAt = (node: XNode, path: string, info: ScopeInfo, options?: VisitOptions) => {
  const out: Change[] = []
  visit(node, path, info, out, options)
  return out
}

const categoryOrder: Record<ChangeCategory, number> = { pool: 0, aspnet: 1, iis: 2 }

/** Orders changes by balloon category, group order and label. */
export function sortChanges(changes: Change[]): Change[] {
  const groupOrder = new Map(getGroups().map((group, index) => [group.id, index]))
  return [...changes].sort(
    (left, right) =>
      categoryOrder[left.category] - categoryOrder[right.category] ||
      (groupOrder.get(left.groupId) ?? 0) - (groupOrder.get(right.groupId) ?? 0) ||
      left.label.localeCompare(right.label, undefined, { numeric: true }),
  )
}

/**
 * Applies scopes in order. A later scope overrides the same setting or entry, a
 * remove deletes the inherited entry, and clear deletes the inherited collection.
 * Values that equal the schema default are dropped from the result.
 */
export function resolveChanges(layers: Change[][]): Change[] {
  const effective = new Map<string, Change>()

  layers.flat().forEach((change) => {
    if (change.kind === 'removed') {
      effective.forEach((existing, id) => {
        const sameCollection = existing.collection === change.collection
        if (sameCollection && (change.key === '*' || existing.key === change.key)) {
          if (existing.kind !== 'removed') effective.delete(id)
        }
      })
      effective.set(change.id, change)
      return
    }
    if (change.kind === 'entry' || change.kind === 'default') {
      if (change.collection) effective.delete(`rm|${change.collection}|${change.key}`)
    }
    effective.set(change.id, change)
  })

  return sortChanges(
    [...effective.values()].filter((change) => change.kind !== 'default' && !change.silent),
  )
}

export interface ChainBlock extends ScopeInfo {
  root: XNode
}

/** Last explicit value of an attribute along a scope chain. */
export function effectiveAttribute(
  chain: ChainBlock[],
  path: string,
  attribute: string,
): string | undefined {
  const names = path.split('/')
  let value: string | undefined
  chain.forEach((block) => {
    let node: XNode | undefined = block.root
    names.forEach((name) => {
      node = node && xChild(node, name)
    })
    if (node?.attrs[attribute] !== undefined) value = node.attrs[attribute]
  })
  return value
}

/** Entries of a collection along a scope chain, honouring remove and clear. */
export function effectiveEntries(chain: ChainBlock[], path: string): XNode[] {
  const names = path.split('/')
  let entries: XNode[] = []
  chain.forEach((block) => {
    let node: XNode | undefined = block.root
    names.forEach((name) => {
      node = node && xChild(node, name)
    })
    node?.children.forEach((child) => {
      if (child.name === 'clear') entries = []
      else if (child.name === 'remove') {
        const key = entryKey(child.attrs)
        entries = entries.filter((entry) => entryKey(entry.attrs) !== key)
      } else if (ITEM_TAGS.has(child.name)) {
        const key = entryKey(child.attrs)
        entries = [...entries.filter((entry) => entryKey(entry.attrs) !== key), child]
      }
    })
  })
  return entries
}
