import { render, screen, within } from '@testing-library/react'
import { vi } from 'vitest'
import { VersionPage } from './VersionPage'
import { loadVersionHistory } from '../../services/versionService'

vi.mock('../../services/versionService', () => ({
  loadVersionHistory: vi.fn().mockResolvedValue([
    {
      version: 'v1.0.0',
      description: 'Initial tracked release.',
      sourceRevision: '1234567890abcdef1234567890abcdef12345678',
      releasedAt: '2026-09-11T23:59:58.000Z',
    },
  ]),
}))

it('renders database-backed version history', async () => {
  render(<VersionPage />)

  expect(await screen.findByText('v1.0.0')).toBeInTheDocument()
  expect(screen.getByText('Initial tracked release.')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '[Feature]' })).toBeInTheDocument()
  expect(screen.getByText('2026-09-11')).toHaveAttribute('dateTime', '2026-09-11')
  expect(screen.queryByText(/23:59|1234567/)).not.toBeInTheDocument()
  expect(document.querySelector('code')).not.toBeInTheDocument()
})

it('renders each change as a list item under its explicit category', async () => {
  vi.mocked(loadVersionHistory).mockResolvedValueOnce([
    {
      version: 'v1.5.1',
      description:
        '[Fix]\n- Corrects chart values\n- Fixes filter reset\n[Improve]\n- Simplifies navigation',
      sourceRevision: null,
      releasedAt: '2026-11-03T05:30:00.000Z',
    },
  ])
  render(<VersionPage />)

  const fixes = await screen.findByRole('region', { name: 'v1.5.1 Fix' })
  expect(within(fixes).getAllByRole('listitem').map((item) => item.textContent))
    .toEqual(['Corrects chart values', 'Fixes filter reset'])
  const improvements = screen.getByRole('region', { name: 'v1.5.1 Improve' })
  expect(within(improvements).getByRole('listitem'))
    .toHaveTextContent('Simplifies navigation')
  expect(screen.queryByRole('heading', { name: '[Chore]' })).not.toBeInTheDocument()
})
