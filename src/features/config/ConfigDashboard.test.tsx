import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConfigDashboard } from './ConfigDashboard'
import { parseConfigText } from './configParser'

const uploadedHost = `<?xml version="1.0"?>
<configuration>
  <system.applicationHost>
    <applicationPools><add name="UploadedPool" /></applicationPools>
    <sites>
      <site name="Uploaded Site" id="1">
        <application path="/" applicationPool="UploadedPool">
          <virtualDirectory path="/" physicalPath="C:\\sites\\uploaded" />
        </application>
        <bindings><binding protocol="http" bindingInformation="*:8080:" /></bindings>
      </site>
    </sites>
  </system.applicationHost>
</configuration>`

const uploadedWeb = `<?xml version="1.0"?>
<configuration><system.webServer><httpErrors errorMode="Detailed" /></system.webServer></configuration>`

describe('ConfigDashboard architecture', () => {
  it('shows the rich synthetic architecture when no configuration is loaded', () => {
    render(<ConfigDashboard files={[]} useSample />)
    expect(screen.getByRole('heading', { name: /architecture/i })).toBeInTheDocument()
    expect(screen.getAllByText('commerce-api-farm').length).toBeGreaterThan(0)
  })

  it('replaces the sample with the uploaded applicationHost.config', () => {
    const upload = parseConfigText(uploadedHost, 'applicationHost.config', uploadedHost.length, 'config-applicationhost')
    render(<ConfigDashboard files={[upload]} />)
    expect(screen.getAllByText('Uploaded Site').length).toBeGreaterThan(0)
    expect(screen.queryByText('commerce-api-farm')).not.toBeInTheDocument()
    expect(screen.getAllByText(/:8080|8080/).length).toBeGreaterThan(0)
  })

  it('asks for applicationHost.config when only a web.config is loaded', () => {
    const web = parseConfigText(uploadedWeb, 'web.config', uploadedWeb.length, 'config-web')
    render(<ConfigDashboard files={[web]} />)
    expect(screen.getByText('Architecture diagram needs applicationHost.config')).toBeInTheDocument()
  })

  it('keeps the empty state without files or sample', () => {
    render(<ConfigDashboard files={[]} />)
    expect(screen.getByText('No IIS configuration files loaded')).toBeInTheDocument()
  })

  it('leads with the schema analysis note, then the jump links, then the diagram', () => {
    render(<ConfigDashboard files={[]} useSample />)
    const note = screen.getByText('Local schema-based analysis')
    const nav = screen.getByRole('navigation', { name: 'Jump to schema comparison findings' })
    const diagram = screen.getByRole('heading', { name: 'IIS request architecture' })
    const follows = (first: Node, second: Node) =>
      Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(follows(note, nav)).toBe(true)
    expect(follows(nav, diagram)).toBe(true)
  })

  it('does not repeat the diagram inventory as stat cards or topology lists', () => {
    render(<ConfigDashboard files={[]} useSample />)
    ;['WAS process model', 'IIS topology', 'Global modules', 'ARR proxy'].forEach((text) =>
      expect(screen.queryByText(text)).not.toBeInTheDocument(),
    )
  })

  it('scrolls to the matching findings section from the jump links', () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    render(<ConfigDashboard files={[]} useSample />)

    fireEvent.click(screen.getByRole('button', { name: /^applicationHost\.config/ }))
    const hostSection = screen.getByRole('region', { name: 'applicationHost.config findings' })
    expect(scrollIntoView).toHaveBeenLastCalledWith(expect.objectContaining({ block: 'start' }))
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(hostSection)
    expect(hostSection).toHaveFocus()

    fireEvent.click(screen.getByRole('button', { name: /^web\.config/ }))
    const webSection = screen.getByRole('region', { name: 'web.config findings' })
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(webSection)
    expect(webSection).toHaveFocus()
  })

  it('keeps the web.config jump link available when no web.config is loaded', () => {
    const upload = parseConfigText(uploadedHost, 'applicationHost.config', uploadedHost.length, 'config-applicationhost')
    render(<ConfigDashboard files={[upload]} />)
    expect(screen.getByRole('button', { name: /^web\.config/ })).toHaveTextContent('not loaded')
    expect(screen.getByText('No matching configuration file is loaded.')).toBeInTheDocument()
  })
})
