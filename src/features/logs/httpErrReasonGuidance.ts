import { valueCounts } from './filtering'
import type { LogRow } from './types'

export const HTTPERR_REASON_SOURCE =
  'Microsoft HTTP Server API: Types of Errors Logged by the HTTP Server API'

export const HTTPERR_REASON_SOURCE_URL =
  'https://learn.microsoft.com/windows/win32/http/types-of-errors-logged-by-the-http-server-api'

interface HttpErrReasonGuidance {
  description: string
  recommendation: string
}

export interface HttpErrReasonInsight extends HttpErrReasonGuidance {
  reason: string
  count: number
}

const reasonGuidance: Record<string, HttpErrReasonGuidance> = {
  AppOffline: {
    description:
      'HTTP.sys returned 503 because application errors caused the application to be taken offline.',
    recommendation:
      'Review IIS and application event logs, identify the failure that took the application offline, and restore it only after correcting that failure.',
  },
  AppPoolTimer: {
    description:
      'HTTP.sys returned 503 because the application pool process was too busy to accept the request.',
    recommendation:
      'Check worker-process CPU, memory, blocked requests, queue pressure, and application pool health before changing timeout settings.',
  },
  AppShutdown: {
    description:
      'HTTP.sys returned 503 because the application shut down in response to an administrator policy.',
    recommendation:
      'Correlate the timestamp with application pool recycling, scheduled shutdowns, configuration changes, and WAS events.',
  },
  BadRequest: {
    description: 'HTTP.sys encountered a parsing error while processing the request.',
    recommendation:
      'Inspect the request method, URL, headers, and raw client traffic for malformed syntax.',
  },
  Connection_Abandoned_By_AppPool: {
    description:
      'An application pool worker process crashed or closed its request-queue handle while a request was pending.',
    recommendation:
      'Correlate the timestamp with WAS and Application events, application pool recycling, and w3wp crash dumps.',
  },
  Connection_Dropped: {
    description:
      'The client disconnected or reset the connection before IIS returned logging data within the logging time limit.',
    recommendation:
      'Check client, proxy, load balancer, and network disconnects. Do not assume the response body was never received.',
  },
  ConnLimit: {
    description:
      'HTTP.sys returned 503 because the configured site connection limit was reached.',
    recommendation:
      'Review the site connection limit, concurrent connection volume, request duration, and upstream traffic spikes.',
  },
  Disabled: {
    description:
      'HTTP.sys returned 503 because an administrator had taken the application offline.',
    recommendation:
      'Verify the site and application pool state and correlate the event with administrative or deployment activity.',
  },
  EntityTooLarge: {
    description: 'The request entity exceeded the maximum allowed size.',
    recommendation:
      'Confirm the expected request-body size and review the applicable HTTP.sys and IIS request-size limits before increasing them.',
  },
  FieldLength: {
    description: 'An HTTP field exceeded its allowed length.',
    recommendation:
      'Inspect request headers and the URL for unusually large values, then review the applicable HTTP.sys header limits.',
  },
  Forbidden: {
    description:
      'HTTP.sys encountered a forbidden element or character sequence while parsing the request.',
    recommendation:
      'Capture the raw request and correct the client or intermediary that generated the invalid sequence.',
  },
  Header: {
    description: 'HTTP.sys encountered a parsing error in an HTTP header.',
    recommendation:
      'Inspect raw request headers for invalid names, separators, encoding, line endings, or duplicate framing headers.',
  },
  Hostname: {
    description: 'HTTP.sys encountered a parsing error in the host name.',
    recommendation:
      'Validate the Host header, URL formatting, proxy rewriting, and DNS name characters sent by the client.',
  },
  Internal: {
    description: 'HTTP.sys encountered an internal server error and returned HTTP 500.',
    recommendation:
      'Correlate with System and HTTP Service events and check resource pressure or HTTP.sys failures at the same timestamp.',
  },
  'Invalid_CR/LF': {
    description: 'HTTP.sys encountered an invalid carriage-return or line-feed sequence.',
    recommendation:
      'Inspect the raw request for malformed header line endings or request-smuggling patterns and correct the originating client or proxy.',
  },
  LengthRequired: {
    description: 'A required request length value was missing.',
    recommendation:
      'Verify that the client sends a valid Content-Length or supported transfer framing for requests with a body.',
  },
  'N/A': {
    description:
      'HTTP.sys returned 503 because of an internal failure such as unsuccessful memory allocation.',
    recommendation:
      'Check System and HTTP Service events, memory pressure, nonpaged pool usage, and server resource exhaustion.',
  },
  'N/I': {
    description:
      'HTTP.sys returned 501, or 503 for an unsupported or unknown transfer encoding.',
    recommendation:
      'Inspect the request transfer encoding and ensure the client or proxy uses HTTP framing supported by the server.',
  },
  Number: {
    description: 'HTTP.sys encountered a parsing error while processing a number.',
    recommendation:
      'Inspect numeric request fields such as Content-Length for invalid, overflowing, or conflicting values.',
  },
  Precondition: {
    description: 'A required request precondition was missing.',
    recommendation:
      'Inspect conditional headers and application expectations, then correct the client request prerequisites.',
  },
  QueueFull: {
    description:
      'HTTP.sys returned 503 because the application request queue was full.',
    recommendation:
      'Investigate slow or blocked requests, worker-process health, queue length, CPU and memory before raising queue limits.',
  },
  RequestLength: {
    description: 'The total request length exceeded an allowed limit.',
    recommendation:
      'Inspect the request line, headers, and body size, then review the relevant HTTP.sys and IIS request limits.',
  },
  Timer_AppPool: {
    description:
      'The request waited too long in the application pool queue before a server application accepted it.',
    recommendation:
      'Check application pool availability, startup or recycle delays, blocked workers, queue depth, and WAS events.',
  },
  Timer_ConnectionIdle: {
    description:
      'The connection remained idle until the configured connection timeout expired.',
    recommendation:
      'Usually treat isolated entries as routine keep-alive cleanup. Investigate only when counts align with user impact, slow clients, proxies, or network issues.',
  },
  Timer_EntityBody: {
    description:
      'The request entity body did not arrive before the entity-body timer expired.',
    recommendation:
      'Check slow uploads, client disconnects, proxy buffering, packet loss, and whether the request body is being sent continuously.',
  },
  Timer_HeaderWait: {
    description:
      'HTTP.sys did not receive and parse the complete request headers before the header timer expired.',
    recommendation:
      'Check slow or incomplete clients, network loss, proxy behavior, and possible slow-header attacks.',
  },
  Timer_MinBytesPerSecond: {
    description:
      'The client received the response more slowly than the configured minimum send rate.',
    recommendation:
      'Check slow clients, constrained networks, proxies, and large responses before changing the minimum send-rate protection.',
  },
  Timer_Response: {
    description: 'This HTTP Server API reason is reserved and is not used.',
    recommendation:
      'Confirm the parsed field layout and preserve the raw row if this value appears unexpectedly.',
  },
  URL: {
    description: 'HTTP.sys encountered a parsing error while processing the URL.',
    recommendation:
      'Inspect the raw URL for invalid encoding, characters, escaping, or proxy rewriting.',
  },
  URL_Length: {
    description: 'The URL exceeded the maximum allowed length.',
    recommendation:
      'Reduce the generated URL or query string and review URL limits only if the larger request is intentional and safe.',
  },
  Verb: {
    description: 'HTTP.sys encountered a parsing error while processing the HTTP method.',
    recommendation:
      'Inspect the raw method token and correct the client or proxy that sent an invalid verb.',
  },
  'Version_N/S': {
    description: 'HTTP.sys rejected an unsupported HTTP version and returned HTTP 505.',
    recommendation:
      'Verify the client and intermediary protocol version and remove malformed or unsupported version tokens.',
  },
}

const unknownReasonGuidance: HttpErrReasonGuidance = {
  description:
    'This reason phrase is not included in the bundled Microsoft HTTP Server API reason table.',
  recommendation:
    'Preserve the raw row and correlate it with HTTP Service, IIS, WAS, application, and network evidence at the same UTC timestamp.',
}

export function getHttpErrReasonGuidance(reason: string) {
  return reasonGuidance[reason] ?? unknownReasonGuidance
}

export function getHttpErrReasonInsights(
  rows: LogRow[],
  selectedReasons: string[],
  limit = 3,
): HttpErrReasonInsight[] {
  const counts = new Map(valueCounts(rows, 's-reason').map(({ value, count }) => [
    value,
    count,
  ]))
  const reasons = selectedReasons.length
    ? selectedReasons
        .map((reason) => ({ value: reason, count: counts.get(reason) ?? 0 }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    : valueCounts(rows, 's-reason').slice(0, limit)

  return reasons.map(({ value, count }) => ({
    reason: value || '(empty)',
    count,
    ...getHttpErrReasonGuidance(value),
  }))
}
