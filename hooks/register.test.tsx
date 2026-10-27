import { expect, test } from 'claude-code/testing'

const NOW = Date.parse('2026-10-27T12:00:00Z')

const USAGE = {
  startedAt: NOW,
  context: { tokens: 14000, window: 200000, percent: 7 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 6.4, resetsAt: '2026-10-27T16:50:00Z' },
    { kind: 'seven_day', percentUsed: 87, resetsAt: '2026-10-29T20:00:00Z' },
  ],
}

const BAND = {
  plugin: 'usage-battery',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

test('the band shows all three windows on both surfaces', async ($, on) => {
  on('session.usage', () => ({ value: USAGE }))
  on('clock.now', () => ({ value: NOW }))
  on('clock.every', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /^7%$/ }))?.text).toBe('7%')
    expect((await ui.find({ type: 'Text', text: /^Session/ }))?.text).toBe('Session (4h 50m)')
    expect((await ui.find({ type: 'Text', text: /^6%$/ }))?.text).toBe('6%')
    expect((await ui.find({ type: 'Text', text: /^Week/ }))?.text).toBe('Week (2d 8h)')
    expect((await ui.find({ type: 'Text', text: /^87%$/ }))?.text).toBe('87%')
    if (surface === 'terminal') {
      expect((await ui.find({ type: 'Text', text: /▮▮▮/ }))?.text).toBe('[▮▮▮]')
      expect((await ui.find({ type: 'Text', text: /▯▯▯/ }))?.text).toBe('[▯▯▯]')
    }
    await ui.unmount()
  }
})

test('a window past its reset reads empty', async ($, on) => {
  on('session.usage', () => ({
    value: { ...USAGE, rateLimits: [{ kind: 'five_hour', percentUsed: 6, resetsAt: '2026-10-27T11:00:00Z' }] },
  }))
  on('clock.now', () => ({ value: NOW }))
  on('clock.every', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /^Session/ }))?.text).toBe('Session (reset)')
  expect((await ui.find({ type: 'Text', text: /^0%$/ }))?.text).toBe('0%')
  await ui.unmount()
})

test('the band picks the longest layout that fits', async ($, on) => {
  on('session.usage', () => ({ value: USAGE }))
  on('clock.now', () => ({ value: NOW }))
  on('clock.every', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  // Terminal widths, worked out by hand: wide needs 71 cells, medium 64, small 49.
  const cases = [
    { columns: 71, first: 'Context', limit: 'Session (4h 50m)' },
    { columns: 70, first: 'Context', limit: 'Session (4h)' },
    { columns: 64, first: 'Context', limit: 'Session (4h)' },
    { columns: 63, first: 'C', limit: 'S (4h)' },
    { columns: 49, first: 'C', limit: 'S (4h)' },
    { columns: 48, first: 'C', limit: '4h' },
    { columns: 20, first: 'C', limit: '4h' },
  ]
  for (const c of cases) {
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, bodyColumns: c.columns } })
    expect((await ui.find({ type: 'Text', text: new RegExp(`^${c.first}$`) }))?.text).toBe(c.first)
    expect((await ui.find({ type: 'Text', text: new RegExp(`^${c.limit.replace(/[()]/g, '\\$&')}$`) }))?.text).toBe(c.limit)
    await ui.unmount()
  }
})

test('saved limits show dimmed until a fresh reading, which is saved', async ($, on) => {
  const saved: unknown[] = []
  on('session.usage', () => ({ value: { ...USAGE, rateLimits: [] } }))
  on('store.get', () => ({
    value: {
      fiveHour: { percent: 6, resetsAt: '2026-10-27T16:50:00Z' },
      sevenDay: { percent: 87, resetsAt: '2026-10-29T20:00:00Z' },
    },
  }))
  on('store.set', (_, e) => (saved.push(e.value), { value: undefined }))
  on('clock.now', () => ({ value: NOW }))
  on('clock.every', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', (_, e) => ({ changed: e.changed }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const before = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await before.find({ type: 'Text', text: /^Session/ }))?.text).toBe('Session (4h 50m)')
  expect((await before.find({ type: 'Text', text: /^6%$/ }))?.props.dimColor).toBe(true)
  expect((await before.find({ type: 'Text', text: /^7%$/ }))?.props.dimColor).toBeFalsy()
  await before.unmount()

  await $.session.measure({ ...USAGE, changed: ['rateLimits'] })

  const after = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await after.find({ type: 'Text', text: /^6%$/ }))?.props.dimColor).toBeFalsy()
  expect(saved.at(-1)).toEqual({
    fiveHour: { percent: 6, resetsAt: '2026-10-27T16:50:00Z' },
    sevenDay: { percent: 87, resetsAt: '2026-10-29T20:00:00Z' },
  })
  await after.unmount()
})
