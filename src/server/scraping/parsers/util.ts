import type { ListingDetails } from '@/server/models/schema'

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
  // The date the portal prints on the card. Only three of the five publish one, and they do not
  // agree on what it means — see docs/portals.md.
  postedAt?: Date | null
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

const PL_MONTHS = [
  'stycznia',
  'lutego',
  'marca',
  'kwietnia',
  'maja',
  'czerwca',
  'lipca',
  'sierpnia',
  'września',
  'października',
  'listopada',
  'grudnia',
]

// Both shapes seen in the fixtures: otodom's `2021-07-27 17:31:30` and the Polish text the other two
// print on the card. The prefix OLX puts in front of a refreshed offer is dropped rather than
// distinguished — the column stores what the card says, and docs/portals.md records what that means.
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/
const PL_RE = /(\d{1,2})\s+([a-ząćęłńóśźż]+)\s+(\d{4})/i
const RELATIVE_RE = /^(dzisiaj|dziś|wczoraj)(?:\s+o\s+(\d{1,2}):(\d{2}))?/i

// Portals ship placeholders where they have no date — otodom writes `1999-02-29` (a day that does
// not exist) and nieruchomosci-online writes `-0001-11-30`. Both must read as "no date", not as a
// listing posted before the portal existed.
const EARLIEST_PLAUSIBLE_YEAR = 2000

export function parsePostedAt(
  raw: string | null | undefined,
  now = new Date(),
): Date | null {
  if (raw == null) return null
  const text = raw.trim()
  if (text === '') return null

  const relative = text.match(RELATIVE_RE)
  if (relative) {
    const date = new Date(now)
    if (relative[1]?.toLowerCase() === 'wczoraj')
      date.setDate(date.getDate() - 1)
    if (relative[2] && relative[3])
      date.setHours(Number(relative[2]), Number(relative[3]), 0, 0)
    return date
  }

  const iso = text.match(ISO_RE)
  if (iso)
    return validate(
      new Date(
        Number(iso[1]),
        Number(iso[2]) - 1,
        Number(iso[3]),
        Number(iso[4] ?? 0),
        Number(iso[5] ?? 0),
        Number(iso[6] ?? 0),
      ),
      Number(iso[1]),
    )

  const pl = text.match(PL_RE)
  if (!pl) return null
  const month = PL_MONTHS.indexOf(pl[2]!.toLowerCase())
  if (month === -1) return null
  const year = Number(pl[3])
  return validate(new Date(year, month, Number(pl[1])), year)
}

// The year is checked against the source string, not the Date: JS rolls 29 February 1999 forward to
// 1 March, so by then the impossible date that gave it away is gone.
function validate(date: Date, year: number): Date | null {
  if (year < EARLIEST_PLAUSIBLE_YEAR) return null
  return Number.isNaN(date.getTime()) ? null : date
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
