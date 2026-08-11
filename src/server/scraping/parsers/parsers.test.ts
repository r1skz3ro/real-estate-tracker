import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vitest'
import { detectPortal } from '../portals'
import { parseAdresowo } from './adresowo'
import { parseGratka } from './gratka'
import { parseNieruchomosciOnline } from './nieruchomosciOnline'
import { parseOlx } from './olx'
import { parseOtodom } from './otodom'
import type { Portal } from '../portals'
import type { Parser } from './util'

const FIXTURES_DIR = path.join(import.meta.dirname, '__fixtures__')

// `*-empty.html` are live captures of a search that matched nothing, except adresowo's: that portal
// answers an empty search by widening it instead, so its fixture is the real page with the results
// grid emptied.
const CASES: Array<{
  portal: Portal
  parser: Parser
  pageUrl: string
  expectedCount: number
  firstId: string
  // Pinned because nothing else here would notice a wrong path: otodom shipped `/pl/ad/<slug>` for
  // months, a route that 404s, and every assertion below passed on it.
  firstUrl: string
  // A portal that lists another portal's offers among its own results.
  alsoAllows?: Portal
  // Only these two publish a description on the search page at all.
  expectsDescription?: boolean
  // Only these three print a date on the card; gratka and adresowo publish none.
  expectsPostedAt?: boolean
}> = [
  {
    portal: 'otodom',
    expectsPostedAt: true,
    parser: parseOtodom,
    pageUrl:
      'https://www.otodom.pl/pl/wyniki/sprzedaz/dzialka/dolnoslaskie/wroclawski/sobotka/sulistrowice',
    // 19 tiles, one of which is the promoted duplicate the parser drops.
    expectedCount: 18,
    firstId: '68238693',
    firstUrl:
      'https://www.otodom.pl/pl/oferta/dzialka-idealna-mpzp-media-badania-poz-bud-ID4Ck05',
    expectsDescription: true,
  },
  {
    portal: 'nieruchomosci-online',
    expectsPostedAt: true,
    parser: parseNieruchomosciOnline,
    pageUrl: 'https://wroclaw.nieruchomosci-online.pl/szukaj.html',
    expectedCount: 40,
    firstId: '25921151',
    firstUrl:
      'https://przylegow.nieruchomosci-online.pl/dzialka,na-sprzedaz/25921151.html',
    expectsDescription: true,
  },
  {
    portal: 'gratka',
    parser: parseGratka,
    pageUrl: 'https://gratka.pl/mapa/nieruchomosci/dzialki-grunty',
    expectedCount: 35,
    firstId: '48341533',
    firstUrl:
      'https://gratka.pl/nieruchomosci/dzialka-swidnicki-swiebodzice/ob/48341533',
  },
  {
    portal: 'adresowo',
    parser: parseAdresowo,
    pageUrl: 'https://adresowo.pl/f/dzialki/sulistrowice/g5_lod',
    expectedCount: 33,
    firstId: 'dzialka-budowlana-sobotka-sulistrowice-ul-aroniowa-v3j5b2',
    firstUrl:
      'https://adresowo.pl/o/dzialka-budowlana-sobotka-sulistrowice-ul-aroniowa-v3j5b2',
  },
  {
    portal: 'olx',
    expectsPostedAt: true,
    parser: parseOlx,
    pageUrl:
      'https://www.olx.pl/nieruchomosci/dzialki/sprzedaz/sulistrowice_143815/',
    expectedCount: 25,
    firstId: '1bB3GO',
    firstUrl:
      'https://www.olx.pl/d/oferta/wyjatkowo-piekna-dzialka-budowlana-w-tapadla-sleza-pensjonat-hotel-CID3-ID1bB3GO.html',
    alsoAllows: 'otodom',
  },
]

const read = (name: string) =>
  fs.readFileSync(path.join(FIXTURES_DIR, `${name}.html`), 'utf-8')

