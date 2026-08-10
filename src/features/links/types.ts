import type {
  getLinkFn,
  linkListingsFn,
  linkRunsFn,
  listLinksFn,
} from '@/server/controllers/links'

export type Link = Awaited<ReturnType<typeof listLinksFn>>[number]
export type LinkStats = Awaited<ReturnType<typeof getLinkFn>>['stats']
export type LinkListing = Awaited<
  ReturnType<typeof linkListingsFn>
>['listings'][number]
// One entry of the link's fetch history: its counters, its outcome, and the log it wrote.
export type LinkRun = Awaited<ReturnType<typeof linkRunsFn>>['runs'][number]
