export const releaseCategories = [
  'Fix',
  'Improve',
  'Feature',
  'Security',
  'Chore',
] as const

type ReleaseCategory = (typeof releaseCategories)[number]

export interface ReleaseNoteGroup {
  category: ReleaseCategory
  items: string[]
}

function legacyCategory(item: string, fallback: ReleaseCategory): ReleaseCategory {
  if (/^fix(?:es|ed)?\b/i.test(item)) return 'Fix'
  if (/^(?:adds?|initial)\b/i.test(item)) return 'Feature'
  if (/^(?:improves?|reworks?)\b/i.test(item)) return 'Improve'
  return fallback
}

export function parseReleaseNotes(description: string): ReleaseNoteGroup[] {
  const groups = new Map<ReleaseCategory, string[]>()
  const header = /\[(Fix|Improve|Feature|Security|Chore)\]/g
  let category: ReleaseCategory = 'Improve'
  let explicitCategory = false
  let start = 0

  function append(text: string) {
    const items = text
      .split(
        explicitCategory
          ? /\r?\n|;\s*/
          : /\r?\n|;\s*|(?<=[.!?])\s+(?=[A-Z])|\s+and\s+(?=(?:fixes|improves|adds)\b)/,
      )
      .map((item) => item.trim().replace(/^[-*]\s+/, ''))
      .filter(Boolean)

    for (const item of items) {
      if (!explicitCategory) category = legacyCategory(item, category)
      const entries = groups.get(category) ?? []
      entries.push(item)
      groups.set(category, entries)
    }
  }

  for (const match of description.matchAll(header)) {
    append(description.slice(start, match.index))
    category = match[1] as ReleaseCategory
    explicitCategory = true
    start = match.index + match[0].length
  }
  append(description.slice(start))

  return releaseCategories.flatMap((category) => {
    const items = groups.get(category)
    return items ? [{ category, items }] : []
  })
}
