import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { linkListingsFn } from '@/server/controllers/links'

export const LISTING_FILTERS = ['all', 'live', 'removed'] as const
export type ListingFilter = (typeof LISTING_FILTERS)[number]

const PAGE = 25

// Keyed under ['link', id] so the run plane can drop every one of a link's reads with one prefix.
// Growing `limit` rather than useInfiniteQuery, the same way the findings timeline pages.
export function useLinkListings(linkId: number, filter: ListingFilter) {
  const [limit, setLimit] = useState(PAGE)

  const query = useQuery({
    queryKey: ['link', linkId, 'listings', filter, limit],
    queryFn: () => linkListingsFn({ data: { linkId, filter, limit } }),
  })

  return {
    query,
    loadMore: () => setLimit((n) => n + PAGE),
  }
}

// The overview's fixed peek at the newest listings — a separate, never-growing query.
export function useLatestListings(linkId: number, limit: number) {
  return useQuery({
    queryKey: ['link', linkId, 'listings', 'all', limit],
    queryFn: () => linkListingsFn({ data: { linkId, filter: 'all', limit } }),
  })
}
