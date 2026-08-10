import { expect, test } from 'vitest'
import { isInitialFetch, runDuration, runOutcome } from './runHistory'
import type { Link, LinkRun, LinkStats } from './types'

const run = (over: Partial<LinkRun> = {}) => ({
  id: 1,
  runId: 1,
  linkId: 1,
  status: 'ok',
  parsedCount: 32,
  newCount: 0,
  priceCount: 0,
  removedCount: 0,
  escalated: false,
  error: null,
  log: null,
  startedAt: new Date(0),
  finishedAt: new Date(2_400),
  runStatus: 'done',
  runStartedAt: new Date(0),
  runFinishedAt: new Date(2_400),
  ...over,
})

const logged = (...messages: Array<string>) =>
  messages.map((msg) => ({ at: 0, msg }))

test('in-flight rows report progress rather than a result', () => {
  expect(runOutcome(run({ status: 'pending' })).text).toBe('waiting')
  expect(runOutcome(run({ status: 'running' })).text).toBe('fetching…')
})

// A baseline and a quiet run are both all-zero; only the log tells them apart, and confusing the
// two makes a first fetch look like it found nothing.
test('a baseline is named, a quiet run says so, and changes are counted', () => {
  expect(
    runOutcome(run({ log: logged('baseline: recorded 32 listings') })).text,
  ).toBe('initial fetch · 32 recorded')

  expect(runOutcome(run()).text).toBe('no changes · 32 checked')

  expect(
    runOutcome(run({ newCount: 3, priceCount: 1, removedCount: 2 })).text,
  ).toBe('3 new · 1 price · 2 removed')
})

// Same amber/red split as the link row: a timeout usually fixes itself, a layout change never does.
test('an error borrows the friendly wording and the tone', () => {
  expect(
    runOutcome(run({ status: 'error', error: 'not-found: HTTP 404' })),
  ).toEqual({ text: 'search URL is dead (404)', tone: 'red' })
  expect(
    runOutcome(run({ status: 'error', error: 'timeout: aborted' })).tone,
  ).toBe('amber')
  expect(runOutcome(run({ status: 'error', error: 'nonsense' })).text).toBe(
    'refresh failed',
  )
})

test('duration needs both ends of the run', () => {
  expect(runDuration(run())).toBe('2.4s')
  expect(runDuration(run({ finishedAt: new Date(400) }))).toBe('400ms')
  expect(runDuration(run({ finishedAt: null }))).toBeNull()
  expect(runDuration(run({ startedAt: null }))).toBeNull()
})

test('the initial-fetch notice needs a baseline and no events yet', () => {
  const link = (baselinedAt: Date | null) => ({ baselinedAt }) as Link
  const stats = (events: number) => ({ events }) as LinkStats

  expect(isInitialFetch(link(new Date()), stats(0))).toBe(true)
  // The first refresh after the baseline produced news — the listings are no longer just a seed.
  expect(isInitialFetch(link(new Date()), stats(3))).toBe(false)
  // Never fetched: there is nothing to show yet, initial or otherwise.
  expect(isInitialFetch(link(null), stats(0))).toBe(false)
  expect(isInitialFetch(link(new Date()), undefined)).toBe(false)
})
