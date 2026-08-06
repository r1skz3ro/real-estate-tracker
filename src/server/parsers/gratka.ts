import { derivePricePerM2, findLdJson, parsePlNumber } from './util'
import type { Parser } from './util'

type GratkaOffer = {
  '@type': 'Offer'
  name: string
  price: string
  url: string
  image?: string
  itemOffered?: {
    address?: { addressLocality?: string }
    floorSize?: { value: string }
  }
}

type GratkaProduct = {
  '@type': 'Product'
  offers?: {
    offers?: Array<GratkaOffer>
  }
}

// The ld+json block lists exactly the search results, in page order. The `[data-property-id]` cards
// do not: an empty search still renders six "you might like" cards.
const EXTERNAL_ID_RE = /\/o[bi]\/(\d+)/

export const parseGratka: Parser = (html) => {
  const product = findLdJson<GratkaProduct>(html, 'Product')
  const offers = product?.offers?.offers ?? []

  const listings = offers.map((offer) => {
    const price = parsePlNumber(offer.price)
    const areaM2 = offer.itemOffered?.floorSize?.value
      ? parsePlNumber(offer.itemOffered.floorSize.value)
      : null

    return {
      externalId: offer.url.match(EXTERNAL_ID_RE)?.[1] ?? offer.url,
      url: offer.url,
      title: offer.name,
      price,
      currency: 'PLN',
      areaM2,
      pricePerM2: derivePricePerM2(price, areaM2),
      location: offer.itemOffered?.address?.addressLocality ?? null,
      imageUrl: offer.image ?? null,
    }
  })

  return {
    listings,
    emptyState: product !== undefined && listings.length === 0,
  }
}
