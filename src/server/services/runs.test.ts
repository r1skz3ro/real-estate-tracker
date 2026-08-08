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
  linkListings: () => [],
  insertListing: (data: Row) => ({ ...data, id: 1 }),
  updateListing: () => {},
  insertEvent: (data: Row) => state.events.push(data),
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
