import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HomePage } from './HomePage'

describe('HomePage visitor metrics', () => {
  it('shows today and total counts without the Event Viewer folder warning', () => {
    render(
      <HomePage
        files={[]}
        visitorCounts={{ today: 3, total: 42, date: '2026-09-09' }}
        busy={false}
        onFiles={vi.fn()}
        onPickFiles={vi.fn().mockResolvedValue(true)}
        onRemove={vi.fn()}
        onRemoveAll={vi.fn()}
        rememberFiles={false}
        canRememberFiles={false}
        pendingRestoreCount={0}
        persistenceMessage=""
        onRememberFilesChange={vi.fn()}
        onRestoreFiles={vi.fn()}
      />,
    )

    expect(screen.getByText('Visitors')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('UTC · 2026-09-09')).toBeInTheDocument()
    expect(
      screen.queryByText(/winevt\\logs|copy or export application/i),
    ).not.toBeInTheDocument()
  })
})
