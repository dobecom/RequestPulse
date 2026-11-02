import type {
  ConfigApplicationPool,
  ConfigInventory,
  ConfigKind,
  ConfigSetting,
  ConfigSite,
  LogInputKind,
  ParsedLogFile,
} from '../logs/types'
import { isSkippedTag, toXNode } from './topology/xnode'
import type { ConfigModel, ScopeBlock, XNode } from './topology/types'

const normalizeScopePath = (value: string) =>
  value
    .trim()
    .replace(/\\/g, '/')
    .replace(/^MACHINE\/WEBROOT\/APPHOST\/?/i, '')
    .replace(/^\.$/, '')
    .replace(/^\/+|\/+$/g, '')

const elementChildren = (element: Element) =>
  Array.from(element.children) as Element[]

const directChild = (element: Element, name: string) =>
  elementChildren(element).find((child) => child.tagName === name)

const directChildren = (element: Element, name: string) =>
  elementChildren(element).filter((child) => child.tagName === name)

const parseXml = (text: string, fileName: string) => {
  const document = new DOMParser().parseFromString(text, 'application/xml')
  const parserError = document.querySelector('parsererror')
  if (parserError || document.documentElement.tagName !== 'configuration') {
    throw new Error(`${fileName} is not a valid IIS configuration XML file.`)
  }
  return document
}

const detectConfigKind = (
  document: XMLDocument,
  fileName: string,
  expected?: LogInputKind,
): ConfigKind => {
  const normalizedName = fileName.toLowerCase()
  const hasApplicationHostSections =
    document.querySelector('system\\.applicationHost') !== null ||
    document.querySelector('applicationPools, sites') !== null

  if (expected === 'config-applicationhost') return 'config-applicationhost'
  if (expected === 'config-web') return 'config-web'
  if (hasApplicationHostSections || normalizedName === 'applicationhost.config') {
    return 'config-applicationhost'
  }
  if (normalizedName === 'web.config' || normalizedName.endsWith('.web.config')) {
    return 'config-web'
  }
  if (expected === 'config') return 'config-web'
  throw new Error(
    `${fileName} is not recognized as applicationHost.config or web.config.`,
  )
}

const segmentLabel = (element: Element) => {
  const identity = ['name', 'path', 'id'].find((name) => element.hasAttribute(name))
  return identity
    ? `${element.tagName}[${identity}=${element.getAttribute(identity)}]`
    : element.tagName
}

const collectSettings = (document: XMLDocument) => {
  const settings: ConfigSetting[] = []

  const visit = (
    element: Element,
    path: string[],
    displayPath: string[],
    scope: string,
  ) => {
    if (element.tagName === 'configSections') return
    if (element.tagName === 'location') {
      const locationScope = element.getAttribute('path') || '.'
      elementChildren(element).forEach((child) =>
        visit(child, [], [], locationScope),
      )
      return
    }

    const nextPath = [...path, element.tagName]
    const nextDisplayPath = [...displayPath, segmentLabel(element)]
    Array.from(element.attributes).forEach((attribute) => {
      settings.push({
        id: `${scope}:${nextDisplayPath.join('/')}:@${attribute.name}`,
        path: nextPath.join('/'),
        displayPath: nextDisplayPath.join('/'),
        scope,
        attribute: attribute.name,
        value: attribute.value,
      })
    })
    elementChildren(element).forEach((child) =>
      visit(child, nextPath, nextDisplayPath, scope),
    )
  }

  elementChildren(document.documentElement).forEach((child) =>
    visit(child, [], [], '.'),
  )
  return settings
}

const applicationPoolInventory = (document: XMLDocument): ConfigApplicationPool[] => {
  const pools = document.querySelector(
    'system\\.applicationHost > applicationPools',
  )
  if (!pools) return []

  return directChildren(pools, 'add').map((pool) => ({
    name: pool.getAttribute('name') || '(unnamed)',
    runtime: pool.getAttribute('managedRuntimeVersion') || 'inherited',
    pipeline: pool.getAttribute('managedPipelineMode') || 'inherited',
    startMode: pool.getAttribute('startMode') || 'inherited',
  }))
}

