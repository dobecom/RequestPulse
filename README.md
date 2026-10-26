# RequestPulse

RequestPulse is a browser-only React application for exploring IIS W3SVC access
logs, HTTP.sys HTTPERR logs, Windows Event Viewer evidence, and IIS
configuration. It also analyzes IIS Failed Request Tracing (FREB) XML files.
Parsing, filtering, aggregation, configuration comparison, and
raw-row navigation happen locally in the browser. Raw evidence is never sent to
an API.

## Features

- Separate W3SVC and HTTPERR drag/drop zones plus file pickers and workspace drop
- Wide multi-file FREB upload with per-request selection and browser-local XML parsing
- Deduplicated Top 5 FREB error signatures across loaded traces
- IIS request-pipeline visualization that identifies the failing stage and module
- XML-managed FREB definitions, likely causes, and recommended actions
- Side-by-side Event Viewer and IIS configuration upload areas
- Independent Application/System Source and Event ID filters, with
  channel- and provider-specific IIS defaults in
  `src/features/logs/reference/event-viewer-reference.json`
- Collapsed top-10 Event ID summaries per channel; expand a source/ID entry
  for meaning, likely causes, recommended actions, and official references
- Source/Event ID filter counts and Event ID details share the chart/raw tables' selected UTC week, Source,
  Event ID, and channel severity filters
- Source-specific event explanations with explicit Unknown handling for
  unreferenced IDs
- applicationHost.config topology dashboard for pools, sites, applications,
  virtual directories, bindings, FTP, modules, and ARR detection
- applicationHost.config and web.config comparison against a bundled XML
  catalog generated from every IIS configuration schema installed on Windows
- Focused risk guidance for high-signal application pool, request, proxy,
  authentication, ASP.NET, session, error-detail, cookie, and tracing settings
- Synthetic applicationHost.config and web.config previews when no uploaded
  configuration files are available
- Dynamic `#Fields` parsing with strict format validation and UTC timestamps
- W3SVC per-file, per-UTC-day dashboards with request count and average
  `time-taken` timelines
- HTTPERR hourly-file merging by UTC day with a dynamic count timeline
- Immediate method, URI, date/time, status, timing, queue, reason, site, and
  discovered-field filters
- Hoverable Recharts timelines; selecting a point opens the first source row
- Event Viewer raw tables start with 50 rows and append the next 50 at the
  bottom, with a keyboard-accessible Load more fallback; other raw tables
  retain pagination
- Responsive Microsoft/Fluent-inspired design using Segoe UI and CSS variables
- Best-effort session visit audit containing only `sessionId` and `page`
- RequestPulse browser favicon and Open Graph link-preview metadata

## Local development

Requirements: Node.js 24 and npm.

```powershell
npm install
npm run dev
```

The default development URL is `http://localhost:3001`. Copy
`.env.dev.example` to `.env.dev` for local development or `.env.prod.example`
to `.env.prod` for a production-mode preview. Both local files are ignored.

`VITE_APP_ENV` selects the application profile, `VITE_API_BASE_URL` defaults to
`/api/v1`, and the development/preview ports default to `3001`.

The unlinked `/version` route reads release history from
`requestpulse.app.application_versions`. Update `release.json` before a new
release; Core-DevOps records its version, description, and Git revision during
deployment.

## Quality checks

```powershell
npm test
npm run lint
npm run build
```

## Container

The image uses Node 24 Alpine to build and nginx 1.29 Alpine to serve the SPA.
nginx proxies `/api/` to `core-server:3100`.

```powershell
docker build -t requestpulse .
docker run --rm -p 3001:80 requestpulse
```

Open `http://localhost:3001`. The container health endpoint is `/healthz`.

## Log recognition

- W3SVC: an active `#Fields:` header must include `cs-uri-stem` and `time-taken`.
- HTTPERR: an active `#Fields:` header must include `s-reason` and `s-queuename`.
- IIS configuration: `applicationHost.config` and `web.config` must contain a
  valid XML `<configuration>` root.
- FREB: each XML file must contain a `<failedRequest>` root and trace events.

Headers may change within a file. RequestPulse applies the active header to each
subsequent data row and preserves the original source file and line number.

The configuration reference is stored at
`src/features/config/reference/iis-configuration-reference.xml`. Regenerate it
on a Windows IIS machine with:

```powershell
.\scripts\generate-iis-configuration-reference.ps1
```

The generated catalog contains schema defaults, types, validation metadata, and
allowed enum values. Findings cover explicit non-default values only. Missing
settings may be inherited from parent configuration and are not treated as
disabled.

The FREB analysis reference is stored at
`src/features/freb/reference/freb-analysis-reference.xml`. It records the IIS
pipeline stages and evidence-linked module, status, HRESULT, cause, and action
rules used by the local dashboard.

The Event Viewer source/default rules and curated troubleshooting explanations
are in `src/features/logs/reference/event-viewer-reference.json`. Source menus
show all distinct sources present in the selected UTC week, not the
server's installed provider registry. The browser cannot enumerate that registry.
Filter badges count the same matching rows as the chart, raw tables and Event ID
details. Weekly options stay available with zero counts when excluded by active
filters. Changing weeks restores that week's IIS Source/Event ID defaults while
preserving channel severity selections; Restore defaults also uses that week.
Classic names such as `IISCTLS`, `IISLOG`, `W3SVC`, `W3SVC-WP`, and `WAS-LA`
are recognized alongside modern provider names.
Source labels are managed separately from provider identities in
`src/features/logs/reference/event-source-display.json`. For example,
`Microsoft-Windows-IIS-IISReset` and its verified classic alias `IISCTLS`
display as `IIS-IISReset`. The mapping also covers IIS worker processes,
W3SVC, management, logging, performance counters, and WAS. The previously
missing W3C Logging Service (`Microsoft-Windows-W3LOGSVC` / `W3LOGSVC`) and
performance-counter alias `W3Ctrs` are included. Unverified spellings such as
`IIS-W3SVCLog` are not guessed to be aliases of another provider.

Rendered Provider text in the file is retained and used when it is not merely
a known identity/alias. Unknown providers keep their original names; no global
prefix removal is performed. Menus, raw rows, and Event ID details use Source
display labels, while filtering and aggregation use separate provider keys.
Provider GUID/Name, legacy EventSourceName, and rendered text remain inspectable
in the Source tooltip; raw XML is unchanged. Identical display names do not
merge unrelated provider identities. Actual event channels, not a mapping's
expected channel, determine membership; explicit non-Application/System
channels are rejected rather than reassigned using the filename.

`event-viewer-catalog.json` supplements the curated explanations with exact
provider/ID message templates exported from installed Windows metadata.
It records the generating Windows build and is not an exhaustive Windows
Server catalog. Template insertion parameters are not rendered event values,
and generic triage guidance is not a diagnosis. Unavailable, conflicting, and
unreferenced provider/ID combinations remain **Unknown**. In particular,
IIS-Logging normally writes to its own ETW channel, not Application/System;
the catalog does not relabel such events as System records.

To refresh available Application/System templates on a Windows IIS machine
without reading event records:

```powershell
.\scripts\generate-event-viewer-catalog.ps1
```

## Privacy

Only the audit request is sent: one non-blocking POST per browser session to
`${VITE_API_BASE_URL:-/api/v1}/audit/visits`, with this shape:

```json
{ "sessionId": "browser-session-uuid", "page": "/" }
```

File names, raw lines, parsed values, filters, and chart data remain in browser
memory and are discarded when the page is closed or refreshed.
