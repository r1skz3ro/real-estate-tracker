import { absoluteUrl } from './util'
import type { Parser } from './util'

type OtodomAddressPart = { name: string } | null

type OtodomItem = {
  id: number
  slug: string
  title: string
  totalPrice?: { value: number; currency: string } | null
  areaInSquareMeters: number | null
  pricePerSquareMeter?: { value: number } | null
  location: {
    address: {
      street: OtodomAddressPart
      city: OtodomAddressPart
      province: OtodomAddressPart
    }
  }
  images: Array<{ medium: string; large: string }>
  shortDescription?: string | null
  estate?: string | null
  transaction?: string | null
  roomsNumber?: number | null
  floorNumber?: number | null
  terrainAreaInSquareMeters?: number | null
  dateCreated?: string | null
  isPrivateOwner?: boolean
}

type NextData = {
  props: {
    pageProps: {
      data: {
        searchAds: {
          items: Array<OtodomItem>
        }
      }
    }
  }
}

const NEXT_DATA_RE = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/

export const parseOtodom: Parser = (html, pageUrl) => {
  const match = html.match(NEXT_DATA_RE)
  if (!match) return { listings: [], emptyState: false }

  const data = JSON.parse(match[1] ?? '') as NextData
  const items = data.props.pageProps.data.searchAds.items

  const listings = items.map((item) => {
    const { street, city, province } = item.location.address
    const location =
      [street?.name, city?.name, province?.name].filter(Boolean).join(', ') ||
      null

    return {
      externalId: String(item.id),
      url: absoluteUrl(`/pl/ad/${item.slug}`, pageUrl),
      title: item.title,
      price: item.totalPrice?.value ?? null,
      currency: item.totalPrice?.currency ?? 'PLN',
      areaM2: item.areaInSquareMeters,
      pricePerM2: item.pricePerSquareMeter?.value ?? null,
      location,
      imageUrl: item.images[0]?.medium ?? null,
      // Otodom truncates it to ~200 chars on the search page; the full text lives on the detail page
      // and is not worth a request per listing.
      description: item.shortDescription ?? null,
      details: {
        estate: item.estate,
        transaction: item.transaction,
        roomsNumber: item.roomsNumber,
        floorNumber: item.floorNumber,
        terrainAreaInSquareMeters: item.terrainAreaInSquareMeters,
        dateCreated: item.dateCreated,
        isPrivateOwner: item.isPrivateOwner,
        images: item.images.map((image) => image.large),
      },
    }
  })

  return { listings, emptyState: listings.length === 0 }
}
