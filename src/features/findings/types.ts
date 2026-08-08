import type { listFindingsFn } from '@/server/controllers/findings'

export type FindingsPage = Awaited<ReturnType<typeof listFindingsFn>>
export type FindingsRun = FindingsPage['runs'][number]
export type FindingEvent = FindingsRun['events'][number]

export const EVENT_TYPES = ['new', 'price', 'removed'] as const
export const TYPE_FILTERS = ['all', ...EVENT_TYPES] as const
export type TypeFilter = (typeof TYPE_FILTERS)[number]
