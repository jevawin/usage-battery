// Usage Battery: context, 5-hour and 7-day usage above the prompt.
//
//   Context [battery] 7% ∙ Session (4h 50m) [battery] 6% ∙ Week (2d 8h) [battery] 87%
//
// Each segment is [label] [battery] [percent used]; the label shortens as the
// band narrows (battery.ts). Desktop draws Lucide icons as SVG; the terminal
// has no Svg element, so it draws the battery from text.
import type { Register } from 'claude-code'

import { batterySvg, contextWindow, layout, levelFor, limitWindow } from './battery'
import type { Limit, Window } from './battery'

let context: number | null = null
let fiveHour: Limit | null = null
let sevenDay: Limit | null = null
let ticker: { cancel: () => void } | null = null

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    try {
      take(await $.session.usage())
    } catch {
      // No reading yet; session.measure fills it after the first turn.
    }
    // Time left moves on its own, so redraw each minute.
    ticker?.cancel()
    ticker = $.clock.every(60_000, () => $.ui.invalidate('ui.render'))
    $.ui.invalidate('ui.render')
    return result
  })

  on('session.measure', ($, e, next) => {
    take(e)
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || context === null) {
      return next(e)
    }
    const now = await $.clock.now()
    const windows: Window[] = [contextWindow(context)]
    if (fiveHour) windows.push(limitWindow('Session', fiveHour, now))
    if (sevenDay) windows.push(limitWindow('Week', sevenDay, now))

    const elements = $.ui.resolve(e)
    const { Box, Text } = elements
    // The terminal has no Svg. resolve() fills every name in, a missing one as
    // a fragment, so check the surface rather than the table.
    const Svg = e.surface !== 'terminal' && 'Svg' in elements ? elements.Svg : null

    // The longest layout that fits; the row still wraps if the estimate is off.
    const segments = layout(windows, e.props.bodyColumns, Svg ? 3 : 5)

    const parts = segments.map((s, i) => {
      const level = levelFor(s.percent)
      const label = <Text dimColor>{s.label}</Text>
      const battery = Svg
        ? <Svg key={`b${i}`} source={batterySvg(level)} alt={`${100 - s.percent}% left`} width={18} height={18} />
        : <Text color={level.color}>{`[${level.text}]`}</Text>
      return (
        <Box key={`s${i}`} flexDirection="row" alignItems="center" gap={1} flexShrink={0}>
          {label}
          {battery}
          <Text tabular>{s.percent}%</Text>
          {i < segments.length - 1 ? <Text dimColor>∙</Text> : null}
        </Box>
      )
    })

    return (
      <Box flexDirection="row" flexWrap="wrap" alignItems="center" gap={1} paddingX={1}>
        {parts}
      </Box>
    )
  })
}

function take(u: { context: { percent?: number; tokens?: number; window: number }; rateLimits: { kind: string; percentUsed: number; resetsAt?: string }[] }) {
  const c = u.context
  if (c?.window) {
    context = Math.round(c.percent ?? ((c.tokens ?? 0) / c.window) * 100)
  }
  const pick = (kind: string) => {
    const r = u.rateLimits.find(l => l.kind === kind)
    return r ? { percent: Math.round(r.percentUsed), resetsAt: r.resetsAt } : null
  }
  fiveHour = pick('five_hour') ?? fiveHour
  sevenDay = pick('seven_day') ?? sevenDay
}
