import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DropZone } from './DropZone'

describe('DropZone', () => {
  it('shows inline protected-folder guidance without blocking the picker', () => {
    const onPickFiles = vi.fn().mockResolvedValue(true)
    render(
      <DropZone
        kind="httperr"
        title="Drop HTTPERR logs"
        description="HTTPERR logs"
        notice="Copy protected HTTPERR logs to Documents first."
        accent="teal"
        busy={false}
        onFiles={vi.fn()}
        onPickFiles={onPickFiles}
      />,
    )

    expect(screen.getByRole('note')).toHaveTextContent(
      'Copy protected HTTPERR logs to Documents first.',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Select files' }))
    expect(onPickFiles).toHaveBeenCalledWith('httperr')
  })
})
