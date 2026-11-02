import type { Change } from '../topology/changes'

export interface RoutingHighlight {
  id: string
  name: string
  text: string
  kind: 'rewrite' | 'redirect'
}

/** Site-level rewrite and redirect rules worth previewing directly on the site card. */
export function routingHighlights(changes: Change[], limit = 2): RoutingHighlight[] {
  const lines: RoutingHighlight[] = []
  changes.forEach((change) => {
    if (lines.length >= limit || change.origin === 'server' || change.disabled) return
    if (change.layer === 'url-rewrite' && change.kind === 'entry' && (change.sub === 'inbound' || change.sub === 'global')) {
      lines.push({ id: `${change.id}|${change.scope}`, name: change.label, text: change.value, kind: 'rewrite' })
    } else if (change.layer === 'redirect' && change.label === 'destination') {
      lines.push({ id: `${change.id}|${change.scope}`, name: 'HTTP redirect', text: `→ ${change.value}`, kind: 'redirect' })
    }
  })
  return lines
}
