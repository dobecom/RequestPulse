import { parseReleaseNotes } from './releaseNotes'

it('groups inline release metadata in category order and merges repeated headings', () => {
  expect(parseReleaseNotes(
    '[Chore] - Refreshes release notes; - Hides commit IDs [Security] - Hardens headers [Feature] - Adds export [Improve] - Simplifies navigation [Fix] - Corrects values [Chore] - Updates documentation',
  )).toEqual([
    { category: 'Fix', items: ['Corrects values'] },
    { category: 'Improve', items: ['Simplifies navigation'] },
    { category: 'Feature', items: ['Adds export'] },
    { category: 'Security', items: ['Hardens headers'] },
    { category: 'Chore', items: ['Refreshes release notes', 'Hides commit IDs', 'Updates documentation'] },
  ])
})

it('accepts CRLF bullets and preserves explicit categories without splitting sentences', () => {
  expect(parseReleaseNotes(
    '[Fix]\r\n- Corrects chart values. Preserves raw data.\r\n* Fixes filter reset\r\n\r\n[Chore]\r\n- Updates documentation',
  )).toEqual([
    { category: 'Fix', items: ['Corrects chart values. Preserves raw data.', 'Fixes filter reset'] },
    { category: 'Chore', items: ['Updates documentation'] },
  ])
})

it('splits legacy mixed changes without breaking configuration names or decimals', () => {
  expect(parseReleaseNotes(
    'Fixes dedicated log drop zones and improves FREB pipeline evidence states. Adds a 2.5D diagram with web.config support; adds preview metadata.',
  )).toEqual([
    { category: 'Fix', items: ['Fixes dedicated log drop zones'] },
    { category: 'Improve', items: ['improves FREB pipeline evidence states.'] },
    { category: 'Feature', items: ['Adds a 2.5D diagram with web.config support', 'adds preview metadata.'] },
  ])
})

it('retains untagged legacy content and omits empty sections', () => {
  expect(parseReleaseNotes('Reworks routing. Unreferenced farms are idle.')).toEqual([
    { category: 'Improve', items: ['Reworks routing.', 'Unreferenced farms are idle.'] },
  ])
  expect(parseReleaseNotes('[Fix]\n\n[Chore]')).toEqual([])
  expect(parseReleaseNotes('   ')).toEqual([])
})
