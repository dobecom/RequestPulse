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
        onDropFiles={vi.fn()}
        onPickFiles={onPickFiles}
      />,
    )

    expect(screen.getByRole('note')).toHaveTextContent(
      'Copy protected HTTPERR logs to Documents first.',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Select files' }))
    expect(onPickFiles).toHaveBeenCalledWith('httperr')
  })

  it('routes a drop through the DataTransfer handler without bubbling', () => {
    const onDropFiles = vi.fn()
    const onParentDrop = vi.fn()
    const dataTransfer = {
      files: [],
      items: [],
      types: ['Files'],
    } as unknown as DataTransfer

    render(
      <div onDrop={onParentDrop}>
        <DropZone
          kind="w3svc"
          title="Drop W3SVC logs"
          description="W3SVC logs"
          accent="blue"
          busy={false}
          onFiles={vi.fn()}
          onDropFiles={onDropFiles}
          onPickFiles={vi.fn().mockResolvedValue(true)}
        />
      </div>,
    )

    const dropZone = screen
      .getByRole('heading', { name: 'Drop W3SVC logs' })
      .closest('section')
    expect(dropZone).not.toBeNull()

    fireEvent.drop(dropZone!, { dataTransfer })

    expect(onDropFiles).toHaveBeenCalledWith(dataTransfer, 'w3svc')
    expect(onParentDrop).not.toHaveBeenCalled()
  })
})
