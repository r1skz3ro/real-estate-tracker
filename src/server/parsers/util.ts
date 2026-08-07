// Whatever extra a portal happens to publish on its search page — shape differs per portal, so it
// is stored as JSON rather than as a column each. Only otodom and nieruchomosci-online have any.
export type ListingDetails = Record<string, unknown>

export type ParsedListing = {
  externalId: string
  url: string
  title: string
  price: number | null
  currency: string
  areaM2: number | null
  pricePerM2: number | null
  location: string | null
  imageUrl: string | null
  // Optional, not nullable-required: gratka, adresowo and OLX publish neither on a search page, and
  // fetching each listing's own detail page for them would cost one polite request per listing.
  description?: string | null
  details?: ListingDetails | null
}

export type ParseResult = {
  listings: Array<ParsedListing>
  emptyState: boolean
}

export type Parser = (html: string, pageUrl: string) => ParseResult

// JS `\s` already matches NBSP (U+00A0) and narrow NBSP (U+202F), Polish portals' thousands separators.
// Takes null/undefined because ld+json omits `price` outright on a "cena do negocjacji" offer — the
// declared `price: string` is the portal's promise, not a guarantee.
export function parsePlNumber(s: string | null | undefined): number | null {
  if (s == null) return null
  const cleaned = s.replace(/\s/g, '').replace(',', '.')
  if (cleaned === '') return null
  const n = Number(cleaned)
  return Number.isNaN(n) ? null : n
}

export function derivePricePerM2(
  price: number | null,
  areaM2: number | null,
): number | null {
  if (price === null || areaM2 === null || areaM2 <= 0) return null
  return price / areaM2
}

export function absoluteUrl(href: string, pageUrl: string): string {
  return new URL(href, pageUrl).toString()
}

const LD_JSON_RE =
  /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g

export function findLdJson<T>(html: string, type: string): T | undefined {
  for (const [, block] of html.matchAll(LD_JSON_RE)) {
    try {
      const parsed = JSON.parse(block ?? '') as { '@type'?: string }
      if (parsed['@type'] === type) return parsed as T
    } catch {
      continue
    }
  }
  return undefined
}
