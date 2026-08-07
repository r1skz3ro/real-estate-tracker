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

export const parseNieruchomosciOnline: Parser = (html) => {
  const collectionPage = findLdJson<NolCollectionPage>(html, 'CollectionPage')
  const offers = collectionPage?.mainEntity?.offers?.[0]?.offers ?? []

  const listings = offers.map((offer) => {
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

  return {
    listings,
    emptyState: collectionPage !== undefined && listings.length === 0,
  }
}
