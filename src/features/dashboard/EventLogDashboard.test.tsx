import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { LogRow, ParsedLogFile } from '../logs/types'
import { EventLogDashboard } from './EventLogDashboard'
import { parseEventXmlText } from '../logs/eventLogParser'

vi.mock('./EventTimelineChart', () => ({
  EventTimelineChart: () => null,
}))

const eventRow = (
  id: string,
  kind: 'event-application' | 'event-system',
  source: string,
  eventId: string,
): LogRow => ({
  id,
  kind,
  sourceName: `${kind}.evtx`,
  sourceLine: 1,
  timestamp: Date.parse('2026-09-09T01:00:00Z'),
  utcDay: '2026-09-09',
  values: {
    level: 'Error',
    source,
    'event-id': eventId,
    'record-id': id,
    message: `${kind} message`,
  },
  raw: '',
})

const files: ParsedLogFile[] = [
  {
    id: 'application-file',
    name: 'Application.evtx',
    kind: 'event-application',
    fields: [],
    rows: [
      eventRow(
        'application-row',
        'event-application',
        'Application Error',
        '1000',
      ),
    ],
    warnings: [],
    size: 1,
  },
  {
    id: 'system-file',
    name: 'System.evtx',
    kind: 'event-system',
    fields: [],
    rows: [
      eventRow('system-row', 'event-system', 'Microsoft-Windows-WAS', '5002'),
    ],
    warnings: [],
    size: 1,
  },
]

