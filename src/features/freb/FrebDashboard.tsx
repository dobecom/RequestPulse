import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Circle,
  CircleDashed,
  FileSearch,
  MinusCircle,
  ShieldAlert,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { ParsedLogFile } from '../logs/types'
import { FREB_PIPELINE_STAGES } from './frebParser'
import {
  getFrebGuidance,
  getFrebReferenceStats,
  getFrebStageReference,
} from './frebReference'

interface FrebDashboardProps {
  files: ParsedLogFile[]
}

interface ErrorSummary {
  key: string
  count: number
  error: NonNullable<ParsedLogFile['freb']>['error']
  files: string[]
}

const formatUtc = (timestamp: number) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(timestamp)

export function FrebDashboard({ files }: FrebDashboardProps) {
  const frebFiles = useMemo(
    () => files.filter((file) => file.kind === 'freb' && file.freb),
    [files],
  )
  const [selectedId, setSelectedId] = useState(frebFiles[0]?.id || '')

  useEffect(() => {
    if (!frebFiles.some((file) => file.id === selectedId)) {
      setSelectedId(frebFiles[0]?.id || '')
    }
  }, [frebFiles, selectedId])

  const selected = frebFiles.find((file) => file.id === selectedId) || frebFiles[0]
  const summaries = useMemo(() => {
    const byKey = new Map<string, ErrorSummary>()
    frebFiles.forEach((file) => {
      const error = file.freb?.error
      if (!error) return
      const current = byKey.get(error.key)
      if (current) {
        current.count += 1
        current.files.push(file.name)
      } else {
        byKey.set(error.key, {
          key: error.key,
          count: 1,
          error,
          files: [file.name],
        })
      }
    })
    return [...byKey.values()]
      .sort(
        (left, right) =>
          right.count - left.count ||
          (left.error?.message || '').localeCompare(right.error?.message || ''),
      )
      .slice(0, 5)
  }, [frebFiles])

  if (!selected?.freb) {
    return (
      <div className="empty-dashboard">
        <FileSearch size={38} />
        <h2>No FREB logs loaded</h2>
        <p>Add one or more fr*.xml files on Home to analyze the IIS request pipeline.</p>
      </div>
    )
  }

  const trace = selected.freb
  const error = trace.error
  const guidance = error ? getFrebGuidance(error) : null
  const explicitlyReachedStages = new Set(
    trace.events.flatMap((event) => (event.stageId ? [event.stageId] : [])),
  )
  const errorStageIndex = error
    ? FREB_PIPELINE_STAGES.findIndex((stage) => stage.id === error.stageId)
    : -1
  const isSuccessfulTrace = /^2\d\d(?:\.|$)/.test(trace.statusCode)
  const referenceStats = getFrebReferenceStats()

  return (
    <div className="dashboard freb-dashboard">
      <section className="freb-file-picker" aria-label="FREB file selection">
        <div className="freb-section-heading">
          <div>
            <span className="eyebrow">Single request trace</span>
            <h2>Select a FREB file</h2>
          </div>
          <span>{frebFiles.length} trace{frebFiles.length === 1 ? '' : 's'}</span>
        </div>
        <div className="freb-file-strip">
          {frebFiles.map((file, index) => (
            <button
              type="button"
              key={file.id}
              className={file.id === selected.id ? 'is-active' : undefined}
              aria-pressed={file.id === selected.id}
              onClick={() => setSelectedId(file.id)}
            >
              <b>{index + 1}</b>
              <span>{file.name}</span>
              <small>
                {file.freb?.statusCode || '—'} · {file.freb?.timeTaken ?? 0} ms
              </small>
            </button>
          ))}
        </div>
      </section>

      <section className="freb-error-summary">
        <div className="freb-section-heading">
          <div>
            <span className="eyebrow">Deduplicated across uploaded traces</span>
            <h2>Top 5 error messages</h2>
          </div>
          <span>{summaries.length} unique</span>
        </div>
        {summaries.length ? (
          <div className="freb-error-grid">
            {summaries.map((summary, index) => (
              <article key={summary.key}>
                <div>
                  <b>#{index + 1}</b>
                  <span>{summary.count} occurrence{summary.count === 1 ? '' : 's'}</span>
                </div>
                <strong>{summary.error?.message}</strong>
                <small>{summary.files.slice(0, 3).join(', ')}</small>
              </article>
            ))}
          </div>
        ) : (
          <div className="freb-no-error">
            No error-level or HTTP 4xx/5xx event was identified in the loaded traces.
          </div>
        )}
      </section>

      <section className="freb-request-card">
        <div className="freb-request-card__header">
          <div>
            <span className="eyebrow">Selected request · UTC</span>
            <h2>{trace.verb || 'REQUEST'} {trace.url}</h2>
          </div>
          <span className={`freb-status${error ? ' freb-status--error' : ''}`}>
            {trace.statusCode || 'Unknown status'}
          </span>
        </div>
        <dl>
          <div><dt>Started</dt><dd>{formatUtc(trace.timestamp)} UTC</dd></div>
          <div><dt>Duration</dt><dd>{trace.timeTaken.toLocaleString()} ms</dd></div>
          <div><dt>Application pool</dt><dd>{trace.appPoolId || '—'}</dd></div>
          <div><dt>Process</dt><dd>{trace.processId || '—'}</dd></div>
          <div><dt>Site</dt><dd>{trace.siteId || '—'}</dd></div>
          <div><dt>Trace events</dt><dd>{trace.events.length.toLocaleString()}</dd></div>
        </dl>
      </section>

      <section className="freb-pipeline-card">
        <div className="freb-section-heading">
          <div>
            <span className="eyebrow">IIS integrated request pipeline</span>
            <h2>Failure location</h2>
          </div>
          <span>{error ? `${error.moduleName} · ${error.stageLabel}` : 'No failure event'}</span>
        </div>
        <div className="freb-pipeline-legend" aria-label="Pipeline status legend">
          <span><CheckCircle2 size={14} /> Observed in trace</span>
          <span><CircleDashed size={14} /> Inferred before failure</span>
          <span><MinusCircle size={14} /> Skipped / not observed on success</span>
          <span><Circle size={14} /> Not observed</span>
          <span><AlertTriangle size={14} /> Failure</span>
        </div>
        <div className="freb-pipeline" role="list" aria-label="IIS request pipeline">
          {FREB_PIPELINE_STAGES.map((stage, index) => {
            const isError = error?.stageId === stage.id
            const isObserved = !isError && explicitlyReachedStages.has(stage.id)
            const isInferred =
              !isObserved &&
              !isError &&
              errorStageIndex >= 0 &&
              index < errorStageIndex
            const isSkipped =
              !isObserved &&
              !isError &&
              !isInferred &&
              isSuccessfulTrace
            const reference = getFrebStageReference(stage.id)
            return (
              <div className="freb-pipeline__item" role="listitem" key={stage.id}>
                <article
                  className={[
                    isError ? 'is-error' : '',
                    isObserved ? 'is-observed' : '',
                    isInferred ? 'is-inferred' : '',
                    isSkipped ? 'is-skipped' : '',
                  ].filter(Boolean).join(' ')}
                  title={reference?.description}
                >
                  {isError ? (
                    <AlertTriangle size={18} />
                  ) : isObserved ? (
                    <CheckCircle2 size={18} />
                  ) : isInferred ? (
                    <CircleDashed size={18} />
                  ) : isSkipped ? (
                    <MinusCircle size={18} />
                  ) : (
                    <Circle size={18} />
                  )}
                  <span>{stage.label}</span>
                  {isError && <small>{error.moduleName}</small>}
                </article>
                {index < FREB_PIPELINE_STAGES.length - 1 && (
                  <ArrowRight className="freb-pipeline__arrow" size={18} aria-hidden="true" />
                )}
              </div>
            )
          })}
        </div>
      </section>

      <section className="freb-guidance-card">
        <div className="freb-guidance-card__intro">
          <ShieldAlert size={24} />
          <div>
            <span className="eyebrow">Evidence-linked guidance</span>
            <h2>{error?.message || 'No request failure was identified'}</h2>
            <p>
              Guidance is matched locally against {referenceStats.rules} module,
              status, HRESULT, and pipeline rules across {referenceStats.stages} IIS
              stages. Confirm conclusions against the selected raw trace and effective
              server configuration.
            </p>
          </div>
        </div>
        {guidance ? (
          <div className="freb-guidance-grid">
            <article>
              <h3>Definition</h3>
              <p>{guidance.definition}</p>
            </article>
            <article>
              <h3>Likely causes</h3>
              <ul>{guidance.causes.map((cause) => <li key={cause}>{cause}</li>)}</ul>
            </article>
            <article>
              <h3>Recommended actions</h3>
              <ol>{guidance.actions.map((action) => <li key={action}>{action}</li>)}</ol>
            </article>
          </div>
        ) : (
          <div className="freb-no-error">
            This trace matched its configured FREB rule but completed without an
            error-level or HTTP 4xx/5xx event. Review the rule condition and trace
            timeline before treating it as a failed request.
          </div>
        )}
      </section>
    </div>
  )
}
