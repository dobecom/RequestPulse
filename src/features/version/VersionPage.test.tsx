import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { VersionPage } from './VersionPage'

vi.mock('../../services/versionService', () => ({
  loadVersionHistory: vi.fn().mockResolvedValue([
    {
      version: 'v1.0.0',
      description: 'Initial tracked release.',
      sourceRevision: '1234567890abcdef1234567890abcdef12345678',
      releasedAt: '2026-09-11T00:00:00.000Z',
    },
  ]),
}))

it('renders database-backed version history', async () => {
  render(<VersionPage />)

  expect(await screen.findByText('v1.0.0')).toBeInTheDocument()
  expect(screen.getByText('Initial tracked release.')).toBeInTheDocument()
  expect(screen.getByText('1234567')).toBeInTheDocument()
})
