import type { XNode } from './types'

export const MASK = '******'

const SKIPPED_TAGS = new Set([
  'configSections',
  'handlers',
  'modules',
  'globalModules',
  'isapiFilters',
  'fastCgi',
  'httpCompression',
  'diskCache',
  'webdav',
  'mimeMap',
])

/** Child tags that are keyed collection entries rather than singleton sections. */
export const ITEM_TAGS = new Set([
  'add',
  'rule',
  'error',
  'webFarm',
  'server',
  'filteringRule',
  'rewriteMap',
  'preCondition',
  'environmentVariable',
  'application',
  'virtualDirectory',
  'binding',
])

const SECRET_ATTRIBUTE =
  /^(password|pwd|secret|apikey|keyvalue|privatekey|.*token|.*secret|.*password)$/i

const SECRET_KEY = /(password|pwd|secret|token|apikey|api[-_]?key|accountkey|sharedaccess|privatekey)/i

/** Replaces credential segments in a connection string while keeping the topology readable. */
export const maskConnectionString = (value: string) =>
  value.replace(
    /((?:password|pwd|access token|accountkey|sharedaccesskey|secret|apikey|api key)\s*=\s*)("[^"]*"|'[^']*'|[^;"']*)/gi,
    `$1${MASK}`,
  )

const sanitizeAttributes = (element: Element) => {
  const attrs: Record<string, string> = {}
  const isKeyedSetting =
    element.tagName === 'add' &&
    element.hasAttribute('key') &&
    SECRET_KEY.test(element.getAttribute('key') ?? '')

  Array.from(element.attributes).forEach((attribute) => {
    if (/^xmlns(:|$)/.test(attribute.name)) return
    let value = attribute.value
    if (SECRET_ATTRIBUTE.test(attribute.name) && value !== '') {
      value = MASK
    } else if (/connectionstring$/i.test(attribute.name)) {
      value = maskConnectionString(value)
    } else if (isKeyedSetting && attribute.name === 'value') {
      value = MASK
    }
    attrs[attribute.name] = value
  })
  return attrs
}

export function toXNode(element: Element): XNode {
  return {
    name: element.tagName,
    attrs: sanitizeAttributes(element),
    children: (Array.from(element.children) as Element[])
      .filter((child) => !SKIPPED_TAGS.has(child.tagName))
      .map(toXNode),
  }
}

export const isSkippedTag = (name: string) => SKIPPED_TAGS.has(name)

const KEY_ATTRIBUTES = [
  'name',
  'fileExtension',
  'verb',
  'segment',
  'sequence',
  'ipAddress',
  'path',
  'key',
  'address',
  'value',
  'input',
  'logFieldName',
  'protocol',
  'header',
  'url',
  'users',
]

/** Stable identity of a collection entry, independent of the tag that declares it. */
export function entryKey(attrs: Record<string, string>) {
  if (attrs.statusCode !== undefined) {
    return `${attrs.statusCode}/${attrs.subStatusCode ?? ''}`.toLowerCase()
  }
  if (attrs.ipAddress !== undefined) {
    return `${attrs.ipAddress}/${attrs.subnetMask ?? ''}`.toLowerCase()
  }
  if (attrs.domainName !== undefined) return `domain:${attrs.domainName}`.toLowerCase()
  if (attrs.accessType !== undefined) {
    return `${attrs.accessType}:${attrs.users ?? ''}:${attrs.roles ?? ''}:${attrs.verbs ?? ''}`.toLowerCase()
  }
  const keyAttribute = KEY_ATTRIBUTES.find((candidate) => attrs[candidate] !== undefined)
  if (keyAttribute) return `${keyAttribute}:${attrs[keyAttribute]}`.toLowerCase()
  return Object.entries(attrs)
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('|')
    .toLowerCase()
}

export const attrOf = (node: XNode | null | undefined, name: string) =>
  node?.attrs[name]

export const xChildren = (node: XNode | null | undefined, name: string) =>
  node?.children.filter((child) => child.name === name) ?? []

export const xChild = (node: XNode | null | undefined, name: string) =>
  node?.children.find((child) => child.name === name)

export const xPath = (node: XNode | null | undefined, ...names: string[]) =>
  names.reduce<XNode | undefined>(
    (current, name) => xChild(current, name),
    node ?? undefined,
  )
