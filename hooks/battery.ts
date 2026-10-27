// What the band shows, apart from how it is drawn: battery levels, colours,
// labels and the layout that fits a width. No engine calls, so the README's
// image script imports it too.

export type Level = { minLeft: number; icon: string; text: string; color: string }
export type Segment = { label: string; percent: number }
// One window to draw. Context has no reset, so no resetsAt.
export type Window = { long: string; short: string; percent: number; resetsAt?: string; now?: number; reset?: boolean }
export type Limit = { percent: number; resetsAt?: string }

// Measured: each colour is at least 3:1 (WCAG non-text) against #ffffff,
// #faf9f5, #1e1e1e, #262624 and #000000.
const GREEN = '#16a34a'
const YELLOW = '#b08600'
const AMBER = '#e06c00'
const RED = '#e5322d'

// Lucide 0.460.0 battery bodies (ISC), by charge left.
const RECT = '<rect width="16" height="10" x="2" y="7" rx="2" ry="2"/><line x1="22" x2="22" y1="11" y2="13"/>'
const bar = (x: number) => `<line x1="${x}" x2="${x}" y1="11" y2="13"/>`
const LEVELS: Level[] = [
  { minLeft: 75, icon: RECT + bar(6) + bar(10) + bar(14), text: '▮▮▮', color: GREEN },
  { minLeft: 50, icon: RECT + bar(6) + bar(10), text: '▮▮▯', color: GREEN },
  { minLeft: 25, icon: RECT + bar(6), text: '▮▯▯', color: YELLOW },
  { minLeft: 10, icon: RECT, text: '▯▯▯', color: AMBER },
]
const EMPTY: Level = {
  minLeft: -Infinity,
  icon: '<path d="M10 17h.01"/><path d="M10 7v6"/><path d="M14 7h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2"/><path d="M22 11v2"/><path d="M6 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/>',
  text: ' ! ',
  color: RED,
}
LEVELS.push(EMPTY)

export function levelFor(percentUsed: number): Level {
  const left = 100 - percentUsed
  return LEVELS.find(l => left >= l.minLeft) ?? EMPTY
}

export function batterySvg(level: Level): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${level.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${level.icon}</svg>`
}

export function contextWindow(percent: number): Window {
  return { long: 'Context', short: 'C', percent }
}

// Seen: a 5-hour reading of 6% with its reset already past; the next response
// reported 0% and a new reset. Past its reset a window is empty until then.
export function limitWindow(long: string, w: Limit, now: number): Window {
  const isReset = !(Date.parse(w.resetsAt ?? '') - now > 0)
  return { long, short: long[0]!, percent: isReset ? 0 : w.percent, resetsAt: w.resetsAt ?? '', now, reset: isReset }
}

// Wide to narrow: "Session (4h 55m)", "Session (4h)", "S (4h)", "4h".
const TIERS: ((w: Window) => string)[] = [
  w => (w.resetsAt === undefined ? w.long : `${w.long} (${w.reset ? 'reset' : timeLeft(w.resetsAt, w.now!, 2)})`),
  w => (w.resetsAt === undefined ? w.long : `${w.long} (${w.reset ? 'reset' : timeLeft(w.resetsAt, w.now!, 1)})`),
  w => (w.resetsAt === undefined ? w.short : `${w.short} (${w.reset ? 'reset' : timeLeft(w.resetsAt, w.now!, 1)})`),
  w => (w.resetsAt === undefined ? w.short : w.reset ? 'reset' : timeLeft(w.resetsAt, w.now!, 1)),
]

// The longest layout that fits the band's width in cells.
export function layout(windows: Window[], columns: number, batteryCells: number): Segment[] {
  const rows = TIERS.map(tier => windows.map(w => ({ label: tier(w), percent: w.percent })))
  return rows.find(row => cells(row, batteryCells) <= columns) ?? rows[rows.length - 1]!
}

// Cells a row takes, laid out as drawn: gap 1 inside and between segments,
// a separator after all but the last, paddingX 1 each side.
function cells(row: Segment[], batteryCells: number): number {
  const inner = row.reduce((n, s, i) => n + s.label.length + 1 + batteryCells + 1 + `${s.percent}%`.length + (i < row.length - 1 ? 2 : 0), 0)
  return inner + (row.length - 1) + 2
}

// Rounded down to the minute; units is how many to show: 4h 55m, or 4h.
// A zero second unit is dropped: 20h, not 20h 0m.
function timeLeft(resetsAt: string, now: number, units: 1 | 2): string {
  const minutes = Math.max(0, Math.floor((Date.parse(resetsAt) - now) / 60_000))
  const d = Math.floor(minutes / 1440)
  const h = Math.floor((minutes % 1440) / 60)
  const m = minutes % 60
  const parts = d > 0 ? [`${d}d`, h && `${h}h`] : h > 0 ? [`${h}h`, m && `${m}m`] : [`${m}m`]
  return parts.slice(0, units).filter(Boolean).join(' ')
}
