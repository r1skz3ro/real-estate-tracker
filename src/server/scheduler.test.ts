import { expect, test } from 'vitest'
import { isDue } from './scheduler'

// All times below are Europe/Warsaw, which is UTC+2 in August — the Z timestamps are written to
// land on the intended Warsaw wall-clock time, since that is the only clock isDue reasons about.
const project = { id: 1, runAt1: '08:00', runAt2: '20:00' }
const at = (iso: string) => new Date(iso)

test('a passed slot with no previous scheduled run is due', () => {
  expect(
    isDue({ ...project, lastScheduledAt: null }, at('2026-08-06T07:00:00Z')),
  ).toBe(true)
})

test('a slot already covered today is not due again', () => {
  expect(
    isDue(
      { ...project, lastScheduledAt: at('2026-08-06T06:05:00Z') },
      at('2026-08-06T07:00:00Z'),
    ),
  ).toBe(false)
})

test('yesterday evening does not satisfy this morning, and morning does not fire early', () => {
  const lastScheduledAt = at('2026-08-05T18:05:00Z')
  // 06:30 Warsaw — before the 08:00 slot, so nothing is due yet.
  expect(
    isDue({ ...project, lastScheduledAt }, at('2026-08-06T04:30:00Z')),
  ).toBe(false)
  // 08:30 Warsaw — the morning slot has passed and yesterday's stamp does not cover it.
  expect(
    isDue({ ...project, lastScheduledAt }, at('2026-08-06T06:30:00Z')),
  ).toBe(true)
})

// A machine off all day must produce one run, not two 30 seconds apart.
test('two overdue slots collapse into a single run', () => {
  const now = at('2026-08-06T19:00:00Z') // 21:00 Warsaw, both slots passed
  expect(isDue({ ...project, lastScheduledAt: null }, now)).toBe(true)
  // …and the stamp the tick writes closes both of them.
  expect(isDue({ ...project, lastScheduledAt: now }, now)).toBe(false)
})
