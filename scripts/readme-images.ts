// Renders the README's images from the mod's own layout code (hooks/battery.ts)
// with headless Chrome. The band is drawn here in HTML that imitates each
// surface; the levels, colours, icons and labels are the mod's.
//
//   node scripts/readme-images.ts
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { batterySvg, contextWindow, layout, levelFor, limitWindow } from '../hooks/battery.ts'
import type { Segment, Window } from '../hooks/battery.ts'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = resolve(import.meta.dirname, '../images')
const NOW = Date.parse('2026-10-27T12:00:00Z')
const at = (h: number) => new Date(NOW + h * 3_600_000).toISOString()

const THEMES = {
  dark: { page: '#1a1a1a', band: '#2a2a2a', text: '#ececec', dim: '#9b9b9b' },
  light: { page: '#faf9f5', band: '#f0eee6', text: '#1f1f1f', dim: '#6b6b6b' },
}
type Theme = keyof typeof THEMES

function windows(ctx: number, session: [number, number], week: [number, number]): Window[] {
  return [
    contextWindow(ctx),
    limitWindow('Session', { percent: session[0], resetsAt: at(session[1]) }, NOW),
    limitWindow('Week', { percent: week[0], resetsAt: at(week[1]) }, NOW),
  ]
}

const segment = (s: Segment, last: boolean, terminal: boolean) => {
  const level = levelFor(s.percent)
  const battery = terminal
    ? `<span style="color:${level.color}">[${level.text}]</span>`
    : `<img src="data:image/svg+xml,${encodeURIComponent(batterySvg(level))}" width="18" height="18">`
  return `<span class="dim">${s.label}</span>${battery}<span>${s.percent}%</span>${last ? '' : '<span class="dim">∙</span>'}`
}

function band(segments: Segment[], terminal: boolean): string {
  return `<div class="band">${segments.map((s, i) => segment(s, i === segments.length - 1, terminal)).join('')}</div>`
}

function page(bands: string[], theme: Theme, terminal: boolean): string {
  const t = THEMES[theme]
  const font = terminal ? '"SF Mono", Menlo, monospace' : '-apple-system, "Helvetica Neue", sans-serif'
  return `<!doctype html><meta charset="utf-8"><style>
    body { margin: 0; padding: 16px; background: ${t.page}; color: ${t.text}; font: 15px/1 ${font};
           display: inline-flex; flex-direction: column; gap: 10px; }
    .band { display: flex; align-items: center; gap: 8px; padding: 12px 16px; white-space: nowrap;
            background: ${terminal ? 'transparent' : t.band}; border-radius: ${terminal ? 0 : 10}px; }
    .dim { color: ${t.dim}; }
    img { display: block; }
  </style>${bands.join('')}`
}

function shoot(name: string, html: string, width: number, height: number) {
  const dir = mkdtempSync(join(tmpdir(), 'usage-battery-'))
  const file = join(dir, 'page.html')
  writeFileSync(file, html)
  execFileSync(CHROME, [
    '--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2',
    `--window-size=${width},${height}`, `--screenshot=${join(OUT, name)}`, `file://${file}`,
  ], { stdio: 'ignore' })
  console.log(`images/${name}`)
}

// One state per battery level, widest layout.
const healthy = windows(14, [6, 4.9], [22, 159])
const busy = windows(58, [81, 1.3], [93, 20])
for (const theme of ['dark', 'light'] as const) {
  shoot(`band-${theme}.png`, page([band(layout(healthy, 200, 3), false), band(layout(busy, 200, 3), false)], theme, false), 620, 128)
}

// The four layouts as the band narrows (cells, as the engine reports them).
shoot('layouts.png', page([71, 64, 49, 40].map(cols => band(layout(healthy, cols, 3), false)), 'dark', false), 620, 236)

// The terminal draws the battery from text.
shoot('terminal.png', page([band(layout(healthy, 200, 5), true), band(layout(busy, 200, 5), true)], 'dark', true), 720, 100)
