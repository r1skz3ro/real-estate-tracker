import { expect, test } from 'vitest'
import { diff, needsPage2 } from './diff'
import type { Known } from './diff'
import type { ParsedListing } from './parsers/util'

const listing = (
  externalId: string,
  price: number | null = 300000,
): ParsedListing => ({
  externalId,
  url: `https://gratka.pl/nieruchomosci/x/ob/${externalId}`,
  title: `działka ${externalId}`,
  price,
  currency: 'PLN',
  areaM2: 1000,
  pricePerM2: price === null ? null : price / 1000,
  location: 'Sulistrowice',
  imageUrl: null,
})

const known = (
  externalId: string,
  lastRank: number,
  price: number | null = 300000,
): Known => ({ externalId, price, lastRank })

// A baseline is the caller skipping diff() entirely (phase 07), so the guarantee that matters here
// is the weaker one: with nothing known, diff cannot manufacture a price change or a removal.
test('nothing known yields only additions', () => {
  const result = diff([], [listing('a'), listing('b')])

  expect(result.added.map((l) => l.externalId)).toEqual(['a', 'b'])
  expect(result.priced).toEqual([])
  expect(result.removalCandidates).toEqual([])
})

test('an unseen externalId is added', () => {
  const result = diff([known('a', 0)], [listing('a'), listing('b')])

  expect(result.added.map((l) => l.externalId)).toEqual(['b'])
})

// Pages 1 and 2 can overlap while a portal reshuffles; a duplicate insert would violate
// listings_link_external.
test('a listing repeated across pages is added once', () => {
  const result = diff([], [listing('a'), listing('a')])

  expect(result.added).toHaveLength(1)
})

test('a dropped price is reported with both values', () => {
  const result = diff([known('a', 0, 320000)], [listing('a', 295000)])

  expect(result.priced).toEqual([
    { listing: listing('a', 295000), oldPrice: 320000, newPrice: 295000 },
  ])
})

// Publishing or withdrawing a price is not a price *change* — "cena do negocjacji" flips both ways.
test.each([
  [null, 250000],
  [250000, null],
])('price %j -> %j is not a change', (oldPrice, newPrice) => {
  const result = diff([known('a', 0, oldPrice)], [listing('a', newPrice)])

  expect(result.priced).toEqual([])
})

test('sub-1 PLN drift is not a price change', () => {
  const result = diff([known('a', 0, 300000)], [listing('a', 300000.4)])

  expect(result.priced).toEqual([])
})

// THE test. The window is newest-first and ~2 pages deep, so the bottom of it scrolls away on its
// own. Without this, every run invents "sold!" events.
test('a listing pushed off the bottom of the window is not a candidate', () => {
  const result = diff(
    [known('a', 0), known('b', 1), known('old', 29)],
    [listing('a'), listing('b'), listing('new')],
  )

  expect(result.removalCandidates).toEqual([])
})

test('a listing absent while deeper ones survive is a candidate', () => {
  const result = diff(
    [known('a', 0), known('gone', 1), known('deeper', 2)],
    [listing('a'), listing('deeper')],
  )

  expect(result.removalCandidates.map((k) => k.externalId)).toEqual(['gone'])
})

// The whole window turned over, so there is no bottom edge to reason against.
test('nothing present means no candidates', () => {
  const result = diff(
    [known('a', 0), known('b', 1)],
    [listing('x'), listing('y')],
  )

  expect(result.removalCandidates).toEqual([])
})

test('an unchanged listing produces no events at all', () => {
  const result = diff(
    [known('a', 0), known('b', 1)],
    [listing('a'), listing('b')],
  )

  expect(result).toEqual({ added: [], priced: [], removalCandidates: [] })
})

// Page 2 only when page 1 is entirely unfamiliar — more than a page of news arrived, so there is
// probably more below. An empty page 1 must not vacuously qualify and burn a request.
test.each([
  ['all new', [known('x', 0)], [listing('a'), listing('b')], true],
  ['one known', [known('a', 0)], [listing('a'), listing('b')], false],
  ['empty page 1', [known('a', 0)], [], false],
  ['nothing known', [], [listing('a')], true],
] as const)('needsPage2 %s -> %j', (_name, seen, page1, expected) => {
  expect(needsPage2([...seen], [...page1])).toBe(expected)
})
