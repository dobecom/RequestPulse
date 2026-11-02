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
    expect(screen.getByRole('list', { name: 'Entry point layers, in request order' })).toBeInTheDocument()
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

  it('shows the request flow without lens tabs or client port chips', () => {
    renderDiagram()
    expect(screen.queryByRole('group', { name: 'Diagram lens' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Pool isolation/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Diagnostics trail/ })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Exposed ports')).not.toBeInTheDocument()
    expect(screen.getByText('Client requests')).toBeInTheDocument()
  })
})