const siteInventory = (document: XMLDocument): ConfigSite[] => {
  const sites = document.querySelector('system\\.applicationHost > sites')
  if (!sites) return []

  return directChildren(sites, 'site').map((site) => {
    const applications = directChildren(site, 'application')
    const bindingsElement = directChild(site, 'bindings')
    const bindingElements = bindingsElement
      ? directChildren(bindingsElement, 'binding')
      : []
    const bindings = bindingElements.map((binding) => {
      const protocol = binding.getAttribute('protocol') || 'unknown'
      const information = binding.getAttribute('bindingInformation') || ''
      return `${protocol} ${information}`.trim()
    })
    const virtualDirectories = applications.reduce(
      (count, application) =>
        count + directChildren(application, 'virtualDirectory').length,
      0,
    )
    const rootApplication = applications.find(
      (application) => application.getAttribute('path') === '/',
    )

    return {
      name: site.getAttribute('name') || '(unnamed)',
      id: site.getAttribute('id') || '—',
      applicationPool:
        rootApplication?.getAttribute('applicationPool') || 'inherited',
      bindings,
      applications: applications.length,
      virtualDirectories,
      ftp:
        bindingElements.some(
          (binding) => binding.getAttribute('protocol')?.toLowerCase() === 'ftp',
        ) || site.querySelector('ftpServer') !== null,
    }
  })
}

const buildInventory = (document: XMLDocument): ConfigInventory => {
  const applicationPools = applicationPoolInventory(document)
  const sites = siteInventory(document)
  const proxy = document.querySelector('system\\.webServer > proxy')
  const globalModules = document.querySelector(
    'system\\.webServer > globalModules',
  )

  return {
    applicationPools,
    sites,
    applications: sites.reduce((sum, site) => sum + site.applications, 0),
    virtualDirectories: sites.reduce(
      (sum, site) => sum + site.virtualDirectories,
      0,
    ),
    bindings: sites.reduce((sum, site) => sum + site.bindings.length, 0),
    ftpSites: sites.filter((site) => site.ftp).length,
    arrEnabled: proxy?.getAttribute('enabled')?.toLowerCase() === 'true',
    globalModules: globalModules
      ? directChildren(globalModules, 'add').length
      : 0,
  }
}

const buildModel = (document: XMLDocument): ConfigModel => {
  const root = document.documentElement
  const serverChildren: XNode[] = []
  const locationBlocks: ScopeBlock[] = []
  const applicationHost = directChild(root, 'system.applicationHost')
  const poolsElement = applicationHost && directChild(applicationHost, 'applicationPools')
  const sitesElement = applicationHost && directChild(applicationHost, 'sites')
  const webFarmsElement = directChild(root, 'webFarms')

  elementChildren(root).forEach((child) => {
    if (child.tagName === 'location') {
      locationBlocks.push({
        path: normalizeScopePath(child.getAttribute('path') ?? ''),
        root: {
          name: 'configuration',
          attrs: {},
          children: elementChildren(child)
            .filter((node) => !isSkippedTag(node.tagName))
            .map(toXNode),
        },
      })
      return
    }
    if (
      child.tagName === 'system.applicationHost' ||
      child.tagName === 'webFarms' ||
      isSkippedTag(child.tagName)
    ) {
      return
    }
    serverChildren.push(toXNode(child))
  })

  const optionalNode = (parent: Element | null | undefined, name: string) => {
    const element = parent && directChild(parent, name)
    return element ? toXNode(element) : null
  }

  const globalModulesElement = document.querySelector(
    'system\\.webServer > globalModules',
  )

  return {
    scopes: [
      {
        path: '',
        root: { name: 'configuration', attrs: {}, children: serverChildren },
      },
      ...locationBlocks,
    ],
    pools: poolsElement ? directChildren(poolsElement, 'add').map(toXNode) : [],
    poolDefaults: optionalNode(poolsElement, 'applicationPoolDefaults'),
    sites: sitesElement ? directChildren(sitesElement, 'site').map(toXNode) : [],
    siteDefaults: optionalNode(sitesElement, 'siteDefaults'),
    applicationDefaults: optionalNode(sitesElement, 'applicationDefaults'),
    virtualDirectoryDefaults: optionalNode(sitesElement, 'virtualDirectoryDefaults'),
    webFarms: webFarmsElement ? toXNode(webFarmsElement) : null,
    globalModules: globalModulesElement
      ? directChildren(globalModulesElement, 'add').map(
          (module) => module.getAttribute('name') || '',
        )
      : [],
  }
}

export function parseConfigText(
  text: string,
  fileName: string,
  size = text.length,
  expected?: LogInputKind,
): ParsedLogFile {
  const document = parseXml(text.replace(/^\uFEFF/, ''), fileName)
  const kind = detectConfigKind(document, fileName, expected)
  const settings = collectSettings(document)

  return {
    id: `${kind}:${fileName}:${size}:${settings.length}`,
    name: fileName,
    kind,
    fields: [...new Set(settings.map((setting) => setting.attribute))],
    rows: [],
    warnings: [],
    size,
    config: {
      settings,
      model: buildModel(document),
      inventory:
        kind === 'config-applicationhost'
          ? buildInventory(document)
          : {
              applicationPools: [],
              sites: [],
              applications: 0,
              virtualDirectories: 0,
              bindings: 0,
              ftpSites: 0,
              arrEnabled: false,
              globalModules: 0,
            },
    },
  }
}
