import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MultiSelect } from './MultiSelect'

const renderSelect = () => {
  const onChange = vi.fn()
  render(
    <div>
      <MultiSelect
        label="Status"
        options={[
          { value: '200', count: 4 },
          { value: '500', count: 1 },
        ]}
        selected={[]}
        onChange={onChange}
      />
      <button type="button">Outside control</button>
    </div>,
  )
  return { onChange }
}

describe('MultiSelect', () => {
  it('closes when the user clicks outside', () => {
    renderSelect()
    const summary = screen.getByText('Status').closest('summary')
    const details = summary?.closest('details')

    fireEvent.click(summary!)
    expect(details).toHaveAttribute('open')

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside control' }))
    expect(details).not.toHaveAttribute('open')
  })

  it('closes when focus moves outside and supports Escape', () => {
    renderSelect()
    const summary = screen.getByText('Status').closest('summary')
    const details = summary?.closest('details')
    const outside = screen.getByRole('button', { name: 'Outside control' })

    fireEvent.click(summary!)
    fireEvent.focusIn(outside)
    expect(details).not.toHaveAttribute('open')

    fireEvent.click(summary!)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(details).not.toHaveAttribute('open')
    expect(summary).toHaveFocus()
  })

  it('stays open while selecting an option', () => {
    const { onChange } = renderSelect()
    const summary = screen.getByText('Status').closest('summary')
    const details = summary?.closest('details')

    fireEvent.click(summary!)
    fireEvent.click(screen.getByRole('checkbox', { name: /500/ }))

    expect(onChange).toHaveBeenCalledWith(['500'])
    expect(details).toHaveAttribute('open')
  })
})
