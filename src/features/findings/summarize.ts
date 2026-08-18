import { EVENT_TYPES } from './types'
import type { FindingEvent, FindingsRun, TypeFilter } from './types'

export type Filters = {
  type: TypeFilter
  portal: string
  min: number | null
  max: number | null
}

export const NO_FILTER: Filters = {
  type: 'all',
  portal: 'all',
  min: null,
  max: null,
}

export const isFiltering = (f: Filters) =>
  f.type !== NO_FILTER.type ||
  f.portal !== NO_FILTER.portal ||
  f.min !== null ||
  f.max !== null

export const portalsIn = (runs: Array<FindingsRun>) =>
  [...new Set(runs.flatMap((run) => run.events.map((e) => e.portal)))].sort()

export const hasUnread = (events: Array<FindingEvent>) =>
  events.some((e) => e.readAt === null)

export const anyUnread = (runs: Array<FindingsRun>) =>
  runs.some((run) => hasUnread(run.events))

// The listing's current price, not the event's oldPrice/newPrice: a range is a budget question, and
// on an older price event newPrice is a figure the listing has since moved past. A null price
// ("cena do negocjacji") can't answer that question, so a bound hides it — unbounded still shows it.
const inRange = (price: number | null, { min, max }: Filters) =>
  (min === null && max === null) ||
  (price !== null &&
    (min === null || price >= min) &&
    (max === null || price <= max))

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
          (f.portal === 'all' || e.portal === f.portal) &&
          inRange(e.price, f),
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
