import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { getSampleConfigFiles } from '../sampleConfigs'
import { buildArchitecture } from '../topology/architecture'
import { ArchitectureDiagram } from './ArchitectureDiagram'

const [applicationHost, webConfig] = getSampleConfigFiles()
const architecture = buildArchitecture(applicationHost.config!.model!, { 'site:4': webConfig.config!.model! })
const webConfigs = [{ id: webConfig.id, name: webConfig.name, size: webConfig.size }]

function renderDiagram(onAttach = vi.fn()) {
  const { container } = render(
    <ArchitectureDiagram
      architecture={architecture}
      webConfigs={webConfigs}
      attachments={{ 'site:4': webConfig.id }}
      onAttach={onAttach}
    />,
  )
  return { onAttach, container }
}

describe('ArchitectureDiagram', () => {
  it('draws the entry layers, web and FTP sites, pools and ARR farms', () => {
    renderDiagram()
    expect(screen.getByRole('list', { name: 'Inventory' })).toHaveTextContent(/3\s*web.*2\s*FTP.*\d+\s*pools.*2\s*farms/i)
    expect(screen.getByRole('region', { name: 'Global rules' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Server-level settings' })).toBeInTheDocument()
    expect(screen.getAllByText(/^FTP site · ID/)).toHaveLength(2)
    expect(screen.getAllByText('commerce-api-farm').length).toBeGreaterThan(0)
    expect(screen.getAllByText('legacy-reports-farm').length).toBeGreaterThan(0)
  })

  it('opens a balloon with App pool, ASP.NET and IIS categories for the selected site and closes on Escape', () => {
    renderDiagram()
    const site = architecture.sites.find((candidate) => candidate.id === 'site:2')!
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${site.name}`) }))

    const balloon = screen.getByRole('dialog', { name: `${site.name} settings changed from IIS defaults` })
    expect(within(balloon).getByRole('button', { name: /App pool/ })).toBeInTheDocument()
    expect(within(balloon).getByRole('button', { name: /IIS/ })).toBeInTheDocument()
    expect(within(balloon).getByRole('button', { name: 'Expand all' })).toBeInTheDocument()

    fireEvent.keyDown(balloon, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('selects a virtual directory and shows its endpoint URL', () => {
    const { container } = renderDiagram()
    const site = architecture.sites.find((candidate) => candidate.tree.some((row) => row.id.startsWith('vdir:')))!
    const row = site.tree.find((candidate) => candidate.id.startsWith('vdir:'))!
    const find = () => container.querySelector<HTMLElement>(`[data-arch-id="${row.id}"]`)
    if (!find()) {
      const list = screen.getByRole('list', { name: `${site.name} applications and virtual directories` })
      fireEvent.click(within(list.parentElement!).getByRole('button', { name: /Show \d+ more/ }))
    }
    fireEvent.click(find()!)
    expect(screen.getByRole('dialog')).toHaveTextContent(row.url)
  })

  it('merges an attached web.config into the selected scope through the file picker', () => {
    const { onAttach } = renderDiagram()
    fireEvent.click(screen.getByRole('button', { name: /^Reports Legacy/ }))
    const picker = within(screen.getByRole('dialog')).getByRole('combobox')
    expect(picker).toHaveValue(webConfig.id)
    fireEvent.change(picker, { target: { value: '' } })
    expect(onAttach).toHaveBeenCalledWith('site:4', '')
  })

  it('separates global rules from server-level settings and keeps ARR out of the inherited layers', () => {
    const { container } = renderDiagram()
    const layersIn = (region: HTMLElement) =>
      [...region.querySelectorAll<HTMLElement>('.arch-slab')].map((slab) => slab.dataset.layer)

    const global = screen.getByRole('region', { name: 'Global rules' })
    expect(layersIn(global)).toEqual(['global-rules', 'arr-routing'])
    expect(global).toHaveTextContent(/IIS Home/)
    expect(global).toHaveTextContent(/evaluated before site-level rewrite rules/)

    const server = screen.getByRole('region', { name: 'Server-level settings' })
    expect(layersIn(server)).toEqual(['ip-restrictions', 'request-filtering', 'redirect', 'url-rewrite', 'authentication'])
    expect(server).toHaveTextContent(/Inherited by every site unless the site overrides them/)

    // The gateway comes first and both tiers hang below it.
    const entry = container.querySelector<HTMLElement>('.arch-entry')!
    expect([...entry.children].map((child) => (child as HTMLElement).dataset.archId)).toEqual([
      'entry',
      'entry-global',
      'entry-server',
    ])
  })

  it('describes ARR as a server-level proxy and labels each routing rule as global or site-level', () => {
    const { container } = renderDiagram()
    const lane = container.querySelector<HTMLElement>('.arch__lane')!
    expect(within(lane).getByRole('heading', { name: 'Application Request Routing · server level' })).toBeInTheDocument()
    expect(lane).toHaveTextContent(/HTTP-level reverse proxy and load balancer/)
    expect(lane).toHaveTextContent(/A server farm on its own routes nothing/)

    expect(within(lane).getByRole('heading', { name: /Global · IIS Home/ })).toBeInTheDocument()
    expect(within(lane).getByRole('heading', { name: /Site · Commerce API/ })).toBeInTheDocument()
    expect(within(lane).getByText('Proxy archive to legacy-reports-farm')).toBeInTheDocument()
    expect(within(lane).getByText('Proxy v3 to commerce-api-farm')).toBeInTheDocument()

    fireEvent.click(within(lane).getByRole('button', { name: /^ARR routing rules/ }))
    expect(screen.getByRole('dialog', { name: /ARR routing settings changed from IIS defaults/ })).toBeInTheDocument()
  })

  it('shows the site-level ARR rule on its own site and keeps the global rule off every site', () => {
    renderDiagram()
    const api = screen.getByRole('button', { name: /^Commerce API/ }).closest('article')!
    expect(api).toHaveTextContent('Site-level ARR rule → commerce-api-farm')
    expect(within(api).getByText('Site-level layers')).toBeInTheDocument()

    const legacy = screen.getByRole('button', { name: /^Reports Legacy/ }).closest('article')!
    expect(legacy).not.toHaveTextContent(/Site-level ARR rule/)
    expect(legacy).not.toHaveTextContent('Proxy archive to legacy-reports-farm')
  })

  it('hides pools with 0 apps until Show all is switched on', () => {
    const { container } = renderDiagram()
    const unused = architecture.pools.filter((pool) => pool.appCount === 0)
    const used = architecture.pools.filter((pool) => pool.appCount > 0)
    expect(unused.length).toBeGreaterThan(0)
    const poolIds = () =>
      [...container.querySelectorAll<HTMLElement>('[data-arch-id^="pool:"]')].map((node) => node.dataset.archId)

    expect(poolIds()).toEqual(expect.arrayContaining(used.map((pool) => pool.id)))
    unused.forEach((pool) => expect(poolIds()).not.toContain(pool.id))

    const toggle = screen.getByRole('button', { name: 'Show all' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    unused.forEach((pool) => expect(poolIds()).toContain(pool.id))

    fireEvent.click(toggle)
    unused.forEach((pool) => expect(poolIds()).not.toContain(pool.id))
  })

  it('shows the request flow without lens tabs or client port chips', () => {
    renderDiagram()
    expect(screen.queryByRole('group', { name: 'Diagram lens' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Pool isolation/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Diagnostics trail/ })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Exposed ports')).not.toBeInTheDocument()
    expect(screen.getByText('Client requests')).toBeInTheDocument()
  })
})
