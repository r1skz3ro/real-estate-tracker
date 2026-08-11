import * as cheerio from 'cheerio'
import { absoluteUrl, parsePostedAt } from './util'
import type { Parser } from './util'

type OtodomAddressPart = { name: string } | null

type OtodomItem = {
  id: number
  slug: string
  // The Next.js route template, `[lang]/ad/<slug>` — an internal route, not a URL. Only read to
  // spot the `hpr/` prefix.
  href?: string
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

  // The URL is whatever the card links to, never a path we build: otodom retired `/pl/ad/<slug>`
  // (it now 301s to `/pl/shop/…` and 404s), and __NEXT_DATA__ only carries that same dead route.
  // Keyed by slug rather than by index so the DOM and the JSON are free to drift out of step.
  const $ = cheerio.load(html)
  const hrefBySlug = new Map<string, string>()
  for (const el of $('a[data-cy="listing-item-link"]').toArray()) {
    const href = $(el).attr('href')
    const slug = href?.split('?')[0]?.split('/').filter(Boolean).pop()
    if (href && slug && !hrefBySlug.has(slug)) hrefBySlug.set(slug, href)
  }

  const listings = items.flatMap((item) => {
    // One promoted tile per page repeats a card already in the results under a synthetic id.
    if (item.href?.startsWith('hpr/')) return []
    // No anchor means no honest URL to store. Dropping the item leaves any row it already has
    // untouched, at worst costing it a removal check that answers "still live".
    const href = hrefBySlug.get(item.slug)
    if (!href) return []

    const { street, city, province } = item.location.address
    const location =
      [street?.name, city?.name, province?.name].filter(Boolean).join(', ') ||
      null

    return {
      externalId: String(item.id),
      url: absoluteUrl(href, pageUrl),
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
      postedAt: parsePostedAt(item.dateCreated),
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

  // Counted on `items`, not on `listings`: the filters above must never let a renamed anchor read
  // as "the portal said zero".
  return { listings, emptyState: items.length === 0 }
}
