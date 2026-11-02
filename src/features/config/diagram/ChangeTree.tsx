import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { Change } from '../topology/changes'
import { getGroup } from '../topology/reference'
import type { ChangeCategory } from '../topology/reference'

const CATEGORY_LABEL: Record<ChangeCategory, string> = {
  pool: 'App pool',
  aspnet: 'ASP.NET',
  iis: 'IIS',
}

const CATEGORY_HINT: Record<ChangeCategory, string> = {
  pool: 'Process model, recycling and runtime',
  aspnet: 'web.config system.web and application settings',
  iis: 'system.webServer, site and server settings',
}

const ORIGIN_LABEL: Record<Change['origin'], string> = {
  server: 'Server',
  site: 'Site',
  app: 'Application',
  dir: 'Directory',
  'web.config': 'web.config',
  pool: 'Pool',
  defaults: 'Defaults',
}

const DEFAULTS_KEY = '\u0000defaults'
const ROW_LIMIT = 7
const AUTO_COLLAPSE_ABOVE = 30

interface GroupNode {
  key: string
  label: string
  items: Change[]
  children: GroupNode[]
}

interface Section {
  key: string
  label?: string
  groups: GroupNode[]
}

interface CategoryNode {
  id: ChangeCategory
  total: number
  sections: Section[]
}

const countItems = (group: GroupNode): number =>
  group.items.length + group.children.reduce((sum, child) => sum + countItems(child), 0)

function groupChanges(changes: Change[], prefix: string): GroupNode[] {
  const top = new Map<string, GroupNode>()
  const ensure = (map: Map<string, GroupNode>, key: string, label: string) => {
    let node = map.get(key)
    if (!node) {
      node = { key, label, items: [], children: [] }
      map.set(key, node)
    }
    return node
  }
  const childMaps = new Map<string, Map<string, GroupNode>>()

  changes.forEach((change) => {
    const definition = getGroup(change.groupId)
    const parent = definition?.parent ? getGroup(definition.parent) : undefined
    const root = parent ?? definition
    const rootLabel = root?.label ?? change.groupId
    const rootNode = ensure(top, `${prefix}/${rootLabel}`, rootLabel)
    if (parent && definition) {
      let children = childMaps.get(rootNode.key)
      if (!children) {
        children = new Map()
        childMaps.set(rootNode.key, children)
      }
      ensure(children, `${rootNode.key}/${definition.label}`, definition.label).items.push(change)
    } else {
      rootNode.items.push(change)
    }
  })

  childMaps.forEach((children, key) => {
    const node = top.get(key)
    if (node) node.children = [...children.values()]
  })
  return [...top.values()]
}

function buildCategories(changes: Change[]): CategoryNode[] {
  return (['pool', 'aspnet', 'iis'] as ChangeCategory[]).map((id) => {
    const list = changes.filter((change) => change.category === id)
    if (id !== 'pool') {
      return { id, total: list.length, sections: [{ key: id, groups: groupChanges(list, id) }] }
    }
    const scopes: string[] = []
    list.forEach((change) => {
      const key = change.origin === 'defaults' ? DEFAULTS_KEY : change.scope
      if (!scopes.includes(key)) scopes.push(key)
    })
    scopes.sort((left, right) => (left === DEFAULTS_KEY ? -1 : right === DEFAULTS_KEY ? 1 : 0))
    const multiple = scopes.length > 1 || scopes[0] === DEFAULTS_KEY
    return {
      id,
      total: list.length,
      sections: scopes.map((key) => ({
        key: `${id}/${key}`,
        label: multiple ? (key === DEFAULTS_KEY ? 'Pool defaults' : `Pool ${key}`) : undefined,
        groups: groupChanges(
          list.filter((change) => (change.origin === 'defaults' ? DEFAULTS_KEY : change.scope) === key),
          `${id}/${key}`,
        ),
      })),
    }
  })
}

const collectKeys = (categories: CategoryNode[]) => {
  const keys: string[] = []
  const walk = (group: GroupNode) => {
    keys.push(group.key)
    group.children.forEach(walk)
  }
  categories.forEach((category) => {
    keys.push(category.id)
    category.sections.forEach((section) => {
      if (section.label) keys.push(section.key)
      section.groups.forEach(walk)
    })
  })
  return keys
}

function severityLabel(severity: NonNullable<Change['severity']>) {
  return severity === 'high' ? 'High risk' : severity === 'medium' ? 'Review' : severity === 'low' ? 'Note' : 'Info'
}

function ChangeRow({ change }: { change: Change }) {
  const removed = change.kind === 'removed'
  const showDefault = change.kind === 'value' && change.defaultValue !== undefined
  return (
    <li className="arch-change" data-kind={change.kind} data-severity={change.severity}>
      <div className="arch-change__main">
        <span className="arch-change__label">{change.label}</span>
        <code className="arch-change__value">{change.value === '' ? '(empty)' : change.value}</code>
      </div>
      <div className="arch-change__meta">
        {showDefault && (
          <span className="arch-change__default">
            default {change.defaultValue === '' ? '(empty)' : change.defaultValue}
          </span>
        )}
        {removed && <span className="arch-tag arch-tag--off">Removed</span>}
        {change.disabled && <span className="arch-tag arch-tag--off">Disabled</span>}
        {change.severity && (
          <span className={`arch-tag arch-tag--${change.severity}`} title={change.note}>
            {severityLabel(change.severity)}
          </span>
        )}
        <span className="arch-origin" data-origin={change.origin} title={change.scope || undefined}>
          {ORIGIN_LABEL[change.origin]}
        </span>
      </div>
      {change.note && <p className="arch-change__note">{change.note}</p>}
      {change.detail && change.detail.length > 0 && (
        <ul className="arch-change__detail">
          {change.detail.map((line, index) => (
            <li key={`${index}-${line}`}>{line}</li>
          ))}
        </ul>
      )}
    </li>
  )
}

