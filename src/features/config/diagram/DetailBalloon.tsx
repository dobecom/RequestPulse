import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { FileCog, X } from 'lucide-react'
import { ChangeTree } from './ChangeTree'
import type { TargetInfo, Tone } from '../topology/architecture'

export interface WebConfigOption {
  id: string
  name: string
  size: number
}

export interface BalloonPlacement {
  mode: 'float' | 'sheet'
  tail?: number
  side?: 'left' | 'right' | 'none'
}

interface DetailBalloonProps {
  target: TargetInfo
  placement: BalloonPlacement
  webConfigs: WebConfigOption[]
  attachedId?: string
  onAttach: (targetId: string, fileId: string) => void
  onClose: () => void
}

const formatSize = (bytes: number) => (bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`)

const TONE_CLASS: Record<Tone, string> = {
  ok: 'arch-chip--ok',
  info: 'arch-chip--info',
  warn: 'arch-chip--warn',
  off: 'arch-chip--off',
  danger: 'arch-chip--danger',
}

type ScopeFilter = 'all' | 'own'

/** Floating card that lists settings changed from IIS defaults for the selected diagram element. */
export function DetailBalloon({ target, placement, webConfigs, attachedId, onAttach, onClose }: DetailBalloonProps) {
  const [scope, setScope] = useState<ScopeFilter>('all')
  const inherited = target.changes.filter((change) => change.origin === 'server').length
  const own = target.changes.length - inherited
  const canFilter = inherited > 0 && own > 0
  const visible = useMemo(
    () => (scope === 'own' && canFilter ? target.changes.filter((change) => change.origin !== 'server') : target.changes),
    [scope, canFilter, target.changes],
  )
  const canAttach = Boolean(target.scopePath) && target.kind !== 'ftp'
  const style =
    placement.mode === 'float' ? ({ ['--arch-tail' as string]: `${placement.tail ?? 28}px` } as CSSProperties) : undefined

  return (
    <aside
      id="arch-balloon"
      className="arch-balloon"
      data-mode={placement.mode}
      data-side={placement.side}
      role="dialog"
      aria-label={`${target.title} settings changed from IIS defaults`}
      style={style}
    >
      <header className="arch-balloon__header">
        <div>
          <span className="eyebrow">{target.subtitle ?? target.kind}</span>
          <h3>{target.title}</h3>
        </div>
        <button type="button" className="arch-icon-button" onClick={onClose} aria-label="Close details">
          <X size={16} aria-hidden="true" />
        </button>
      </header>

      <div className="arch-balloon__scroll">
        {target.urls.length > 0 && (
          <ul className="arch-balloon__urls" aria-label="Endpoint URLs">
            {target.urls.map((url) => (
              <li key={url}>
                <code>{url}</code>
              </li>
            ))}
          </ul>
        )}

        {target.facts.length > 0 && (
          <dl className="arch-balloon__facts">
            {target.facts.map((fact) => (
              <div key={`${fact.label}:${fact.value}`}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {target.chips.length > 0 && (
          <div className="arch-balloon__chips">
            {target.chips.map((chip) => (
              <span key={chip.id} className={`arch-chip ${TONE_CLASS[chip.tone]}`} title={chip.title}>
                {chip.label}
              </span>
            ))}
          </div>
        )}

        {target.notes.length > 0 && (
          <ul className="arch-balloon__notes">
            {target.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}

        {canAttach && (
          <div className="arch-attach">
            <FileCog size={16} aria-hidden="true" />
            {webConfigs.length ? (
              <label>
                <span>web.config for this scope</span>
                <select
                  name="web-config-file"
                  value={attachedId ?? ''}
                  onChange={(event) => onAttach(target.id, event.target.value)}
                >
                  <option value="">None (applicationHost.config only)</option>
                  {webConfigs.map((file) => (
                    <option key={file.id} value={file.id}>
                      {file.name} · {formatSize(file.size)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span>Add a web.config on Home to merge its settings into this scope.</span>
            )}
          </div>
        )}

        <div className="arch-balloon__section">
          <div className="arch-balloon__section-head">
            <strong>Changed from defaults</strong>
            <span>{visible.length}</span>
          </div>
          {canFilter && (
            <div className="arch-segmented arch-segmented--small" role="group" aria-label="Setting scope">
              <button type="button" aria-pressed={scope === 'all'} onClick={() => setScope('all')}>
                All effective ({target.changes.length})
              </button>
              <button type="button" aria-pressed={scope === 'own'} onClick={() => setScope('own')}>
                Without server ({own})
              </button>
            </div>
          )}
          <ChangeTree
            key={`${target.id}:${scope}`}
            changes={visible}
            emptyMessage={
              target.kind === 'ftp'
                ? 'This FTP site matches the IIS defaults.'
                : 'Every setting for this element matches the IIS defaults.'
            }
          />
        </div>
      </div>
    </aside>
  )
}