test.each(CASES)(
  '$portal parses the expected listings from the search fixture',
  ({
    portal,
    parser,
    pageUrl,
    expectedCount,
    firstId,
    firstUrl,
    alsoAllows,
    expectsDescription,
    expectsPostedAt,
  }) => {
    const { listings, emptyState } = parser(read(`${portal}-search`), pageUrl)

    expect(listings).toHaveLength(expectedCount)
    expect(emptyState).toBe(false)
    // Page order is load-bearing: phase 06 reasons about position when nominating removals.
    expect(listings[0]?.externalId).toBe(firstId)
    expect(listings[0]?.url).toBe(firstUrl)

    const allowed = [portal, alsoAllows].filter(Boolean)
    for (const listing of listings) {
      expect(listing.externalId).toBeTruthy()
      expect(listing.title).toBeTruthy()
      expect(allowed).toContain(detectPortal(listing.url))
    }

    // Cross-posts are 15 of OLX's 25 results. Dropping them again would look like a quiet portal
    // rather than a 60% loss, so pin them.
    if (alsoAllows)
      expect(
        listings.some((listing) => detectPortal(listing.url) === alsoAllows),
      ).toBe(true)

    const withPrice = listings.filter(
      (listing) => listing.price !== null,
    ).length
    expect(withPrice / listings.length).toBeGreaterThanOrEqual(0.8)

    const ids = new Set(listings.map((listing) => listing.externalId))
    expect(ids.size).toBe(listings.length)

    // The archive columns rot as silently as the rest of the parser — a renamed JSON key would just
    // start writing nulls forever.
    if (expectsDescription) {
      const withDescription = listings.filter(
        (listing) => (listing.description ?? '') !== '',
      ).length
      expect(withDescription / listings.length).toBeGreaterThanOrEqual(0.8)
      expect(listings[0]?.details).toBeTruthy()
    }

    // A renamed key silently writes null forever, and a dash in the UI is indistinguishable from a
    // portal that never published a date — so pin both sides.
    const withPostedAt = listings.filter(
      (listing) => listing.postedAt instanceof Date,
    ).length
    if (expectsPostedAt) {
      expect(withPostedAt / listings.length).toBeGreaterThanOrEqual(0.8)
      // A plausible date, not 1970 or a placeholder decades out.
      const first = listings.find((listing) => listing.postedAt)!.postedAt!
      expect(first.getFullYear()).toBeGreaterThanOrEqual(2015)
    } else {
      expect(withPostedAt).toBe(0)
    }
  },
)

test.each(CASES)(
  '$portal reports emptyState on a genuinely empty search',
  ({ portal, parser, pageUrl }) => {
    const { listings, emptyState } = parser(read(`${portal}-empty`), pageUrl)

    expect(emptyState).toBe(true)
    expect(listings).toHaveLength(0)
  },
)

// Otodom repeats one card per page as a promoted tile under a synthetic id (`96<realId>00067`) and
// an `hpr/` href. Kept, it inserts a phantom listing that reappears under a new id every rotation.
test('otodom drops the promoted duplicate tile', () => {
  const { listings } = parseOtodom(
    read('otodom-search'),
    'https://www.otodom.pl/pl/wyniki/sprzedaz/dzialka/dolnoslaskie/wroclawski/sobotka/sulistrowice',
  )

  expect(listings.map((listing) => listing.externalId)).not.toContain(
    '96823869300067',
  )
  expect(new Set(listings.map((listing) => listing.url)).size).toBe(
    listings.length,
  )
})

// Page 3 of a 86-offer search: the portal has run out of matches and starts padding, so this one
// page carries both kinds. Without the `data-pie` filter the whole search parsed as 255 listings —
// 169 of them offers no search ever matched.
test('nieruchomosci-online drops padding offers but keeps the results beside them', () => {
  const { listings, emptyState } = parseNieruchomosciOnline(
    read('nieruchomosci-online-padded'),
    'https://www.nieruchomosci-online.pl/szukaj.html?3,dzialka,sprzedaz,,Sulistrowice:41347,,,10,,-3500&p=3',
  )

  expect(listings).toHaveLength(4)
  expect(emptyState).toBe(false)
  // The first supplement tile on the page; anything that keeps it back is counting padding again.
  expect(listings.map((listing) => listing.externalId)).not.toContain(
    '25981526',
  )
})

test.each(CASES)(
  '$portal treats an unparseable page as an error, not as empty',
  ({ parser, pageUrl }) => {
    const { listings, emptyState } = parser(
      '<html><body>nope</body></html>',
      pageUrl,
    )

    expect(listings).toHaveLength(0)
    expect(emptyState).toBe(false)
  },
)
