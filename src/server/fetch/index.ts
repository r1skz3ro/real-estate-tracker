import { AsyncLocalStorage } from 'node:async_hooks'
import { updateLink } from '#/db/queries'
import { PORTALS, detectPortal } from '../portals'
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
    html: await politely(() => browserFetch(url, ready)),
    usedBrowser: true,
  })

  if (link.fetchMode === 'browser') return viaBrowser()

  const res = await politely(() => httpFetch(url))
  if (!res.blocked) return { html: res.html, usedBrowser: false }

  const escalated = await viaBrowser()
  // Persisted so the rest of this run — and every run after — skips the wasted HTTP attempt.
  updateLink(link.id, { fetchMode: 'browser' })
  return escalated
}
