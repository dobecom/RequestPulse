import { getDatabaseEngines } from './reference'

export interface DatabaseTarget {
  engineId: string
  engineLabel: string
  host: string
  port?: string
  database?: string
  auth: string
  local: boolean
}

const LOCAL_HOSTS = /^(\(local\)|local|\.|localhost|127\.0\.0\.1|::1|\(localdb\).*)$/i

const SERVER_KEYS = [
  'data source',
  'server',
  'address',
  'addr',
  'network address',
  'host',
  'datasource',
  'dbq',
]
const DATABASE_KEYS = ['initial catalog', 'database', 'databasename', 'attachdbfilename']

/** Splits key=value pairs while keeping quoted values and Oracle descriptors intact. */
function pairs(connectionString: string) {
  const result = new Map<string, string>()
  let depth = 0
  let quote = ''
  let current = ''
  const flush = () => {
    const index = current.indexOf('=')
    if (index > 0) {
      const key = current.slice(0, index).trim().toLowerCase()
      const value = current.slice(index + 1).trim().replace(/^["']|["']$/g, '')
      if (!result.has(key)) result.set(key, value)
    }
    current = ''
  }

  for (const character of connectionString) {
    if (quote) {
      if (character === quote) quote = ''
      current += character
    } else if (character === '"' || character === "'") {
      quote = character
      current += character
    } else if (character === '(') {
      depth += 1
      current += character
    } else if (character === ')') {
      depth = Math.max(0, depth - 1)
      current += character
    } else if (character === ';' && depth === 0) {
      flush()
    } else {
      current += character
    }
  }
  flush()
  return result
}

function detectEngine(provider: string, host: string, text: string) {
  const engines = getDatabaseEngines()
  return (
    engines.find((engine) => engine.host?.test(host)) ??
    engines.find((engine) => provider && engine.provider?.test(provider)) ??
    engines.find((engine) => engine.keys?.test(text)) ??
    engines[engines.length - 1]
  )
}

function splitHostPort(raw: string) {
  let value = raw.trim().replace(/^(tcp|np|lpc|admin):/i, '')
  let port: string | undefined

  const comma = /^(.*?),\s*(\d+)$/.exec(value)
  if (comma) {
    value = comma[1]
    port = comma[2]
  } else {
    const colon = /^([^:\\/]+):(\d+)$/.exec(value)
    if (colon) {
      value = colon[1]
      port = colon[2]
    }
  }
  return { host: value.replace(/^\\\\/, ''), port }
}

const DEFAULT_PORTS: Record<string, string> = {
  mssql: '1433',
  'azure-sql': '1433',
  mysql: '3306',
  postgres: '5432',
  oracle: '1521',
  redis: '6379',
  state: '42424',
}

/** Well-known port used when a connection string omits one. */
export const defaultDatabasePort = (engineId: string) => DEFAULT_PORTS[engineId] ?? ''

function oracleTarget(descriptor: string) {
  if (!/\(\s*(description|address)\s*=/i.test(descriptor)) return null
  const host = /host\s*=\s*([^)\s]+)/i.exec(descriptor)?.[1]
  const port = /port\s*=\s*(\d+)/i.exec(descriptor)?.[1]
  const service = /(?:service_name|sid)\s*=\s*([^)\s]+)/i.exec(descriptor)?.[1]
  return host ? { host, port, database: service } : null
}

function authMode(entries: Map<string, string>) {
  const integrated = entries.get('integrated security') ?? entries.get('trusted_connection')
  if (integrated && /^(sspi|true|yes)$/i.test(integrated)) return 'Windows integrated'
  const authentication = entries.get('authentication')
  if (authentication && /active directory|entra/i.test(authentication)) return 'Microsoft Entra ID'
  if (authentication && /managed identity/i.test(authentication)) return 'Managed identity'
  if (
    ['user id', 'uid', 'user', 'username', 'user name'].some((key) => entries.has(key)) ||
    entries.has('password') ||
    entries.has('pwd')
  ) {
    return 'SQL login'
  }
  return 'Not specified'
}

/** Extracts the database endpoint from a masked connection string, or null when none is found. */
export function parseConnectionString(
  connectionString: string,
  providerName = '',
): DatabaseTarget | null {
  const text = connectionString.trim()
  if (!text) return null

  let entries = pairs(text)
  let provider = providerName
  const inner = entries.get('provider connection string')
  if (inner) {
    provider = entries.get('provider') ?? provider
    entries = pairs(inner)
  }
  if (/(^|[^a-z])redis/i.test(provider) || /^[^=;]+:\d+(,|$)/.test(text)) {
    const first = text.split(',')[0]
    const { host, port } = splitHostPort(first)
    return {
      engineId: 'redis',
      engineLabel: 'Redis / cache',
      host,
      port,
      auth: entries.has('password') ? 'Access key' : 'Not specified',
      local: LOCAL_HOSTS.test(host),
    }
  }

  let serverValue = SERVER_KEYS.map((key) => entries.get(key)).find(Boolean) ?? ''
  const database = DATABASE_KEYS.map((key) => entries.get(key)).find(Boolean)
  let host = ''
  let port: string | undefined
  let databaseName = database
  const descriptor = oracleTarget(serverValue) ?? oracleTarget(text)

  if (entries.get('accountendpoint')) {
    serverValue = entries.get('accountendpoint') ?? ''
    host = serverValue.replace(/^https?:\/\//i, '').replace(/[/:].*$/, '')
  } else if (descriptor) {
    host = descriptor.host
    port = descriptor.port
    databaseName = descriptor.database ?? database
  } else if (serverValue) {
    const parsed = splitHostPort(serverValue)
    host = parsed.host
    port = parsed.port ?? entries.get('port')
  }
  if (!host) return null

  const engine = detectEngine(provider, host, text.toLowerCase())
  if (/^(sqlite|file)$/.test(engine.id) && /\.(sdf|mdb|accdb|db|sqlite)\b/i.test(host)) {
    databaseName = host
    host = 'local file'
  }
  return {
    engineId: engine.id,
    engineLabel: engine.label,
    host,
    port,
    database: databaseName?.replace(/^.*[\\/]/, ''),
    auth: authMode(entries),
    local: LOCAL_HOSTS.test(host.split('\\')[0]) || host === 'local file',
  }
}

/** Describes an ASP.NET state server connection such as tcp=host:42424. */
export function parseStateServer(stateConnectionString: string): DatabaseTarget | null {
  const match = /tcpip?=\s*([^:;\s]+)(?::(\d+))?/i.exec(stateConnectionString)
  if (!match) return null
  return {
    engineId: 'state',
    engineLabel: 'ASP.NET State Server',
    host: match[1],
    port: match[2] ?? '42424',
    auth: 'Not applicable',
    local: LOCAL_HOSTS.test(match[1]),
  }
}
