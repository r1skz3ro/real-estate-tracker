import { beforeEach, expect, test, vi } from 'vitest'
import { MAX_LINKS } from '@/features/links/constants'
import { addLink, updateLinkConfig } from './links'

type Row = Record<string, unknown> & { id: number; url: string }

const state = {
  links: [] as Array<Row>,
  archived: [] as Array<number>,
}
const startRun = vi.fn((_projectId: number, _linkId?: number) => ({
  runId: 7,
}))

vi.mock('@/server/models/queries', () => ({
  listLinks: () => state.links,
  createLink: (data: object) => {
    const row = { id: 99, ...data } as Row
    state.links.push(row)
    return row
  },
  getLink: (id: number) => state.links.find((l) => l.id === id),
  updateLink: (id: number, data: object) =>
    Object.assign(state.links.find((l) => l.id === id) ?? {}, data),
  archiveLinkListings: (linkId: number) => state.archived.push(linkId),
  tx: (fn: () => unknown) => fn(),
}))
vi.mock('./runs', () => ({
  startRun: (projectId: number, linkId?: number) => startRun(projectId, linkId),
}))

const OTODOM =
  'https://www.otodom.pl/pl/wyniki/sprzedaz/dzialka/dolnoslaskie?by=LATEST'
const OLX = 'https://www.olx.pl/nieruchomosci/dzialki/sulistrowice/'

const saved = (over: Partial<Row> = {}): Row => ({
  id: 1,
  projectId: 1,
  url: OTODOM,
  portal: 'otodom',
  label: 'otodom · dolnoslaskie',
  fetchMode: 'http',
  status: 'ok',
  lastError: 'timeout: nope',
  baselinedAt: new Date(),
  ...over,
})

beforeEach(() => {
  state.links = []
  state.archived = []
  startRun.mockClear()
})

test('rejects anything that is not an https URL on a supported portal', () => {
  expect(() => addLink({ projectId: 1, url: 'not a url' })).toThrow(/URL/)
  expect(() =>
    addLink({ projectId: 1, url: OTODOM.replace('https:', 'http:') }),
  ).toThrow(/https/)
  expect(() => addLink({ projectId: 1, url: 'https://example.com/x' })).toThrow(
    /Unsupported portal/,
  )
})

test('rejects a duplicate URL on the same project', () => {
  state.links = [saved()]
  expect(() => addLink({ projectId: 1, url: OTODOM })).toThrow(/already/)
})

test('rejects once the project is at the link cap', () => {
  state.links = Array.from({ length: MAX_LINKS }, (_, i) =>
    saved({ id: i, url: `${OTODOM}&page=${i}` }),
  )
  expect(() => addLink({ projectId: 1, url: OTODOM })).toThrow(
    `${MAX_LINKS} of ${MAX_LINKS} links`,
  )
})

test('stores the detected portal, its fetch mode and a derived label', () => {
  expect(addLink({ projectId: 1, url: OTODOM }).link).toMatchObject({
    projectId: 1,
    url: OTODOM,
    portal: 'otodom',
    fetchMode: 'http',
  })
})

// The fetch is the validation: nothing else can tell a live search from a dead one.
test('adding a link starts a baseline run for just that link', () => {
  const { link, runId } = addLink({ projectId: 1, url: OTODOM })

  expect(startRun).toHaveBeenCalledWith(1, link.id)
  expect(runId).toBe(7)
})

test('a label-only edit leaves the search and its history alone', () => {
  state.links = [saved()]

  const updated = updateLinkConfig({ id: 1, label: 'Sulistrowice' })

  expect(updated).toMatchObject({ label: 'Sulistrowice', url: OTODOM })
  expect(state.archived).toEqual([])
  expect(updated.baselinedAt).toBeInstanceOf(Date)
})

test('a fetch-mode override is stored as-is', () => {
  state.links = [saved()]
  expect(updateLinkConfig({ id: 1, fetchMode: 'browser' })).toMatchObject({
    fetchMode: 'browser',
  })
})

test('rejects a new URL that is unsupported or already on the project', () => {
  state.links = [saved(), saved({ id: 2, url: OLX, portal: 'olx' })]

  expect(() =>
    updateLinkConfig({ id: 1, url: 'https://example.com/x' }),
  ).toThrow(/Unsupported portal/)
  expect(() => updateLinkConfig({ id: 1, url: OLX })).toThrow(/already/)
})

// A different search is a different pool. The old results are archived rather than deleted, and the
// link goes back to pending so the next fetch re-baselines instead of reporting a search as news.
test('changing the URL re-detects the portal, archives the old results and re-baselines', () => {
  state.links = [saved()]

  const updated = updateLinkConfig({ id: 1, url: OLX, label: 'OLX search' })

  expect(updated).toMatchObject({
    url: OLX,
    portal: 'olx',
    // OLX is verified-blocked over plain HTTP, so the new portal's own default wins.
    fetchMode: 'browser',
    baselinedAt: null,
    status: 'pending',
    lastError: null,
    label: 'OLX search',
  })
  expect(state.archived).toEqual([1])
})
