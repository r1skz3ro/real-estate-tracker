import { expect, test } from 'vitest'
import { applyFilters, countsLabel, isPriceDrop, portalsIn } from './summarize'
import type { FindingEvent, FindingsRun } from './types'

const event = (over: Partial<FindingEvent>) =>
  ({
    id: 1,
    type: 'new',
    portal: 'otodom',
    readAt: null,
    oldPrice: null,
    newPrice: null,
    ...over,
  }) as FindingEvent

const run = (id: number, events: Array<FindingEvent>) =>
  ({ id, status: 'done', startedAt: new Date(), events }) as FindingsRun

const runs = [
  run(1, [
    event({ id: 1, type: 'new', portal: 'otodom' }),
    event({ id: 2, type: 'price', portal: 'olx' }),
  ]),
  run(2, [event({ id: 3, type: 'removed', portal: 'gratka' })]),
]

test('portal list is deduped and sorted across every run', () => {
  expect(portalsIn(runs)).toEqual(['gratka', 'olx', 'otodom'])
})

test('filtering drops runs left with nothing to show', () => {
  const filtered = applyFilters(runs, { type: 'new', portal: 'all' })
  expect(filtered).toHaveLength(1)
  expect(filtered[0]?.events.map((e) => e.id)).toEqual([1])
})

test('an unfiltered quiet run survives — "checked, found nothing" is a result', () => {
  const quiet = [...runs, run(3, [])]
  expect(applyFilters(quiet, { type: 'all', portal: 'all' })).toHaveLength(3)
  expect(applyFilters(quiet, { type: 'all', portal: 'olx' })).toHaveLength(1)
})

test('counts label always names all three types, including the zeroes', () => {
  expect(countsLabel(runs[0]!.events)).toBe('1 new · 1 price · 0 removed')
})

test('a price drop is a drop only when both prices are known', () => {
  expect(isPriceDrop(event({ oldPrice: 500000, newPrice: 480000 }))).toBe(true)
  expect(isPriceDrop(event({ oldPrice: 480000, newPrice: 500000 }))).toBe(false)
  expect(isPriceDrop(event({ oldPrice: null, newPrice: 480000 }))).toBe(false)
})
