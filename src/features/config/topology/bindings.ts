import type { XNode } from './types'

export interface BindingInfo {
  protocol: string
  ip: string
  port: string
  host: string
  secure: boolean
  sni: boolean
  url: string
  label: string
}

const DEFAULT_PORTS: Record<string, string> = { http: '80', https: '443', ftp: '21' }

/** Joins an origin and a URL path without duplicate slashes. */
export function joinUrl(origin: string, path: string) {
  const clean = `/${path.replace(/^\/+/, '')}`
  return clean === '/' ? `${origin}/` : `${origin}${clean}`
}

/** Parses an IIS binding element such as `*:443:www.contoso.test` into display values. */
export function parseBinding(node: XNode): BindingInfo {
  const protocol = (node.attrs.protocol ?? 'http').toLowerCase()
  const raw = node.attrs.bindingInformation ?? ''
  const parts = raw.split(':')
  const isNetwork = ['http', 'https', 'ftp'].includes(protocol)

  let ip = '*'
  let port = ''
  let host = ''
  if (isNetwork && parts.length >= 3) {
    ip = parts[0] || '*'
    port = parts[1]
    host = parts.slice(2).join(':')
  } else if (protocol === 'net.tcp' || protocol === 'net.msmq') {
    port = /^\d+$/.test(parts[0] ?? '') ? parts[0] : ''
    host = parts.slice(1).join(':')
  } else {
    host = raw
  }

  const sslFlags = Number(node.attrs.sslFlags ?? 0)
  const sni = protocol === 'https' && Number.isFinite(sslFlags) && (sslFlags & 1) === 1
  const name = host || (ip !== '*' ? ip : 'localhost')
  const hidePort = DEFAULT_PORTS[protocol] === port || !port
  const url = isNetwork
    ? `${protocol}://${name}${hidePort ? '' : `:${port}`}`
    : `${protocol}://${raw}`

  return {
    protocol,
    ip,
    port,
    host,
    secure: protocol === 'https',
    sni,
    url,
    label: `${protocol.toUpperCase()} ${port || raw}`.trim(),
  }
}

const ENDPOINT_ORDER = ['https', 'http', 'ftp']

/** HTTPS, then HTTP, then FTP; other bindings (net.tcp, net.pipe) are never the public endpoint. */
export function primaryEndpoint(bindings: BindingInfo[]) {
  for (const protocol of ENDPOINT_ORDER) {
    const match = bindings.find((binding) => binding.protocol === protocol)
    if (match) return match.url
  }
  return bindings[0]?.url ?? ''
}

/** True for HTTP, HTTPS and FTP bindings that clients reach over the network. */
export const isPublicBinding = (binding: BindingInfo) => ENDPOINT_ORDER.includes(binding.protocol)
