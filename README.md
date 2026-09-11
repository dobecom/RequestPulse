# RequestPulse

RequestPulse is a browser-only React application for exploring IIS W3SVC access
logs, HTTP.sys HTTPERR logs, Windows Event Viewer evidence, and IIS
configuration. Parsing, filtering, aggregation, configuration comparison, and
raw-row navigation happen locally in the browser. Raw evidence is never sent to
an API.

## Features

- Separate W3SVC and HTTPERR drag/drop zones plus file pickers and workspace drop
- Side-by-side Event Viewer and IIS configuration upload areas
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
- Paginated raw tables that avoid rendering an entire large log into the DOM
- Responsive Microsoft/Fluent-inspired design using Segoe UI and CSS variables
- Best-effort session visit audit containing only `sessionId` and `page`

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

## Privacy

Only the audit request is sent: one non-blocking POST per browser session to
`${VITE_API_BASE_URL:-/api/v1}/audit/visits`, with this shape:

```json
{ "sessionId": "browser-session-uuid", "page": "/" }
```

File names, raw lines, parsed values, filters, and chart data remain in browser
memory and are discarded when the page is closed or refreshed.
