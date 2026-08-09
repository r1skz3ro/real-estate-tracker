import * as cheerio from 'cheerio'
import { findLdJson, parsePlNumber } from './util'
import type { Parser } from './util'

type NolOffer = {
  '@type': 'Offer'
  name: string
  price?: string
  url: string
  image?: string
  priceSpecification?: { price?: string }
  itemOffered?: {
    description?: string
    address?: { addressLocality?: string; addressRegion?: string }
    floorSize?: { value: string }
  }
}

type NolCollectionPage = {
  '@type': 'CollectionPage'
  mainEntity?: {
    offers?: Array<{
      offers?: Array<NolOffer>
    }>
  }
}

const EXTERNAL_ID_RE = /(\d+)\.html$/

// The ld+json flattens four kinds of tile into one array; only the DOM tells them apart, via
// `data-pie`. A search for 86 offers serves 255 of them across its pages — the rest are
// `searchSupplement` (wider-radius padding) and `archive` (already-expired offers), and counting
// those as results both floods the baseline and keeps the paging loop finding "new" ids forever.
// Real results carry `prime` (featured), `normal`, or an empty value — hence a denylist: two names
// for the same thing means a third is likely, and dropping an unknown result class would read as an
// empty search (a quiet week) rather than as a broken parser.
const PADDING = new Set(['searchSupplement', 'archive'])

const TILE_ID_RE = /^a(\d+)$/

// Keyed by id, not by index: a handful of `data-pie` wrappers carry no `data-id` at all.
function tileClasses(html: string): Map<string, string> {
  const $ = cheerio.load(html)
  const classes = new Map<string, string>()
  $('[data-id][data-pie]').each((_, el) => {
    const id = $(el).attr('data-id')?.match(TILE_ID_RE)?.[1]
    if (id) classes.set(id, $(el).attr('data-pie') ?? '')
  })
  return classes
}

export const parseNieruchomosciOnline: Parser = (html) => {
  const collectionPage = findLdJson<NolCollectionPage>(html, 'CollectionPage')
  const offers = collectionPage?.mainEntity?.offers?.[0]?.offers ?? []
  const classes = tileClasses(html)

  const listings = offers
    .map((offer) => {
      const areaM2 = offer.itemOffered?.floorSize?.value
        ? parsePlNumber(offer.itemOffered.floorSize.value)
        : null

      return {
        externalId: offer.url.match(EXTERNAL_ID_RE)?.[1] ?? offer.url,
        url: offer.url,
        title: offer.name,
        price: parsePlNumber(offer.price),
        currency: 'PLN',
        areaM2,
        pricePerM2: offer.priceSpecification
          ? parsePlNumber(offer.priceSpecification.price)
          : null,
        location: offer.itemOffered?.address?.addressLocality ?? null,
        imageUrl: offer.image ?? null,
        description: offer.itemOffered?.description ?? null,
        details: { addressRegion: offer.itemOffered?.address?.addressRegion },
      }
    })
    .filter((listing) => !PADDING.has(classes.get(listing.externalId) ?? ''))

  return {
    listings,
    emptyState: collectionPage !== undefined && listings.length === 0,
  }
}
