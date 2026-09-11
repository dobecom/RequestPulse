import {
  AlertTriangle,
  Boxes,
  Cable,
  FileCode2,
  Globe2,
  Layers3,
  Network,
  Server,
} from 'lucide-react'
import { analyzeConfigFile, getReferenceStats } from './configAnalysis'
import type { ConfigFinding } from './configAnalysis'
import type { ParsedLogFile } from '../logs/types'

interface ConfigDashboardProps {
  files: ParsedLogFile[]
}

const severityRank: Record<ConfigFinding['severity'], number> = {
  high: 0,
  medium: 1,
  low: 2,
  info: 3,
}

function FindingsTable({
  title,
  description,
  files,
}: {
  title: string
  description: string
  files: ParsedLogFile[]
}) {
  const findings = files
    .flatMap(analyzeConfigFile)
    .sort(
      (left, right) =>
        severityRank[left.severity] - severityRank[right.severity] ||
        left.path.localeCompare(right.path),
    )

  return (
    <section className="config-panel">
      <div className="config-panel__header">
        <div>
          <span className="eyebrow">Schema comparison</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <span className="config-panel__count">{findings.length} findings</span>
      </div>
      {files.length === 0 ? (
        <div className="empty-files">No matching configuration file is loaded.</div>
      ) : findings.length === 0 ? (
        <div className="config-clear">
          No explicit non-default values matched the bundled IIS schema and risk
          rules. Inherited settings can still affect the effective configuration.
        </div>
      ) : (
        <div className="config-table-wrap">
          <table className="config-table">
            <thead>
              <tr>
                <th>Severity</th>
                <th>Setting</th>
                <th>Configured / default</th>
                <th>Review comment</th>
              </tr>
            </thead>
            <tbody>
              {findings.map((finding) => (
                <tr key={finding.id}>
                  <td>
                    <span className={`severity severity--${finding.severity}`}>
                      {finding.severity}
                    </span>
                  </td>
                  <td>
                    <strong>{finding.title}</strong>
                    <span>{finding.fileName}</span>
                    <code>
                      {finding.scope !== '.' ? `[${finding.scope}] ` : ''}
                      {finding.path}/@{finding.attribute}
                    </code>
                  </td>
                  <td>
                    <strong>{finding.value}</strong>
                    <span>
                      Default: {finding.defaultValue ?? 'not defined by schema'}
                    </span>
                  </td>
                  <td>
                    <p>{finding.comment}</p>
                    <span>{finding.recommendation}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export function ConfigDashboard({ files }: ConfigDashboardProps) {
  const applicationHostFiles = files.filter(
    (file) => file.kind === 'config-applicationhost',
  )
  const webConfigFiles = files.filter((file) => file.kind === 'config-web')
  const inventory = applicationHostFiles[0]?.config?.inventory
  const referenceStats = getReferenceStats()

  if (!applicationHostFiles.length && !webConfigFiles.length) {
    return (
      <div className="empty-dashboard">
        <FileCode2 size={38} />
        <h2>No IIS configuration files loaded</h2>
        <p>
          Add applicationHost.config or web.config on Home to inspect server
          topology and explicit settings locally.
        </p>
      </div>
    )
  }

  const metrics = [
    {
      label: 'Application pools',
      value: inventory?.applicationPools.length ?? 0,
      icon: Boxes,
    },
    { label: 'Web sites', value: inventory?.sites.length ?? 0, icon: Globe2 },
    { label: 'Applications', value: inventory?.applications ?? 0, icon: Layers3 },
    {
      label: 'Virtual directories',
      value: inventory?.virtualDirectories ?? 0,
      icon: Network,
    },
    { label: 'Bindings', value: inventory?.bindings ?? 0, icon: Cable },
    { label: 'FTP sites', value: inventory?.ftpSites ?? 0, icon: Server },
  ]

  return (
    <div className="dashboard config-dashboard">
      <section className="config-reference-note">
        <FileCode2 size={20} />
        <div>
          <strong>Local schema-based analysis</strong>
          <span>
            Compares explicit values with {referenceStats.options.toLocaleString()}{' '}
            options across {referenceStats.sections} IIS and ASP.NET sections,
            plus {referenceStats.riskRules} focused review rules. Missing values
            may be inherited and are not treated as disabled.
          </span>
        </div>
      </section>

      {inventory ? (
        <>
          <section className="config-stat-grid">
            {metrics.map(({ label, value, icon: Icon }) => (
              <article className="config-stat" key={label}>
                <Icon size={20} />
                <span>{label}</span>
                <strong>{value}</strong>
              </article>
            ))}
            <article className="config-stat">
              <Network size={20} />
              <span>ARR proxy</span>
              <strong>{inventory.arrEnabled ? 'Enabled' : 'Not detected'}</strong>
            </article>
            <article className="config-stat">
              <Boxes size={20} />
              <span>Global modules</span>
              <strong>{inventory.globalModules}</strong>
            </article>
          </section>

          <section className="config-topology">
            <article className="config-panel">
              <div className="config-panel__header">
                <div>
                  <span className="eyebrow">WAS process model</span>
                  <h2>Application pools</h2>
                </div>
              </div>
              <div className="config-entity-list">
                {inventory.applicationPools.map((pool) => (
                  <div key={pool.name}>
                    <strong>{pool.name}</strong>
                    <span>
                      Runtime {pool.runtime} · {pool.pipeline} · {pool.startMode}
                    </span>
                  </div>
                ))}
                {!inventory.applicationPools.length && (
                  <span>No application pools were declared.</span>
                )}
              </div>
            </article>
            <article className="config-panel">
              <div className="config-panel__header">
                <div>
                  <span className="eyebrow">IIS topology</span>
                  <h2>Sites and bindings</h2>
                </div>
              </div>
              <div className="config-entity-list">
                {inventory.sites.map((site) => (
                  <div key={`${site.id}:${site.name}`}>
                    <strong>
                      {site.name} <small>#{site.id}</small>
                    </strong>
                    <span>
                      Pool {site.applicationPool} · {site.applications} apps ·{' '}
                      {site.virtualDirectories} virtual directories
                    </span>
                    <code>{site.bindings.join(', ') || 'No bindings declared'}</code>
                  </div>
                ))}
                {!inventory.sites.length && <span>No sites were declared.</span>}
              </div>
            </article>
          </section>
        </>
      ) : (
        <section className="config-reference-note config-reference-note--warning">
          <AlertTriangle size={20} />
          <div>
            <strong>applicationHost.config is not loaded</strong>
            <span>
              Server topology requires applicationHost.config. web.config findings
              are still shown below.
            </span>
          </div>
        </section>
      )}

      <FindingsTable
        title="applicationHost.config findings"
        description="Explicit server, application pool, site, FTP, proxy, authentication, and IIS feature overrides."
        files={applicationHostFiles}
      />
      <FindingsTable
        title="web.config findings"
        description="Explicit IIS and ASP.NET overrides from every loaded web.config file, including location scope."
        files={webConfigFiles}
      />
    </div>
  )
}
