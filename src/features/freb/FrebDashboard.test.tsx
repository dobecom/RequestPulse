import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { sampleFrebFiles } from './sampleFreb'
import { FrebDashboard } from './FrebDashboard'

describe('FrebDashboard', () => {
  it('selects the first trace by default and changes the pipeline guidance', () => {
    render(<FrebDashboard files={sampleFrebFiles} />)

    const first = screen.getByRole('button', { name: /Sample-fr000101.xml/ })
    const second = screen.getByRole('button', { name: /Sample-fr000102.xml/ })

    expect(first).toHaveAttribute('aria-pressed', 'true')
    expect(
      screen.getByRole('heading', {
        name: /401\.503 at IpRestrictionModule/,
      }),
    ).toBeInTheDocument()

    fireEvent.click(second)

    expect(second).toHaveAttribute('aria-pressed', 'true')
    expect(
      screen.getByRole('heading', {
        name: /404\.7 at RequestFilteringModule/,
      }),
    ).toBeInTheDocument()
  })

  it('deduplicates matching errors and orders the most frequent first', () => {
    const duplicate = {
      ...sampleFrebFiles[0],
      id: 'sample:freb:duplicate',
      name: 'Sample-fr000106.xml',
    }

    render(<FrebDashboard files={[...sampleFrebFiles, duplicate]} />)

    const firstSummary = screen.getByText('2 occurrences').closest('article')
    expect(firstSummary).toHaveTextContent('IpRestrictionModule')
  })
})
