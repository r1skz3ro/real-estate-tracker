import { beforeEach, expect, test, vi } from 'vitest'
import { MAX_LINKS } from '@/features/links/constants'
import { addLink } from './links'

const state = { links: [] as Array<{ id: number; url: string }> }

vi.mock('@/server/models/queries', () => ({
  listLinks: () => state.links,
  createLink: (data: unknown) => ({ id: 99, ...(data as object) }),
}))

const OTODOM =
  'https://www.otodom.pl/pl/wyniki/sprzedaz/dzialka/dolnoslaskie?by=LATEST'

beforeEach(() => {
  state.links = []
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
  state.links = [{ id: 1, url: OTODOM }]
  expect(() => addLink({ projectId: 1, url: OTODOM })).toThrow(/already/)
})

test('rejects once the project is at the link cap', () => {
  state.links = Array.from({ length: MAX_LINKS }, (_, i) => ({
    id: i,
    url: `${OTODOM}&page=${i}`,
  }))
  expect(() => addLink({ projectId: 1, url: OTODOM })).toThrow(
    `${MAX_LINKS} of ${MAX_LINKS} links`,
  )
})

test('stores the detected portal, its fetch mode and a derived label', () => {
  expect(addLink({ projectId: 1, url: OTODOM })).toMatchObject({
    projectId: 1,
    url: OTODOM,
    portal: 'otodom',
    fetchMode: 'http',
  })
})
