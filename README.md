# RequestPulse

RequestPulse is a browser-only React application for exploring IIS W3SVC access
logs and HTTP.sys HTTPERR logs. Parsing, filtering, aggregation, and raw-row
navigation happen locally in the browser. Raw log content is never sent to an
API.

## Features

- Separate W3SVC and HTTPERR drag/drop zones plus file pickers and workspace drop
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

The optional `VITE_API_BASE_URL` defaults to `/api/v1`. Copy `.env.example` to
`.env.local` to override it.

## Quality checks

```powershell
npm test
npm run lint
npm run build
```

## Container

The image uses Node 24 Alpine to build and nginx 1.29 Alpine to serve the SPA.
nginx proxies `/api/` to `requestpulse-server:3100`.

```powershell
docker build -t requestpulse .
docker run --rm -p 8080:80 requestpulse
```

Open `http://localhost:8080`. The container health endpoint is `/healthz`.

## Log recognition

- W3SVC: an active `#Fields:` header must include `cs-uri-stem` and `time-taken`.
- HTTPERR: an active `#Fields:` header must include `s-reason` and `s-queuename`.

Headers may change within a file. RequestPulse applies the active header to each
subsequent data row and preserves the original source file and line number.

## Privacy

Only the audit request is sent: one non-blocking POST per browser session to
`${VITE_API_BASE_URL:-/api/v1}/audit/visits`, with this shape:

```json
{ "sessionId": "browser-session-uuid", "page": "/" }
```

File names, raw lines, parsed values, filters, and chart data remain in browser
memory and are discarded when the page is closed or refreshed.
