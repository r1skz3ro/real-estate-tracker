import { Button } from '@/components/ui/button'
import { ListingsTable } from './ListingsTable'
import { LISTING_FILTERS, useLinkListings } from './useLinkListings'
import type { ListingFilter } from './useLinkListings'

const LABELS: Record<ListingFilter, string> = {
  all: 'all',
  live: 'live',
  removed: 'gone',
}

export function LinkListings({
  linkId,
  filter,
  onFilter,
}: {
  linkId: number
  filter: ListingFilter
  onFilter: (filter: ListingFilter) => void
}) {
  const { query, loadMore } = useLinkListings(linkId, filter)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {LISTING_FILTERS.map((option) => (
          <Button
            key={option}
            size="xs"
            variant={option === filter ? 'secondary' : 'ghost'}
            onClick={() => onFilter(option)}
          >
            {LABELS[option]}
          </Button>
        ))}
      </div>

      {query.isLoading && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}
      {query.error && (
        <p className="text-sm text-destructive">{query.error.message}</p>
      )}

      {query.data &&
        (query.data.listings.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {filter === 'all'
              ? 'Nothing recorded yet — refresh to give this link a baseline.'
              : `No ${LABELS[filter]} listings.`}
          </p>
        ) : (
          <>
            <ListingsTable listings={query.data.listings} />
            {query.data.hasMore && (
              <Button variant="secondary" size="sm" onClick={loadMore}>
                Load more
              </Button>
            )}
          </>
        ))}
    </div>
  )
}
