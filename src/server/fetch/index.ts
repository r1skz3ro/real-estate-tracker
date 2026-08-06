import { AsyncLocalStorage } from 'node:async_hooks'
import { updateLink } from '#/db/queries'
import { EXPIRED_MARKERS, PORTALS, detectPortal } from '../portals'
import { browserFetch } from './browser'
import { httpFetch } from './http'
import type { links } from '#/db/schema'

type Link = Pick<typeof links.$inferSelect, 'id' | 'fetchMode'>

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ponytail: promise-chain mutex — one process, so this is enough. Reentrant via AsyncLocalStorage
// so phase 07 can wrap a whole run in withLock() without deadlocking the fetches inside it.
// Swap for a real queue only if this ever needs fairness or cancellation.
let chain: Promise<unknown> = Promise.resolve()
const held = new AsyncLocalStorage<true>()

export function withLock<T>(fn: () => Promise<T>): Promise<T> {
  if (held.getStore()) return fn()
  const run = () => held.run(true, fn)
  const next = chain.then(run, run)
  chain = next.catch(() => {})
  return next
}

// Every request pays the jitter, including page 1 → page 2 and an escalation retry of the same URL.
const politely = <T>(fn: () => Promise<T>) =>
  withLock(async () => {
    await sleep(3000 + Math.random() * 5000)
    return fn()
  })

export async function fetchPage(link: Link, url: string) {
  const portal = detectPortal(url)
  const ready = portal ? PORTALS[portal].ready : undefined
  const viaBrowser = async () => ({
    ...(await politely(() => browserFetch(url, ready))),
    usedBrowser: true,
  })

  if (link.fetchMode === 'browser') return viaBrowser()

  const res = await politely(() => httpFetch(url))
  if (!res.blocked)
    return {
      html: res.html,
      status: res.status,
      url: res.url,
      usedBrowser: false,
    }

  const escalated = await viaBrowser()
  // Persisted so the rest of this run — and every run after — skips the wasted HTTP attempt.
  updateLink(link.id, { fetchMode: 'browser' })
  return escalated
}

// Wording seen on portals whose dead pages we have not captured yet. Anchored on "Ogłoszenie"
// because a bare `zakończone`/`archiwalne` also occurs in live listing descriptions, and a false
// positive here is exactly the phantom "sold!" the removal rules exist to prevent.
const EXPIRED_FALLBACK =
  /Ogłoszenie (nieaktualne|zakończone|zostało usunięte)|nie jest już dostępn/i

// Confirms a removal candidate against its own detail page. Deliberately one-sided: anything we do
// not recognise leaves the listing live and gets retried next run, so a marker we have not recorded
// yet delays a removal rather than inventing one.
// ponytail: OLX pays PORTALS.olx.ready's 15s selector wait here (a detail page has no l-card).
// Candidates are rare; give fetchPage a per-call `ready` override if that stops being true.
export async function verifyRemoved(link: Link, url: string): Promise<boolean> {
  const { html, status, url: finalUrl } = await fetchPage(link, url)
  if (status === 404 || status === 410) return true
  if (new URL(finalUrl).pathname === '/') return true

  const portal = detectPortal(url)
  const marker = portal ? EXPIRED_MARKERS[portal] : undefined
  return marker?.test(html) === true || EXPIRED_FALLBACK.test(html)
}
