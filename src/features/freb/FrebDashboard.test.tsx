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

  it('distinguishes observed, inferred, failed, and unobserved stages', () => {
    render(<FrebDashboard files={sampleFrebFiles} />)

    fireEvent.click(
      screen.getByRole('button', { name: /Sample-fr000103.xml/ }),
    )

    expect(screen.getByText('Observed in trace')).toBeInTheDocument()
    expect(screen.getByText('Inferred before failure')).toBeInTheDocument()

    expect(screen.getByText('HTTP.sys → IIS').closest('article')).toHaveClass(
      'is-observed',
    )
    const inferredStages = [
      'Begin request',
      'Authenticate',
      'Authorize',
      'Resolve cache',
    ]
    inferredStages.forEach((label) => {
      expect(screen.getByText(label).closest('article')).toHaveClass(
        'is-inferred',
      )
    })
    expect(screen.getByText('Map handler').closest('article')).toHaveClass(
      'is-error',
    )
    expect(screen.getByText('Acquire state').closest('article')).not.toHaveClass(
      'is-observed',
      'is-inferred',
      'is-error',
    )
  })

  it('marks unobserved stages in a successful trace as skipped', () => {
    const successfulFile = {
      ...sampleFrebFiles[0],
      id: 'sample:freb:success',
      name: 'Sample-fr-success.xml',
      freb: {
        ...sampleFrebFiles[0].freb!,
        statusCode: '200',
        triggerStatusCode: '200',
        error: undefined,
        events: [
          sampleFrebFiles[0].freb!.events[0],
          {
            ...sampleFrebFiles[0].freb!.events[0],
            index: 1,
            opcode: 'GENERAL_REQUEST_END',
            stageId: 'end-request' as const,
          },
        ],
      },
    }

    render(<FrebDashboard files={[successfulFile]} />)

    expect(
      screen.getByText('Skipped / not observed on success'),
    ).toBeInTheDocument()
    expect(screen.getByText('HTTP.sys → IIS').closest('article')).toHaveClass(
      'is-observed',
    )
    expect(screen.getByText('Authorize').closest('article')).toHaveClass(
      'is-skipped',
    )
    expect(screen.getByText('Acquire state').closest('article')).toHaveClass(
      'is-skipped',
    )
    expect(screen.getByText('Log request').closest('article')).toHaveClass(
      'is-skipped',
    )
    expect(screen.getByText('End request').closest('article')).toHaveClass(
      'is-observed',
    )
  })
})
