import type { ParsedListing } from '@/server/scraping/parsers/util'

export type Known = {
  externalId: string
  price: number | null
  lastRank: number
}

export type Diff = {
  added: Array<ParsedListing>
  priced: Array<{ listing: ParsedListing; oldPrice: number; newPrice: number }>
  removalCandidates: Array<Known>
}

// Portal prices come back through parsePlNumber, so they can carry float noise.
const PRICE_EPSILON = 1

export function diff(known: Array<Known>, fetched: Array<ParsedListing>): Diff {
  const byId = new Map(known.map((k) => [k.externalId, k]))
  const fetchedIds = new Set(fetched.map((l) => l.externalId))

  const added: Array<ParsedListing> = []
  const priced: Diff['priced'] = []
  const addedIds = new Set<string>()

  for (const listing of fetched) {
    const previous = byId.get(listing.externalId)
    if (!previous) {
      // Pages 1 and 2 can overlap while the portal reshuffles; a duplicate here would blow up
      // the listings_link_external unique index on insert.
      if (!addedIds.has(listing.externalId)) {
        addedIds.add(listing.externalId)
        added.push(listing)
      }
      continue
    }
    // null -> 250000 is a listing publishing its price, not changing it.
    if (
      previous.price !== null &&
      listing.price !== null &&
      Math.abs(listing.price - previous.price) >= PRICE_EPSILON
    ) {
      priced.push({
        listing,
        oldPrice: previous.price,
        newPrice: listing.price,
      })
    }
  }

  // The window is newest-first and only as deep as the portal had results, so old listings scroll
  // off the bottom on their own. Only what sat *above* a survivor is genuinely gone. -1 when
  // nothing survived: the whole
  // window turned over and we cannot tell, so nominate nothing.
  const deepestPresent = known.reduce(
    (deepest, k) =>
      fetchedIds.has(k.externalId) && k.lastRank > deepest
        ? k.lastRank
        : deepest,
    -1,
  )

  const removalCandidates = known.filter(
    (k) => !fetchedIds.has(k.externalId) && k.lastRank < deepestPresent,
  )

  return { added, priced, removalCandidates }
}
