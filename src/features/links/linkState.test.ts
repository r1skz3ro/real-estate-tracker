import { expect, test } from 'vitest'
import { linkState, runSummary } from './linkState'
import type { Link } from './types'
import type { RunLink } from '@/features/runs/types'

const link = (over: Partial<Link> = {}) => ({
  id: 1,
  projectId: 1,
  url: 'https://www.otodom.pl/pl/wyniki/sprzedaz/dzialka/dolnoslaskie',
  portal: 'otodom',
  label: 'otodom · dzialka',
  fetchMode: 'http',
  status: 'ok',
  lastError: null,
  lastRunAt: null,
  baselinedAt: null,
  createdAt: new Date(),
  ...over,
})

const runLink = (over: Partial<RunLink> = {}) =>
  ({
    runId: 1,
    linkId: 1,
    status: 'ok',
    error: null,
    parsedCount: 0,
    newCount: 0,
    priceCount: 0,
    removedCount: 0,
    escalated: false,
    baselinedAt: null,
    startedAt: null,
    finishedAt: null,
    ...over,
  }) as RunLink

const STARTED = new Date('2026-08-08T10:00:00Z')

test('a run that baselined this link reports what it seeded, not zero news', () => {
  expect(
    runSummary(
      runLink({
        baselinedAt: new Date('2026-08-08T10:00:30Z'),
        parsedCount: 42,
      }),
      STARTED,
    ),
  ).toBe('baseline: 42')
})

test('a link baselined by an earlier run reports the diff counts', () => {
  expect(
    runSummary(
      runLink({
        baselinedAt: new Date('2026-08-01T10:00:00Z'),
        newCount: 3,
        priceCount: 1,
        removedCount: 2,
      }),
      STARTED,
    ),
  ).toBe('3 new · 1 price · 2 removed')
})

test('in-flight statuses read as progress, not as a result', () => {
  expect(runSummary(runLink({ status: 'pending' }), STARTED)).toBe('waiting')
  expect(runSummary(runLink({ status: 'running' }), STARTED)).toBe('fetching…')
})

test('a timeout is amber and a layout change is red — the tone is the whole point', () => {
  const timeout = linkState(
    link({ status: 'error', lastError: 'timeout: aborted after 25s' }),
    undefined,
    undefined,
  )
  expect(timeout).toMatchObject({
    tone: 'amber',
    text: "couldn't reach portal",
  })
  // The raw reason survives as the tooltip even though the label is friendly.
  expect(timeout.title).toBe('timeout: aborted after 25s')

  expect(
    linkState(
      link({ status: 'error', lastError: 'parse-broken: 0 listings' }),
      undefined,
      undefined,
    ),
  ).toMatchObject({ tone: 'red', dot: 'bg-red-500' })
})

test('the live run overrides the stored link status', () => {
  expect(
    linkState(link({ status: 'ok' }), runLink({ status: 'running' }), STARTED),
  ).toMatchObject({ status: 'running', text: 'fetching…' })
})
