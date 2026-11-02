import { useMemo, useState } from 'react'
import { FileCode2, Network, Server } from 'lucide-react'
import { analyzeConfigFile, getReferenceStats } from './configAnalysis'
import type { ConfigFinding } from './configAnalysis'
import { ArchitectureDiagram } from './diagram/ArchitectureDiagram'
import { getSampleConfigFiles, sampleConfigAttachments } from './sampleConfigs'
import { buildArchitecture } from './topology/architecture'
import type { ConfigModel } from './topology/types'
import type { ParsedLogFile } from '../logs/types'

interface ConfigDashboardProps {
  files: ParsedLogFile[]
  /** Shows the bundled synthetic configuration instead of `files`. */
  useSample?: boolean
}

const severityRank: Record<ConfigFinding['severity'], number> = {
  high: 0,
  medium: 1,
  low: 2,
  info: 3,
}

const APPLICATION_HOST_SECTION_ID = 'config-findings-applicationhost'
const WEB_CONFIG_SECTION_ID = 'config-findings-web'

function collectFindings(files: ParsedLogFile[]): ConfigFinding[] {
  return files
    .flatMap(analyzeConfigFile)
    .sort(
      (left, right) =>
        severityRank[left.severity] - severityRank[right.severity] ||
        left.path.localeCompare(right.path),
    )
}

function jumpToSection(id: string) {
  const section = document.getElementById(id)
  if (!section) return
  const reduceMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  section.scrollIntoView?.({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
  section.focus({ preventScroll: true })
}

function FindingsTable({
  id,
  title,
  description,
  hasFiles,
  findings,
}: {
  id: string
  title: string
  description: string
  hasFiles: boolean
  findings: ConfigFinding[]
}) {
  return (
    <section className="config-panel" id={id} tabIndex={-1} aria-labelledby={`${id}-title`}>
      <div className="config-panel__header">
        <div>
          <span className="eyebrow">Schema comparison</span>
          <h2 id={`${id}-title`}>{title}</h2>
          <p>{description}</p>
        </div>
        <span className="config-panel__count">{findings.length} findings</span>
      </div>
      {!hasFiles ? (
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
              {findings.map((finding, index) => (
                <tr key={`${finding.id}#${index}`}>
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

export function ConfigDashboard({ files: uploadedFiles, useSample = false }: ConfigDashboardProps) {
  const files = useMemo(
    () => (useSample ? getSampleConfigFiles() : uploadedFiles),
    [useSample, uploadedFiles],
  )
  const applicationHostFiles = useMemo(
    () => files.filter((file) => file.kind === 'config-applicationhost'),
    [files],
  )
  const webConfigFiles = useMemo(
    () => files.filter((file) => file.kind === 'config-web'),
    [files],
  )
  const applicationHostFindings = useMemo(
    () => collectFindings(applicationHostFiles),
    [applicationHostFiles],
  )
  const webConfigFindings = useMemo(() => collectFindings(webConfigFiles), [webConfigFiles])
  const model = applicationHostFiles[0]?.config?.model
  const referenceStats = getReferenceStats()

  // Target id -> web.config file id. Sample mode starts with the synthetic web.config attached.
  const [attachedFiles, setAttachedFiles] = useState<Record<string, string>>(() => {
    if (!useSample) return {}
    const byName = new Map(files.map((file) => [file.name, file.id]))
    return Object.fromEntries(
      Object.entries(sampleConfigAttachments).flatMap(([targetId, name]) => {
        const id = byName.get(name)
        return id ? [[targetId, id]] : []
      }),
    )
  })
  const webConfigOptions = useMemo(
    () =>
      files
        .filter((file) => file.kind === 'config-web' && file.config?.model)
        .map((file) => ({ id: file.id, name: file.name, size: file.size })),
    [files],
  )
  const activeAttachments = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(attachedFiles).filter(([, fileId]) =>
          webConfigOptions.some((option) => option.id === fileId),
        ),
      ),
    [attachedFiles, webConfigOptions],
  )
  const architecture = useMemo(() => {
    if (!model) return undefined
    const models: Record<string, ConfigModel> = {}
    Object.entries(activeAttachments).forEach(([targetId, fileId]) => {
      const attached = files.find((file) => file.id === fileId)?.config?.model
      if (attached) models[targetId] = attached
    })
    return buildArchitecture(model, models)
  }, [model, activeAttachments, files])
  const attach = (targetId: string, fileId: string) =>
    setAttachedFiles((current) => {
      const next = { ...current }
      if (fileId) next[targetId] = fileId
      else delete next[targetId]
      return next
    })

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

      <nav className="config-jump" aria-label="Jump to schema comparison findings">
        <span className="config-jump__label">Jump to findings</span>
        <button type="button" onClick={() => jumpToSection(APPLICATION_HOST_SECTION_ID)}>
          <Server size={15} aria-hidden="true" />
          applicationHost.config
          <span className="config-jump__count">
            {applicationHostFiles.length ? applicationHostFindings.length : 'not loaded'}
          </span>
        </button>
        <button type="button" onClick={() => jumpToSection(WEB_CONFIG_SECTION_ID)}>
          <FileCode2 size={15} aria-hidden="true" />
          web.config
          <span className="config-jump__count">
            {webConfigFiles.length ? webConfigFindings.length : 'not loaded'}
          </span>
        </button>
      </nav>

      {architecture ? (
        <ArchitectureDiagram
          architecture={architecture}
          webConfigs={webConfigOptions}
          attachments={activeAttachments}
          onAttach={attach}
        />
      ) : (
        <section className="config-reference-note">
          <Network size={20} />
          <div>
            <strong>Architecture diagram needs applicationHost.config</strong>
            <span>
              Add applicationHost.config to map sites, application pools,
              bindings, ARR routing and entry-point filters. web.config files
              can then be attached to any site, application or virtual directory.
              web.config findings are still shown below.
            </span>
          </div>
        </section>
      )}

      <FindingsTable
        id={APPLICATION_HOST_SECTION_ID}
        title="applicationHost.config findings"
        description="Explicit server, application pool, site, FTP, proxy, authentication, and IIS feature overrides."
        hasFiles={applicationHostFiles.length > 0}
        findings={applicationHostFindings}
      />
      <FindingsTable
        id={WEB_CONFIG_SECTION_ID}
        title="web.config findings"
        description="Explicit IIS and ASP.NET overrides from every loaded web.config file, including location scope."
        hasFiles={webConfigFiles.length > 0}
        findings={webConfigFindings}
      />
    </div>
  )
}
