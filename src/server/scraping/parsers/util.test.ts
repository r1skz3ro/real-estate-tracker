import { expect, test } from 'vitest'
import { absoluteUrl, derivePricePerM2, parsePlNumber } from './util'

test.each([
  ['389 000', 389000],
  ['1 556', 1556],
  ['190,58', 190.58],
  ['300000', 300000],
  ['1 950 000', 1950000],
  ['', null],
  ['abc', null],
  // gratka/nieruchomosci-online drop the field entirely for a negotiable price.
  [undefined, null],
  [null, null],
])('parsePlNumber(%j) -> %j', (input, expected) => {
  expect(parsePlNumber(input)).toBe(expected)
})

test('derivePricePerM2 divides when both present', () => {
  expect(derivePricePerM2(300000, 1000)).toBe(300)
})

test.each([
  [null, 1000],
  [300000, null],
  [300000, 0],
  [300000, -5],
])('derivePricePerM2(%j, %j) -> null', (price, areaM2) => {
  expect(derivePricePerM2(price, areaM2)).toBeNull()
})

test('absoluteUrl resolves relative hrefs against the page url', () => {
  expect(absoluteUrl('/o/slug', 'https://adresowo.pl/f/dzialki')).toBe(
    'https://adresowo.pl/o/slug',
  )
  expect(
    absoluteUrl('https://otodom.pl/pl/ad/x', 'https://otodom.pl/pl/wyniki'),
  ).toBe('https://otodom.pl/pl/ad/x')
})
