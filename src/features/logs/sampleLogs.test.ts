import { describe, expect, it } from 'vitest'
import { createSampleLogFiles } from './sampleLogs'

describe('sample logs', () => {
  it('creates reusable synthetic data for three UTC days', () => {
    const samples = createSampleLogFiles(
      Date.parse('2026-09-11T09:00:00.000Z'),
    )

    const allGroups = [samples.w3svc, samples.httperr, samples.events]
    allGroups.forEach((files) => {
      const days = new Set(files.flatMap((file) => file.rows.map((row) => row.utcDay)))
      expect([...days].sort()).toEqual([
        '2026-09-09',
        '2026-09-10',
        '2026-09-11',
      ])
      expect(files.every((file) => file.id.startsWith('sample:'))).toBe(true)
      expect(files.every((file) => file.warnings.length === 0)).toBe(true)
    })

    expect(samples.w3svc[0].rows.length).toBeGreaterThanOrEqual(90)
    expect(samples.httperr.length).toBe(6)
    expect(samples.events.map((file) => file.kind).sort()).toEqual([
      'event-application',
      'event-system',
    ])
  })
})
