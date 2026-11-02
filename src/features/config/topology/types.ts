export interface XNode {
  name: string
  attrs: Record<string, string>
  children: XNode[]
}

/** Where a configuration value was declared. */
export type Origin =
  | 'server'
  | 'site'
  | 'app'
  | 'dir'
  | 'web.config'
  | 'pool'
  | 'defaults'

export interface ScopeBlock {
  path: string
  root: XNode
}

/**
 * Sanitized, parse-time snapshot of one IIS configuration file. It keeps only
 * the structure needed for the architecture diagram; secrets are masked before
 * they are stored and bulky lists such as handlers and modules are omitted.
 */
export interface ConfigModel {
  scopes: ScopeBlock[]
  pools: XNode[]
  poolDefaults: XNode | null
  sites: XNode[]
  siteDefaults: XNode | null
  applicationDefaults: XNode | null
  virtualDirectoryDefaults: XNode | null
  webFarms: XNode | null
  globalModules: string[]
}
