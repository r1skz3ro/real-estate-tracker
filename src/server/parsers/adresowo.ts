import * as cheerio from 'cheerio'
import { absoluteUrl, derivePricePerM2, parsePlNumber } from './util'
import type { Parser } from './util'

const M2_PER_HA = 10_000

// A price/area block is the whole paragraph — matching a mere suffix would let a description that
// happens to end in "zł" overwrite the price with null.
const VALUE_RE = /^([\d\s,]+)\s*(zł|m²|ha)$/

// Scoped to the results grid: below it the page appends an "Oferty z najbliższej okolicy" block,
// whose offers are not results of this search.
const RESULTS = '#offer-list-results'

export const parseAdresowo: Parser = (html, pageUrl) => {
  const $ = cheerio.load(html)

  const listings = $(`${RESULTS} a[data-track="offer-link"]`)
    .map((_, el) => {
      const anchor = $(el)
      const href = anchor.attr('href') ?? ''
      const externalId = href.replace(/^\/o\//, '')

      let card = anchor
      for (const parentEl of anchor.parents().toArray()) {
        const parent = $(parentEl)
        if (parent.find('picture').length > 0) {
          card = parent
          break
        }
      }

      let price: number | null = null
      let areaM2: number | null = null
      card.find('p').each((_index, p) => {
        const match = $(p).text().trim().match(VALUE_RE)
        if (!match) return
        const value = parsePlNumber(match[1] ?? '')
        if (match[2] === 'zł') price = value
        else areaM2 = match[2] === 'ha' && value !== null ? value * M2_PER_HA : value
      })

      const spans = anchor.children('span')
      const location =
        [spans.eq(1).text().trim(), spans.eq(2).text().trim()].filter(Boolean).join(', ') || null

      const image = card.find('picture img[src]').first()

      return {
        externalId,
        url: absoluteUrl(href, pageUrl),
        title: image.attr('alt')?.trim() || externalId,
        price,
        currency: 'PLN',
        areaM2,
        pricePerM2: derivePricePerM2(price, areaM2),
        location,
        imageUrl: image.attr('src') ?? null,
      }
    })
    .toArray()

  // ponytail: adresowo publishes no "no results" wording — it widens the search instead — so the
  // honest signal is its results grid rendering empty. Swap for the real marker if one ever appears.
  return { listings, emptyState: $(RESULTS).length > 0 && listings.length === 0 }
}
