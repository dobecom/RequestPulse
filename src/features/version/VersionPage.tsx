import { useEffect, useState } from 'react'
import {
  loadVersionHistory,
  type ApplicationVersion,
} from '../../services/versionService'
import { parseReleaseNotes } from './releaseNotes'

export function VersionPage() {
  const [versions, setVersions] = useState<ApplicationVersion[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    document.title = 'RequestPulse version history'
    let robots = document.head.querySelector<HTMLMetaElement>(
      'meta[name="robots"]',
    )
    if (!robots) {
      robots = document.createElement('meta')
      robots.name = 'robots'
      document.head.append(robots)
    }
    robots.content = 'noindex, nofollow, noarchive'

    void loadVersionHistory()
      .then((history) => {
        setVersions(history)
        setStatus('ready')
      })
      .catch(() => setStatus('error'))
  }, [])

  return (
    <main className="version-page">
      <section className="version-page__panel">
        <p className="version-page__eyebrow">RequestPulse</p>
        <h1>Version history</h1>
        {status === 'loading' && <p role="status">Loading version history…</p>}
        {status === 'error' && (
          <p role="alert">Version history is temporarily unavailable.</p>
        )}
        {status === 'ready' && versions.length === 0 && (
          <p>No tracked releases are available.</p>
        )}
        {versions.length > 0 && (
          <ol className="version-list">
            {versions.map((release) => (
              <li key={release.version}>
                <div>
                  <strong>{release.version}</strong>
                  <time dateTime={release.releasedAt.slice(0, 10)}>
                    {release.releasedAt.slice(0, 10)}
                  </time>
                </div>
                {parseReleaseNotes(release.description).map((group) => (
                  <section
                    className="version-notes"
                    key={group.category}
                    aria-label={`${release.version} ${group.category}`}
                  >
                    <h2>[{group.category}]</h2>
                    <ul>
                      {group.items.map((item, index) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                  </section>
                ))}
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  )
}
