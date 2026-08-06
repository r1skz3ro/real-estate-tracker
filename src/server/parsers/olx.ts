import * as cheerio from 'cheerio'
import { parsePlNumber } from './util'
import type { Parser } from './util'

const EXTERNAL_ID_RE = /-ID([A-Za-z0-9]+)\.html/
const PRICE_RE = /^([\d\s]+)\s*zł/

export const parseOlx: Parser = (html, pageUrl) => {
  const $ = cheerio.load(html)

  const listings = $('[data-cy="l-card"]')
    .map((_, el) => {
      const card = $(el)
      const href = card.find('a[href^="/d/oferta/"]').first().attr('href')
      if (!href) return null

      const url = new URL(href, pageUrl)
      // OLX pads a search with offers from outside it — a wider radius, or, when nothing matched at
      // all, whatever the visitor browsed last. Both are marked by `reason`; neither is a result.
      if (url.searchParams.get('reason')?.startsWith('extended_search'))
        return null
      url.search = ''

      const externalId =
        href.match(EXTERNAL_ID_RE)?.[1] ?? card.attr('id') ?? href

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
