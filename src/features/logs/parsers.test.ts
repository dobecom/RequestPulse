import { describe, expect, it } from 'vitest'
import { detectLogKind, parseBrowserFile, parseLogText } from './parsers'

const w3Text = `#Software: Microsoft Internet Information Services 10.0
#Version: 1.0
#Date: 2026-09-03 00:00:00
#Fields: date time s-ip cs-method cs-uri-stem sc-status time-taken
2026-09-03 00:00:01 10.0.0.1 GET / 200 12
2026-09-03 00:01:00 10.0.0.1 POST /api/orders 500 130
#Fields: date time cs-method cs-uri-stem time-taken sc-status cs(User-Agent)
2026-09-03 00:02:00 GET /health 3 200 Agent
`

const httpErrText = `#Software: Microsoft HTTP Server API 2.0
#Fields: date time c-ip c-port s-ip s-port cs-version cs-method cs-uri sc-status s-siteid s-reason s-queuename
2026-09-03 01:15:00 192.0.2.4 50000 10.0.0.1 443 HTTP/1.1 GET /slow 503 1 QueueFull AppPool
`

describe('log parser', () => {
  it('detects formats from required dynamic fields', () => {
    expect(detectLogKind(['date', 'time', 'cs-uri-stem', 'time-taken'])).toBe(
      'w3svc',
    )
    expect(detectLogKind(['date', 'time', 's-reason', 's-queuename'])).toBe(
      'httperr',
    )
    expect(detectLogKind(['date', 'time'])).toBeNull()
  })

  it('parses W3SVC rows with changing #Fields headers and UTC timestamps', () => {
    const parsed = parseLogText(w3Text, 'u_ex260903.log')
    expect(parsed.kind).toBe('w3svc')
    expect(parsed.rows).toHaveLength(3)
    expect(parsed.rows[0].timestamp).toBe(Date.parse('2026-09-03T00:00:01Z'))
    expect(parsed.rows[2].values['cs(User-Agent)']).toBe('Agent')
    expect(parsed.fields).toContain('s-ip')
    expect(parsed.fields).toContain('cs(User-Agent)')
  })

  it('parses HTTPERR and preserves its source row', () => {
    const parsed = parseLogText(httpErrText, 'httperr1.log')
    expect(parsed.kind).toBe('httperr')
    expect(parsed.rows[0]).toMatchObject({
      sourceName: 'httperr1.log',
      sourceLine: 3,
      utcDay: '2026-09-03',
    })
    expect(parsed.rows[0].values['s-reason']).toBe('QueueFull')
  })

  it('rejects a log in the wrong dedicated drop zone', () => {
    expect(() => parseLogText(httpErrText, 'httperr.log', 1, 'w3svc')).toThrow(
      /not W3SVC/i,
    )
  })

  it('rejects files without required fields', () => {
    expect(() =>
      parseLogText(
        '#Fields: date time cs-method\n2026-09-03 00:00:00 GET',
        'unknown.log',
      ),
    ).toThrow(/not recognized/i)
  })

  it('routes IIS configuration XML to the local configuration parser', async () => {
    const xml =
      '<configuration><system.web><compilation debug="true" /></system.web></configuration>'
    const file = new File([xml], 'web.config', { type: 'application/xml' })
    Object.defineProperty(file, 'text', {
      value: async () => xml,
    })

    const parsed = await parseBrowserFile(file, 'config')

    expect(parsed.kind).toBe('config-web')
    expect(parsed.config?.settings).toHaveLength(1)
  })

  it('routes FREB XML to the local failed-request parser', async () => {
    const xml = `<?xml version="1.0"?>
      <failedRequest url="https://example.test/admin" siteId="1" appPoolId="Sample" processId="100" verb="GET" failureReason="STATUS_CODE" statusCode="401.503" triggerStatusCode="401.503" timeTaken="3">
        <Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event">
          <System><Provider Name="WWW Server"/><Level>3</Level><TimeCreated SystemTime="2026-10-06T01:00:00.000Z"/><Computer>IIS01</Computer></System>
          <EventData><Data Name="ModuleName">IpRestrictionModule</Data><Data Name="HttpStatus">401</Data><Data Name="HttpSubStatus">503</Data><Data Name="ErrorCode">2147942405</Data></EventData>
          <RenderingInfo xmlns:freb="http://schemas.microsoft.com/win/2006/06/iis/freb"><Opcode>MODULE_SET_RESPONSE_ERROR_STATUS</Opcode><freb:Description Data="Notification">BEGIN_REQUEST</freb:Description><freb:Description Data="ErrorCode">Access is denied. (0x80070005)</freb:Description></RenderingInfo>
        </Event>
      </failedRequest>`
    const file = new File([xml], 'fr000001.xml', { type: 'application/xml' })
    Object.defineProperty(file, 'text', { value: async () => xml })

    const parsed = await parseBrowserFile(file, 'freb')

    expect(parsed.kind).toBe('freb')
    expect(parsed.freb?.statusCode).toBe('401.503')
    expect(parsed.freb?.error).toMatchObject({
      moduleName: 'IpRestrictionModule',
      stageId: 'begin-request',
      errorCode: '0x80070005',
    })
  })
})
