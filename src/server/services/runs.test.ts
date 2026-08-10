import { beforeEach, expect, test, vi } from 'vitest'
import { startRun } from './runs'
import type { ParseResult, ParsedListing } from '@/server/scraping/parsers/util'

const fetchPage = vi.fn()

vi.mock('@/server/scraping/fetch', () => ({
  fetchPage: (link: unknown, url: string) => fetchPage(link, url),
  verifyRemoved: () => Promise.resolve(true),
  withLock: (fn: () => Promise<unknown>) => fn(),
}))
vi.mock('@/server/scraping/fetch/browser', () => ({
  closeBrowser: () => Promise.resolve(),
}))
vi.mock('@/server/scraping/parsers', () => ({
  // The stubbed fetch hands a ParseResult back as JSON — real parsing is parsers.test.ts's job.
  PARSERS: new Proxy(
    {},
    { get: () => (html: string) => JSON.parse(html) as ParseResult },
  ),
}))

type Row = Record<string, unknown> & { id: number }

const state = {
  links: [] as Array<Row>,
  runLinks: new Map<number, Row>(),
  runStatus: '',
  events: [] as Array<Row>,
  listings: [] as Array<Row>,
  logs: new Map<number, Array<string>>(),
}

vi.mock('@/server/models/queries', () => ({
  listLinks: () => state.links,
  activeRun: () => undefined,
  createRun: () => 1,
  finishRun: (_id: number, status: string) => {
    state.runStatus = status
  },
  updateRunLink: (_runId: number, linkId: number, data: Row) =>
    state.runLinks.set(linkId, { ...state.runLinks.get(linkId), ...data }),
  updateLink: (id: number, data: Row) =>
    Object.assign(state.links.find((l) => l.id === id) ?? {}, data),
  linkListings: () => state.listings,
  insertListing: (data: Row) => {
    // The real column is UNIQUE (linkId, externalId); a blind insert over an existing row is the
    // failure this mock has to be able to reproduce.
    if (state.listings.some((l) => l.externalId === data.externalId))
      throw new Error(
        'UNIQUE constraint failed: listings.linkId, listings.externalId',
      )
    const row = { ...data, id: state.listings.length + 1 }
    state.listings.push(row)
    return row
  },
  updateListing: (id: number, data: Row) =>
    Object.assign(state.listings.find((l) => l.id === id) ?? {}, data),
  insertEvent: (data: Row) => state.events.push(data),
  appendRunLinkLog: (_runId: number, linkId: number, msg: string) =>
    state.logs.set(linkId, [...(state.logs.get(linkId) ?? []), msg]),
  tx: (fn: () => unknown) => fn(),
}))

const link = (id: number) => ({
  id,
  projectId: 1,
  url: `https://www.otodom.pl/pl/wyniki/sprzedaz/dzialka/dolnoslaskie/link${id}`,
  portal: 'otodom',
  label: `otodom · ${id}`,
  fetchMode: 'http',
  status: 'pending',
  lastError: null,
  lastRunAt: null,
  baselinedAt: null,
  createdAt: new Date(),
})

const page = (result: Partial<ParseResult>) => ({
  html: JSON.stringify({ listings: [], emptyState: false, ...result }),
  status: 200,
  url: 'https://www.otodom.pl/',
  usedBrowser: false,
  waitedMs: 4000,
  ms: 120,
})

const listing = (externalId: string): ParsedListing => ({
  externalId,
  url: `https://www.otodom.pl/pl/oferta/${externalId}`,
  title: 'Działka',
  price: 250000,
  currency: 'PLN',
  areaM2: 1000,
  pricePerM2: 250,
  location: 'Sulistrowice',
  imageUrl: null,
})

beforeEach(() => {
  state.links = []
  state.runLinks.clear()
  state.runStatus = ''
  state.events = []
  state.listings = []
  state.logs.clear()
  fetchPage.mockReset()
})

test('a dead portal fails alone and the run carries on', async () => {
  state.links = [link(1), link(2), link(3)]
  fetchPage.mockImplementation((l: { id: number }) =>
    l.id === 2
      ? Promise.reject(new Error('fetch failed'))
      : Promise.resolve(page({ listings: [listing('a'), listing('b')] })),
  )

  await startRun(1).finished

  expect(state.runLinks.get(1)).toMatchObject({ status: 'ok', parsedCount: 2 })
  expect(state.runLinks.get(3)).toMatchObject({ status: 'ok', parsedCount: 2 })
  expect(state.runLinks.get(2)).toMatchObject({
    status: 'error',
    error: 'network: fetch failed',
  })
  expect(state.runStatus).toBe('done')
  // A baseline seeds the seen-set silently; reporting months of old listings as news is noise.
  expect(state.events).toEqual([])
  expect(state.links[0]?.baselinedAt).toBeInstanceOf(Date)
})