describe('EventLogDashboard table widths', () => {
  it('scopes filter options, badges and defaults to the selected week and counts only visible matches', () => {
    const older = (row: LogRow): LogRow => ({
      ...row,
      timestamp: Date.parse('2026-09-02T01:00:00Z'),
      utcDay: '2026-09-02',
    })
    const warning = eventRow('new-warning', 'event-application', 'Application Error', '1000')
    warning.values.level = 'Warning'
    const channelFiles = [{
      ...files[0],
      rows: [
        ...Array.from({ length: 3 }, (_, index) =>
          older(eventRow(`old-${index}`, 'event-application', 'Application Error', '1000'))),
        older(eventRow('old-aspnet', 'event-application', 'ASP.NET 4.0.30319.0', '1309')),
        eventRow('new-error', 'event-application', 'Application Error', '1000'),
        warning,
        eventRow('new-ancm', 'event-application', 'IIS AspNetCore Module V2', '99999'),
      ],
    }, {
      ...files[1],
      rows: [
        older(eventRow('old-was', 'event-system', 'Microsoft-Windows-WAS', '5002')),
        eventRow('new-reset-1', 'event-system', 'IIS-IISReset', '3201'),
        eventRow('new-reset-2', 'event-system', 'IIS-IISReset', '3201'),
      ],
    }]
    render(<EventLogDashboard files={channelFiles} />)
    const application = screen.getByRole('group', { name: 'Application filters' })
    const system = screen.getByRole('group', { name: 'System filters' })
    const appTable = within(screen.getByRole('heading', { name: 'Application raw data' }).closest('section')!)
    const sysTable = within(screen.getByRole('heading', { name: 'System raw data' }).closest('section')!)
    const appDetails = within(screen.getByRole('heading', { name: 'Application Event IDs' }).closest('section')!)
    const sysDetails = within(screen.getByRole('heading', { name: 'System Event IDs' }).closest('section')!)
    const menu = (group: HTMLElement, name: string) =>
      within(within(group).getByText(name).closest('details')!)
    const badge = (group: HTMLElement, name: string, value: string) =>
      menu(group, name).getByText(value).closest('label')!.querySelector('.count-badge')
    const openMenus = () => {
      for (const [group, name] of [
        [application, 'Application Source'], [application, 'Application Event ID'],
        [system, 'System Source'], [system, 'System Event ID'],
      ] as const) {
        const summary = within(group).getByText(name).closest('summary')!
        if (summary.getAttribute('aria-expanded') !== 'true') fireEvent.click(summary)
      }
    }
    const appSource = () => menu(application, 'Application Source')
    const appIds = () => menu(application, 'Application Event ID')
    const sysSource = () => menu(system, 'System Source')
    openMenus()
    expect(badge(application, 'Application Source', 'Application Error')).toHaveTextContent(/^2$/)
    expect(badge(application, 'Application Event ID', '1000')).toHaveTextContent(/^2$/)
    expect(badge(system, 'System Source', 'IIS-IISReset')).toHaveTextContent(/^2$/)
    expect(badge(system, 'System Event ID', '3201')).toHaveTextContent(/^2$/)
    expect(appSource().queryByText('ASP.NET 4.0.30319.0')).not.toBeInTheDocument()
    expect(appIds().queryByText('1309')).not.toBeInTheDocument()
    expect(sysSource().queryByText('Microsoft-Windows-WAS')).not.toBeInTheDocument()
    expect(appTable.getByText('1–3 of 3')).toBeInTheDocument()
    expect(sysTable.getByText('1–2 of 2')).toBeInTheDocument()

    fireEvent.click(appTable.getByRole('button', { name: 'Warn' }))
    expect(badge(application, 'Application Source', 'Application Error')).toHaveTextContent(/^1$/)
    expect(badge(application, 'Application Event ID', '1000')).toHaveTextContent(/^1$/)
    expect(badge(system, 'System Event ID', '3201')).toHaveTextContent(/^2$/)
    expect(appDetails.getByText('[Application Error] Event ID 1000').closest('summary')).toHaveTextContent('1 event')
    fireEvent.click(appSource().getByRole('checkbox', { name: /Application Error/ }))
    expect(badge(application, 'Application Source', 'Application Error')).toHaveTextContent(/^0$/)
    expect(badge(application, 'Application Event ID', '1000')).toHaveTextContent(/^0$/)
    expect(appTable.getByText('1–1 of 1')).toBeInTheDocument()
    fireEvent.click(appIds().getByRole('checkbox', { name: /99999/ }))
    expect(badge(application, 'Application Source', 'IIS AspNetCore Module V2')).toHaveTextContent(/^0$/)
    expect(appTable.getByText('0 rows')).toBeInTheDocument()
    expect(appDetails.getByText('No events match the selected week and filters in this channel.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '2026/08/27-2026/09/02' }))
    openMenus()
    expect(badge(application, 'Application Source', 'Application Error')).toHaveTextContent(/^3$/)
    expect(badge(application, 'Application Event ID', '1000')).toHaveTextContent(/^3$/)
    expect(badge(application, 'Application Event ID', '1309')).toHaveTextContent(/^1$/)
    expect(appSource().getByRole('checkbox', { name: /Application Error/ })).toBeChecked()
    expect(appSource().getByRole('checkbox', { name: /ASP.NET/ })).toBeChecked()
    expect(appSource().queryByText('IIS AspNetCore Module V2')).not.toBeInTheDocument()
    expect(appIds().queryByText('99999')).not.toBeInTheDocument()
    expect(sysSource().queryByText('IIS-IISReset')).not.toBeInTheDocument()
    expect(badge(system, 'System Source', 'Microsoft-Windows-WAS')).toHaveTextContent(/^1$/)
    expect(appTable.getByRole('button', { name: 'Warn' })).toHaveAttribute('aria-pressed', 'false')
    expect(appTable.getByText('1–4 of 4')).toBeInTheDocument()
    expect(appDetails.getByText('[Application Error] Event ID 1000').closest('summary')).toHaveTextContent('3 events')
    expect(sysDetails.getByText('[Microsoft-Windows-WAS] Event ID 5002').closest('summary')).toHaveTextContent('1 event')

    fireEvent.click(appIds().getByRole('checkbox', { name: /1309/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Restore IIS troubleshooting defaults' }))
    openMenus()
    expect(appIds().getByRole('checkbox', { name: /1309/ })).toBeChecked()
    expect(appIds().queryByText('99999')).not.toBeInTheDocument()
    expect(appTable.getByText('1–4 of 4')).toBeInTheDocument()
  })

  it('uses Event Viewer Source labels while keeping parsed provider identities and channel filters intact', () => {
    const xml = (channel: string, events: Array<[string, string, string?]>) =>
      `<Events>${events.map(([provider, eventId, guid], index) => `<Event><System>
        <Provider Name="${provider}" ${guid ? `Guid="${guid}"` : ''}/>
        <EventID>${eventId}</EventID><Level>2</Level>
        <TimeCreated SystemTime="2026-10-26T01:00:00Z"/>
        <EventRecordID>${index}</EventRecordID><Channel>${channel}</Channel>
        </System><EventData><Data>Test evidence</Data></EventData></Event>`).join('')}</Events>`
    const application = parseEventXmlText(xml('Application', [
      ['Microsoft-Windows-IIS-W3SVC-WP', '2280'],
      ['W3SVC-WP', '2280'],
      ['W3Ctrs', '99999'],
      ['.NET Runtime', '1026', '{11111111-1111-1111-1111-111111111111}'],
    ]), 'Application.xml')
    const system = parseEventXmlText(xml('System', [
      ['Microsoft-Windows-IIS-IISReset', '3201', '{DA9A85BB-563D-40FB-A164-8E982EA6844B}'],
      ['IISCTLS', '3201'],
      ['Microsoft-Windows-IIS-Logging', '99999'],
      ['W3LOGSVC', '6001'],
    ]), 'System.xml')
    render(<EventLogDashboard files={[application, system]} />)
    const appFilters = within(screen.getByRole('group', { name: 'Application filters' }))
    const sysFilters = within(screen.getByRole('group', { name: 'System filters' }))
    fireEvent.click(appFilters.getByText('Application Source'))
    fireEvent.click(sysFilters.getByText('System Source'))
    const appSources = within(appFilters.getByText('Application Source').closest('details')!)
    const sysSources = within(sysFilters.getByText('System Source').closest('details')!)
    expect(appSources.getAllByRole('checkbox')).toHaveLength(3)
    expect(sysSources.getAllByRole('checkbox')).toHaveLength(3)
    expect(appSources.getByRole('checkbox', { name: /IIS-W3SVC-WP/ })).toBeChecked()
    expect(appSources.getByRole('checkbox', { name: /IIS-W3SVC-PerfCounters/ })).toBeChecked()
    expect(appSources.getByRole('checkbox', { name: /\.NET Runtime/ })).toBeChecked()
    expect(sysSources.getByRole('checkbox', { name: /IIS-IISReset/ })).toBeChecked()
    expect(sysSources.getByRole('checkbox', { name: /IIS-Logging/ })).toBeChecked()
    expect(sysSources.getByRole('checkbox', { name: /IIS-W3LOGSVC/ })).toBeChecked()
    expect(sysSources.queryByText('IISCTLS')).not.toBeInTheDocument()
    expect(appSources.queryByText('IIS-IISReset')).not.toBeInTheDocument()
    expect(sysSources.getByText('IIS-IISReset').closest('label')).toHaveClass('check-option--direct')
    expect(appSources.getByText('.NET Runtime').closest('label')).toHaveClass('check-option--related')
    const sysDetails = within(screen.getByRole('heading', { name: 'System Event IDs' }).closest('section')!)
    expect(sysDetails.getByText('[IIS-IISReset] Event ID 3201').closest('summary')).toHaveTextContent('2 events')
    expect(sysDetails.getByText('[IIS-Logging] Event ID 99999').closest('summary')).toHaveTextContent('Unknown event ID')
    const sysTable = within(screen.getByRole('heading', { name: 'System raw data' }).closest('section')!)
    expect(sysTable.getAllByText('IIS-IISReset')).toHaveLength(2)
    fireEvent.click(sysSources.getByRole('checkbox', { name: /IIS-IISReset/ }))
    expect(sysTable.queryByText('IIS-IISReset')).not.toBeInTheDocument()
    expect(sysDetails.queryByText('[IIS-IISReset] Event ID 3201')).not.toBeInTheDocument()
    expect(sysTable.getByText('IIS-Logging')).toBeInTheDocument()
    const appTable = within(screen.getByRole('heading', { name: 'Application raw data' }).closest('section')!)
    expect(appTable.getAllByText('IIS-W3SVC-WP')).toHaveLength(2)
  })

  it('shows all loaded System sources without truncating to the IIS reference', () => {
    const sources = [
      ...Array.from({ length: 110 }, (_, index) => `Other provider ${index}`),
      'IIS-W3SVC', 'IIS-Logging', 'IIS-IISReset', 'IISCTLS', 'IISLOG',
    ]
    render(<EventLogDashboard files={[{
      ...files[1],
      rows: sources.map((source, index) => eventRow(
        `source-${index}`, 'event-system', source, '99999',
      )),
    }]} />)
    const system = within(screen.getByRole('group', { name: 'System filters' }))
    fireEvent.click(system.getByText('System Source'))
    expect(within(system.getByText('System Source').closest('details')!)
      .getAllByRole('checkbox')).toHaveLength(115)
    for (const source of sources.slice(-5)) {
      const option = system.getByText(source).closest('label')!
      expect(within(option).getByRole('checkbox')).toBeChecked()
    }
    expect(within(system.getByText('Other provider 109').closest('label')!)
      .getByRole('checkbox')).not.toBeChecked()
  })

  it('keeps rankings consistent with the selected week, Event IDs, sources, and severity', () => {
    const older = (id: string) => ({
      ...eventRow(id, 'event-application', 'Application Error', '1000'),
      timestamp: Date.parse('2026-09-02T01:00:00Z'),
      utcDay: '2026-09-02',
    })
    const current = eventRow('new-error', 'event-application', 'Application Error', '1000')
    const warning = {
      ...eventRow('new-warning', 'event-application', 'Application Error', '1000'),
      values: { ...current.values, level: 'Warning', message: 'New warning' },
    }
    const channelFiles = [{
      ...files[0],
      rows: [
        older('old-1'), older('old-2'), older('old-3'), current, warning,
        eventRow('unknown', 'event-application', 'IIS AspNetCore Module V2', '99999'),
      ],
    }, {
      ...files[1],
      rows: [eventRow('reset', 'event-system', 'IIS-IISReset', '3201')],
    }]
    render(<EventLogDashboard files={channelFiles} />)
    const appList = screen.getByRole('heading', { name: 'Application Event IDs' }).closest('section')!
    const sysList = screen.getByRole('heading', { name: 'System Event IDs' }).closest('section')!
    const appTable = screen.getByRole('heading', { name: 'Application raw data' }).closest('section')!
    const appFilters = within(screen.getByRole('group', { name: 'Application filters' }))
    const count = () => within(appList).getByText('[Application Error] Event ID 1000').closest('summary')!

    expect(count()).toHaveTextContent('2 events')
    expect(within(appList).getByText('Unknown event ID')).toBeInTheDocument()
    expect(within(sysList).getByText('[IIS-IISReset] Event ID 3201')).toBeInTheDocument()
    fireEvent.click(within(appTable).getByRole('button', { name: 'Warn' }))
    expect(count()).toHaveTextContent('1 event')

    fireEvent.click(appFilters.getByText('Application Event ID'))
    fireEvent.click(appFilters.getByRole('checkbox', { name: /99999/ }))
    expect(within(appList).queryByText('Unknown event ID')).not.toBeInTheDocument()
    expect(within(appTable).queryByText('99999')).not.toBeInTheDocument()

    fireEvent.click(appFilters.getByText('Application Source'))
    fireEvent.click(appFilters.getByRole('checkbox', { name: /Application Error/ }))
    expect(within(appList).queryByText('[Application Error] Event ID 1000')).not.toBeInTheDocument()
    expect(within(sysList).getByText('[IIS-IISReset] Event ID 3201')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Restore IIS troubleshooting defaults' }))

    fireEvent.click(screen.getByRole('button', { name: '2026/08/27-2026/09/02' }))
    expect(count()).toHaveTextContent('3 events')
    expect(within(appList).queryByText('Unknown event ID')).not.toBeInTheDocument()
    expect(within(sysList).queryByText('[IIS-IISReset] Event ID 3201')).not.toBeInTheDocument()
    expect(within(appTable).getByText('1–3 of 3')).toBeInTheDocument()
  })

  it('keeps channel options, source/ID selections, and raw results independent', () => {
    const channelFiles = files.map((file) => ({
      ...file,
      rows: [
        ...file.rows,
        file.kind === 'event-application'
          ? eventRow('aspnet', 'event-application', 'ASP.NET 4.0.30319.0', '1309')
          : eventRow('was-communication', 'event-system', 'Microsoft-Windows-WAS', '5011'),
      ],
    }))
    render(<EventLogDashboard files={channelFiles} />)

    const application = within(screen.getByRole('group', { name: 'Application filters' }))
    const system = within(screen.getByRole('group', { name: 'System filters' }))
    const appTable = within(screen.getByRole('heading', { name: 'Application raw data' }).closest('section')!)
    const sysTable = within(screen.getByRole('heading', { name: 'System raw data' }).closest('section')!)

    expect(application.queryByLabelText('Microsoft-Windows-WAS')).not.toBeInTheDocument()
    expect(system.queryByLabelText('Application Error')).not.toBeInTheDocument()

    fireEvent.click(application.getByText('Application Event ID'))
    expect(application.getByRole('checkbox', { name: /1000/ })).toBeChecked()
    expect(application.getByRole('checkbox', { name: /1309/ })).toBeChecked()
    expect(application.queryByRole('checkbox', { name: /5011/ })).not.toBeInTheDocument()
    fireEvent.click(application.getByRole('checkbox', { name: /1000/ }))
    expect(appTable.queryByText('Application Error')).not.toBeInTheDocument()
    expect(sysTable.getAllByText('Microsoft-Windows-WAS')).toHaveLength(2)

    fireEvent.click(system.getByText('System Event ID'))
    fireEvent.click(system.getByRole('checkbox', { name: /5002/ }))
    expect(sysTable.queryByText('5002')).not.toBeInTheDocument()
    expect(sysTable.getByText('5011')).toBeInTheDocument()
    expect(appTable.getByText('1309')).toBeInTheDocument()

    fireEvent.click(application.getByText('Application Source'))
    fireEvent.click(application.getByRole('checkbox', { name: /Application Error/ }))
    expect(sysTable.getByText('5011')).toBeInTheDocument()
    expect(screen.queryByText('Source filter criteria')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Restore IIS troubleshooting defaults' }))
    expect(appTable.getByText('1000')).toBeInTheDocument()
    expect(sysTable.getByText('5002')).toBeInTheDocument()
  })

  it('supports Application, balanced, and System width layouts', async () => {
    render(<EventLogDashboard files={files} />)

    const applicationButton = screen.getByRole('button', {
      name: 'Restore balanced Application and System widths',
    })
    const systemButton = screen.getByRole('button', {
      name: 'Expand System raw data width',
    })
    const grid = applicationButton.closest('.event-table-grid')

    await waitFor(() => {
      expect(applicationButton).toHaveAttribute('aria-pressed', 'true')
      expect(systemButton).toHaveAttribute('aria-pressed', 'false')
      expect(grid).toHaveClass('event-table-grid--application-expanded')
    })

    fireEvent.click(applicationButton)

    expect(
      screen.getByRole('button', {
        name: 'Expand Application raw data width',
      }),
    ).toHaveAttribute('aria-pressed', 'false')
    expect(systemButton).toHaveAttribute('aria-pressed', 'false')
    expect(grid).toHaveClass('event-table-grid--balanced')

    fireEvent.click(systemButton)

    expect(
      screen.getByRole('button', {
        name: 'Expand Application raw data width',
      }),
    ).toHaveAttribute('aria-pressed', 'false')
    expect(
      screen.getByRole('button', {
        name: 'Restore balanced Application and System widths',
      }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(grid).toHaveClass('event-table-grid--system-expanded')
  })
})
