import { expect, test } from 'vitest'
import {
  absoluteUrl,
  derivePricePerM2,
  parsePlNumber,
  parsePostedAt,
} from './util'

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

// Asserted through local getters, the same way the Date was built — the portals print wall-clock
// dates, and pinning a UTC instant here would just encode the test machine's offset.
const ymd = (d: Date | null) =>
  d && [d.getFullYear(), d.getMonth() + 1, d.getDate()].join('-')

test.each([
  // nieruchomosci-online's modDate and OLX's plain card date.
  ['5 sierpnia 2026', '2026-8-5'],
  ['03 sierpnia 2026', '2026-8-3'],
  ['10 października 2025', '2025-10-10'],
  // OLX prefixes a bumped offer; the date is the same date.
  ['Odświeżono dnia 01 sierpnia 2026', '2026-8-1'],
  // otodom's __NEXT_DATA__ shape.
  ['2021-07-27 17:31:30', '2021-7-27'],
])('parsePostedAt(%j) -> %s', (input, expected) => {
  expect(ymd(parsePostedAt(input))).toBe(expected)
})

test('parsePostedAt reads OLX relative wording against the current day', () => {
  const now = new Date(2026, 7, 9, 18, 0, 0)
  expect(ymd(parsePostedAt('Dzisiaj o 12:34', now))).toBe('2026-8-9')
  expect(parsePostedAt('Dzisiaj o 12:34', now)?.getHours()).toBe(12)
  expect(ymd(parsePostedAt('Wczoraj o 09:05', now))).toBe('2026-8-8')
})

test.each([
  // The two placeholders the portals ship where they have no date. Both must read as "no date":
  // 29 February 1999 does not exist, and JS would silently roll it to 1 March.
  ['1999-02-29 00:00:01'],
  ['-0001-11-30'],
  ['Sulistrowice'],
  ['32 marnego 2026'],
  [''],
  [null],
  [undefined],
])('parsePostedAt(%j) -> null', (input) => {
  expect(parsePostedAt(input)).toBeNull()
})

test('absoluteUrl resolves relative hrefs against the page url', () => {
  expect(absoluteUrl('/o/slug', 'https://adresowo.pl/f/dzialki')).toBe(
    'https://adresowo.pl/o/slug',
  )
  expect(
    absoluteUrl('https://otodom.pl/pl/ad/x', 'https://otodom.pl/pl/wyniki'),
  ).toBe('https://otodom.pl/pl/ad/x')
})