interface TreeContext {
  isOpen: (key: string) => boolean
  toggle: (key: string) => void
  showAll: Set<string>
  expandRows: (key: string) => void
}

function Disclosure({
  id,
  label,
  count,
  open,
  onToggle,
  className,
  hint,
}: {
  id: string
  label: string
  count: number
  open: boolean
  onToggle: () => void
  className: string
  hint?: string
}) {
  const Icon = open ? ChevronDown : ChevronRight
  return (
    <button
      type="button"
      className={className}
      aria-expanded={open}
      aria-controls={`${id}-panel`}
      onClick={onToggle}
    >
      <Icon size={15} aria-hidden="true" />
      <span className="arch-disclosure__label">{label}</span>
      {hint && <small>{hint}</small>}
      <span className="arch-count" data-empty={count === 0 || undefined}>
        {count === 0 ? 'Default' : count}
      </span>
    </button>
  )
}

function GroupView({ group, context, depth }: { group: GroupNode; context: TreeContext; depth: number }) {
  const open = context.isOpen(group.key)
  const total = countItems(group)
  const expanded = context.showAll.has(group.key)
  const visible = expanded ? group.items : group.items.slice(0, ROW_LIMIT)
  const hidden = group.items.length - visible.length
  return (
    <li className="arch-group" data-depth={depth}>
      <Disclosure
        id={group.key}
        label={group.label}
        count={total}
        open={open}
        onToggle={() => context.toggle(group.key)}
        className="arch-disclosure arch-disclosure--group"
      />
      {open && (
        <div id={`${group.key}-panel`} className="arch-group__body">
          {visible.length > 0 && (
            <ul className="arch-changes">
              {visible.map((change) => (
                <ChangeRow key={`${change.id}|${change.scope}|${change.origin}`} change={change} />
              ))}
            </ul>
          )}
          {hidden > 0 && (
            <button type="button" className="arch-more" onClick={() => context.expandRows(group.key)}>
              Show {hidden} more
            </button>
          )}
          {group.children.length > 0 && (
            <ul className="arch-groups">
              {group.children.map((child) => (
                <GroupView key={child.key} group={child} context={context} depth={depth + 1} />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  )
}

export interface ChangeTreeProps {
  changes: Change[]
  emptyMessage?: string
}

/** Collapsible App pool / ASP.NET / IIS tree that lists only settings changed from IIS defaults. */
export function ChangeTree({ changes, emptyMessage }: ChangeTreeProps) {
  const categories = useMemo(() => buildCategories(changes), [changes])
  const keys = useMemo(() => collectKeys(categories), [categories])
  const collapseGroups = changes.length > AUTO_COLLAPSE_ABOVE
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})
  const [showAll, setShowAll] = useState<Set<string>>(new Set())

  const isOpen = (key: string) => {
    if (key in overrides) return overrides[key]
    const category = categories.find((candidate) => candidate.id === key)
    if (category) return category.total > 0
    return !collapseGroups
  }
  const toggle = (key: string) => setOverrides((current) => ({ ...current, [key]: !isOpen(key) }))
  const setAll = (open: boolean) => setOverrides(Object.fromEntries(keys.map((key) => [key, open])))

  const context: TreeContext = {
    isOpen,
    toggle,
    showAll,
    expandRows: (key) => setShowAll((current) => new Set(current).add(key)),
  }

  if (changes.length === 0) {
    return (
      <p className="arch-empty">
        {emptyMessage ?? 'Everything here matches the IIS defaults, so there is nothing to list.'}
      </p>
    )
  }

  return (
    <div className="arch-changetree">
      <div className="arch-changetree__tools">
        <button type="button" onClick={() => setAll(true)}>
          Expand all
        </button>
        <button type="button" onClick={() => setAll(false)}>
          Collapse all
        </button>
      </div>
      <ul className="arch-categories">
        {categories.map((category) => {
          const open = isOpen(category.id)
          return (
            <li key={category.id} className="arch-category" data-category={category.id} data-empty={category.total === 0 || undefined}>
              <Disclosure
                id={category.id}
                label={CATEGORY_LABEL[category.id]}
                hint={CATEGORY_HINT[category.id]}
                count={category.total}
                open={open}
                onToggle={() => toggle(category.id)}
                className="arch-disclosure arch-disclosure--category"
              />
              {open && category.total > 0 && (
                <div id={`${category.id}-panel`} className="arch-category__body">
                  {category.sections.map((section) => {
                    const sectionOpen = section.label ? isOpen(section.key) : true
                    const sectionTotal = section.groups.reduce((sum, group) => sum + countItems(group), 0)
                    return (
                      <div className="arch-section" key={section.key}>
                        {section.label && (
                          <Disclosure
                            id={section.key}
                            label={section.label}
                            count={sectionTotal}
                            open={sectionOpen}
                            onToggle={() => toggle(section.key)}
                            className="arch-disclosure arch-disclosure--section"
                          />
                        )}
                        {sectionOpen && (
                          <ul className="arch-groups" id={section.label ? `${section.key}-panel` : undefined}>
                            {section.groups.map((group) => (
                              <GroupView key={group.key} group={group} context={context} depth={0} />
                            ))}
                          </ul>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
