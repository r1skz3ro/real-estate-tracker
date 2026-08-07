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
  // A portal that lists another portal's offers among its own results.
  alsoAllows?: Portal
  // Only these two publish a description on the search page at all.
  expectsDescription?: boolean
}> = [
  {
    portal: 'otodom',
    parser: parseOtodom,
    pageUrl:
      'https://www.otodom.pl/pl/wyniki/sprzedaz/dzialka/dolnoslaskie/wroclawski/sobotka/sulistrowice',
    expectedCount: 19,
    firstId: '68238693',
    expectsDescription: true,
  },
  {
    portal: 'nieruchomosci-online',
    parser: parseNieruchomosciOnline,
    pageUrl: 'https://wroclaw.nieruchomosci-online.pl/szukaj.html',
    expectedCount: 40,
    firstId: '25921151',
    expectsDescription: true,
  },
  {
    portal: 'gratka',
    parser: parseGratka,
    pageUrl: 'https://gratka.pl/mapa/nieruchomosci/dzialki-grunty',
    expectedCount: 35,
    firstId: '48341533',
  },
  {
    portal: 'adresowo',
    parser: parseAdresowo,
    pageUrl: 'https://adresowo.pl/f/dzialki/sulistrowice/g5_lod',
    expectedCount: 33,
    firstId: 'dzialka-budowlana-sobotka-sulistrowice-ul-aroniowa-v3j5b2',
  },
  {
    portal: 'olx',
    parser: parseOlx,
    pageUrl:
      'https://www.olx.pl/nieruchomosci/dzialki/sprzedaz/sulistrowice_143815/',
    expectedCount: 25,
    firstId: '1bB3GO',
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
    alsoAllows,
    expectsDescription,
  }) => {
    const { listings, emptyState } = parser(read(`${portal}-search`), pageUrl)

    expect(listings).toHaveLength(expectedCount)
    expect(emptyState).toBe(false)
    // Page order is load-bearing: phase 06 reasons about position when nominating removals.
    expect(listings[0]?.externalId).toBe(firstId)

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
