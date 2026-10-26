import { BookOpenCheck } from 'lucide-react'
import { buildEventIdRankings } from '../logs/eventViewerReference'
import type { EventLogKind, LogRow } from '../logs/types'

interface EventIdDetailsProps {
  rows: LogRow[]
}

const sections: Array<{ kind: EventLogKind; title: string }> = [
  { kind: 'event-application', title: 'Application Event IDs' },
  { kind: 'event-system', title: 'System Event IDs' },
]

export function EventIdDetails({
  rows,
}: EventIdDetailsProps) {
  return (
    <section className="event-id-details">
      <div className="event-id-details__header">
        <div>
          <span className="eyebrow">Top 10 by Source and Event ID</span>
          <h3>
            <BookOpenCheck size={18} /> Event ID details
          </h3>
        </div>
        <p>
          Counts use the selected UTC week and the same Source, Event ID, and
          severity filters as the chart and raw tables.
        </p>
      </div>
      <div className="event-id-details__grid">
        {sections.map(({ kind, title }) => {
          const rankings = buildEventIdRankings(rows, kind, [])
          return (
            <section className={`event-id-list event-id-list--${kind}`} key={kind}>
              <h4>{title}</h4>
              {rankings.length ? (
                <ol>
                  {rankings.map(({ source, sourceKey, eventId, count, reference }) => (
                    <li key={`${sourceKey}:${eventId}`}>
                      <details className="event-id-entry">
                        <summary>
                          <span className="event-id-list__heading">
                            <strong title={sourceKey}>[{source || 'Unknown source'}] Event ID {eventId}</strong>
                            <span>{count.toLocaleString()} {count === 1 ? 'event' : 'events'}</span>
                          </span>
                          <span className="event-id-list__summary">
                            {reference?.title ?? 'Unknown event ID'}
                          </span>
                        </summary>
                        <div className="event-id-entry__body">
                          {reference?.nativeTemplate && (
                            <p className="event-filter-note">
                              Windows provider message template. Placeholders
                              such as %1 require the original event data; this is
                              not a rendered message or confirmed root cause.
                            </p>
                          )}
                          <p>
                            {reference?.meaning ??
                              'No source-and-ID match exists in the bundled reference. The event is preserved here as Unknown; use its raw message and provider documentation before drawing conclusions.'}
                          </p>
                          {reference ? (
                            <>
                              <div>
                                <b>Likely causes</b>
                                <ul>
                                  {reference.likelyCauses.map((cause) => (
                                    <li key={cause}>{cause}</li>
                                  ))}
                                </ul>
                              </div>
                              <div>
                                <b>Recommended actions</b>
                                <ul>
                                  {reference.recommendedActions.map((action) => (
                                    <li key={action}>{action}</li>
                                  ))}
                                </ul>
                              </div>
                              <a
                                href={reference.url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {reference.nativeTemplate
                                  ? 'Windows provider metadata reference'
                                  : 'Microsoft reference'}
                              </a>
                            </>
                          ) : (
                            <div>
                              <b>Next step</b>
                              <p>
                                Inspect the complete Event Viewer message, provider,
                                task category, and event data; add a verified
                                provider-specific entry to the local reference.
                              </p>
                            </div>
                          )}
                        </div>
                      </details>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="event-id-list__empty">
                  No events match the selected week and filters in this channel.
                </p>
              )}
            </section>
          )
        })}
      </div>
    </section>
  )
}
