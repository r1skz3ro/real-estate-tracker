import * as cheerio from 'cheerio'
import { parsePlNumber } from './util'
import type { Parser } from './util'

// Anchored at the end of the path, not just "somewhere after -ID": a slug is free to contain that
// sequence itself. `.html` is OLX's own suffix — an Otodom cross-post's path ends at the id.
const EXTERNAL_ID_RE = /-ID([A-Za-z0-9]+)(?:\.html)?$/
const PRICE_RE = /^([\d\s]+)\s*zł/

export const parseOlx: Parser = (html, pageUrl) => {
  const $ = cheerio.load(html)

  // OLX renders two `listing-grid`s: the results, then a padding block of wider-radius and
  // last-resort filler. Only the first is the search — its card count matches the portal's own
  // "Znaleźliśmy N ogłoszeń", and on a zero-result page it is empty while the padding block still
  // holds ~40 cards.
  const listings = $('[data-testid="listing-grid"]')
    .first()
    .find('[data-cy="l-card"]')
    .map((_, el) => {
      const card = $(el)
      // OLX and Otodom share an owner, and OLX interleaves Otodom ads into its own results — same
      // card markup, `/pl/oferta/` path instead of `/d/oferta/`. They are results of the search.
      const href = card.find('a[href*="/oferta/"]').first().attr('href')
      if (!href) return null

      const url = new URL(href, pageUrl)
      // A second, older padding mechanism: fillers carried inside the results grid are marked by
      // `reason`. None appear there today, but it is a separate signal from the grid split.
      if (url.searchParams.get('reason')?.startsWith('extended_search'))
        return null
      url.search = ''

      const externalId =
        url.pathname.match(EXTERNAL_ID_RE)?.[1] ?? card.attr('id') ?? href

      const priceText = card.find('[data-testid="ad-price"]').first().text()
      const price = parsePlNumber(priceText.match(PRICE_RE)?.[1] ?? '')

      const locationDate = card
        .find('[data-testid="location-date"]')
        .first()
        .text()
      const location = locationDate.split(' - ')[0]?.trim() || null

      const image = card
        .find('img[src]')
        .toArray()
        .map((img) => $(img).attr('src') ?? '')
        .find((src) => src !== '' && !src.includes('no_thumbnail'))

      return {
        externalId,
        url: url.toString(),
        title: card.find('h4').first().text().trim(),
        price,
        currency: 'PLN',
        areaM2: null,
        pricePerM2: null,
        location,
        imageUrl: image ?? null,
      }
    })
    .toArray()

  const total = parsePlNumber(
    $('[data-testid="total-count"]')
      .text()
      .match(/[\d\s]+/)?.[0] ?? '',
  )

  return { listings, emptyState: total === 0 }
}
