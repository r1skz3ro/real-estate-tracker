import { EVENT_TYPES } from './types'
import type { FindingEvent, FindingsRun, TypeFilter } from './types'

export type Filters = { type: TypeFilter; portal: string }

export const NO_FILTER: Filters = { type: 'all', portal: 'all' }

export const isFiltering = (f: Filters) =>
  f.type !== NO_FILTER.type || f.portal !== NO_FILTER.portal

export const portalsIn = (runs: Array<FindingsRun>) =>
  [...new Set(runs.flatMap((run) => run.events.map((e) => e.portal)))].sort()

export const hasUnread = (events: Array<FindingEvent>) =>
  events.some((e) => e.readAt === null)

export const anyUnread = (runs: Array<FindingsRun>) =>
  runs.some((run) => hasUnread(run.events))

// A run whose events all filter out disappears entirely, but only while a filter is on — an
// unfiltered quiet run still has to render, because "we checked and found nothing" is the result.
export function applyFilters(runs: Array<FindingsRun>, f: Filters) {
  const filtering = isFiltering(f)
  return runs
    .map((run) => ({
      ...run,
      events: run.events.filter(
        (e) =>
          (f.type === 'all' || e.type === f.type) &&
          (f.portal === 'all' || e.portal === f.portal),
      ),
    }))
    .filter((run) => !filtering || run.events.length > 0)
}

export const countsLabel = (events: Array<FindingEvent>) =>
  EVENT_TYPES.map(
    (t) => `${events.filter((e) => e.type === t).length} ${t}`,
  ).join(' · ')

export const isPriceDrop = (event: FindingEvent) =>
  event.oldPrice !== null &&
  event.newPrice !== null &&
  event.newPrice < event.oldPrice
