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
  images: Array<{ medium: string }>
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
    const location = [street?.name, city?.name, province?.name].filter(Boolean).join(', ') || null

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
    }
  })

  return { listings, emptyState: listings.length === 0 }
}