test('zero parsed with no empty-state marker escalates once, then fails the link', async () => {
  state.links = [link(1)]
  fetchPage.mockResolvedValue(page({ listings: [], emptyState: false }))

  await startRun(1).finished

  expect(fetchPage).toHaveBeenCalledTimes(2)
  expect(fetchPage.mock.calls[1]?.[0]).toMatchObject({ fetchMode: 'browser' })
  expect(state.runLinks.get(1)?.error).toMatch(/^parse-broken:/)
  expect(state.runStatus).toBe('failed')
})

// Gratka answers a page past the last one with a hard 404. Losing page 2 must not cost page 1 —
// and must not leave baselinedAt null, which re-runs the baseline into the same 404 forever.
test('a 404 on page 2 costs the extra page, not the link', async () => {
  state.links = [link(1)]
  fetchPage.mockImplementation((_l: unknown, url: string) =>
    Promise.resolve(
      /page=/.test(url)
        ? { ...page({}), status: 404 }
        : page({ listings: [listing('a'), listing('b')] }),
    ),
  )

  await startRun(1).finished

  expect(fetchPage).toHaveBeenCalledTimes(2)
  expect(state.runLinks.get(1)).toMatchObject({ status: 'ok', parsedCount: 2 })
  expect(state.links[0]?.baselinedAt).toBeInstanceOf(Date)
})

test('paging follows new ids and stops once a page brings none', async () => {
  state.links = [link(1)]
  fetchPage.mockImplementation((_l: unknown, url: string) =>
    Promise.resolve(
      page({
        listings: /page=/.test(url)
          ? [listing('c'), listing('d')]
          : [listing('a'), listing('b')],
      }),
    ),
  )

  await startRun(1).finished

  // page 1 (a,b) → page 2 (c,d) → page 3 (c,d again, nothing new) → stop.
  expect(fetchPage).toHaveBeenCalledTimes(3)
  expect(state.runLinks.get(1)).toMatchObject({ status: 'ok', parsedCount: 4 })
})

test('zero parsed with an empty-state marker is a normal quiet result', async () => {
  state.links = [link(1)]
  fetchPage.mockResolvedValue(page({ listings: [], emptyState: true }))

  await startRun(1).finished

  expect(state.runLinks.get(1)).toMatchObject({ status: 'ok', parsedCount: 0 })
  expect(state.runStatus).toBe('done')
})

test('a single-link run fetches only that link', async () => {
  state.links = [link(1), link(2), link(3)]
  fetchPage.mockResolvedValue(page({ listings: [listing('a')] }))

  await startRun(1, 2).finished

  // Every request belongs to link 2 — the other two are not in this run's checklist at all.
  expect(fetchPage.mock.calls.map((c) => (c[0] as { id: number }).id)).toEqual(
    fetchPage.mock.calls.map(() => 2),
  )
  expect(state.runLinks.get(2)).toMatchObject({ status: 'ok', parsedCount: 1 })
  expect(state.runLinks.has(1)).toBe(false)
  expect(state.runLinks.has(3)).toBe(false)
  expect(state.runStatus).toBe('done')
})

// Changing a link's URL archives its listings and clears baselinedAt, so the next run is a baseline
// that meets rows it already owns. A blind insert there breaks listings_link_external and rolls the
// whole transaction back — losing the run, not just the row.
test('a re-baseline revives archived rows instead of inserting over them', async () => {
  state.links = [link(1)]
  state.listings = [
    {
      id: 1,
      linkId: 1,
      externalId: 'a',
      removedAt: new Date(),
      lastRank: 0,
      price: 100,
    },
  ]
  fetchPage.mockResolvedValue(page({ listings: [listing('a'), listing('b')] }))

  await startRun(1).finished

  expect(state.runLinks.get(1)).toMatchObject({ status: 'ok', parsedCount: 2 })
  expect(state.listings).toHaveLength(2)
  // Revived, not duplicated, and back to live.
  expect(state.listings[0]).toMatchObject({ externalId: 'a', removedAt: null })
  // Still a baseline: seeding a search is not news.
  expect(state.events).toEqual([])
})

test('the log records the requests, the parse and the outcome', async () => {
  state.links = [link(1)]
  fetchPage.mockResolvedValue(page({ listings: [listing('a')] }))

  await startRun(1).finished

  const log = state.logs.get(1) ?? []
  expect(log[0]).toBe('otodom · fetching over http')
  // The politeness wait is reported apart from the request time.
  expect(log[1]).toMatch(
    /^GET https:\/\/www\.otodom\.pl\S* → 200 · waited 4\.0s · 120ms · http · \d+ KB$/,
  )
  expect(log[2]).toBe('parsed 1 listings')
  expect(log.at(-1)).toMatch(/^baseline: recorded 1 listings/)
})

test('a failing link records why in its own log', async () => {
  state.links = [link(1)]
  fetchPage.mockRejectedValue(new Error('fetch failed'))

  await startRun(1).finished

  expect(state.logs.get(1)?.at(-1)).toBe('error: network: fetch failed')
})
