import {
  activeRun,
  createRun,
  finishRun,
  insertEvent,
  insertListing,
  listLinks,
  liveListings,
  tx,
  updateLink,
  updateListing,
  updateRunLink,
} from '#/db/queries'
import { diff, needsPage2 } from './diff'
import { fetchPage, verifyRemoved, withLock } from './fetch'
import { closeBrowser } from './fetch/browser'
import { PARSERS } from './parsers'
import { detectPortal, pageUrl } from './portals'
import type { ParseResult, ParsedListing } from './parsers/util'
import type { links, listings } from '#/db/schema'

type Link = typeof links.$inferSelect
type Listing = typeof listings.$inferSelect

// Its message is already `<category>: <detail>`; reasonFor passes it through untouched.
class LinkError extends Error {}

const MAX_ERROR_CHARS = 300

// Phase 10 renders these; the category is the part before the colon.
function reasonFor(err: unknown): string {
  if (err instanceof LinkError) return err.message
  const detail = (err instanceof Error ? err.message : String(err)).slice(
    0,
    MAX_ERROR_CHARS,
  )
  if (/timeout|timed out|ETIMEDOUT|abort/i.test(detail))
    return `timeout: ${detail}`
  if (/fetch failed|ENOTFOUND|ECONN|EAI_AGAIN|ENETUNREACH|net::/i.test(detail))
    return `network: ${detail}`
  return `unknown: ${detail}`
}

// A quiet search still parses ~30 listings, so zero parsed is only broken when the portal never
// said "zero results" itself.
const broken = (page: ParseResult) =>
  page.listings.length === 0 && !page.emptyState

const PARSE_BROKEN = 'parse-broken: 0 listings and no empty-state marker'

async function runLink(runId: number, link: Link) {
  const portal = detectPortal(link.url)
  if (!portal) throw new LinkError('unknown: unsupported portal')

  let fetchMode = link.fetchMode
  let escalated = false

  const load = async (url: string): Promise<ParseResult> => {
    const res = await fetchPage({ id: link.id, fetchMode }, url)
    // fetchPage escalates on a detected block and persists it — keep our copy in step.
    if (res.usedBrowser && fetchMode !== 'browser') {
      fetchMode = 'browser'
      escalated = true
    }
    if ([403, 429, 503].includes(res.status))
      throw new LinkError(`blocked: HTTP ${res.status}`)
    // The portal answered, and its answer is that this URL is gone — waiting will not fix it, so
    // it is a category of its own rather than a transport failure.
    if (res.status === 404 || res.status === 410)
      throw new LinkError(`not-found: HTTP ${res.status}`)
    if (res.status >= 400) throw new LinkError(`network: HTTP ${res.status}`)
    return PARSERS[portal](res.html, res.url)
  }

  let page1 = await load(link.url)
  if (broken(page1)) {
    if (fetchMode === 'browser') throw new LinkError(PARSE_BROKEN)
    fetchMode = 'browser'
    escalated = true
    updateLink(link.id, { fetchMode })
    page1 = await load(link.url)
    if (broken(page1)) throw new LinkError(PARSE_BROKEN)
  }

  const live = liveListings(link.id)
  const isBaseline = link.baselinedAt === null

  const parsed = [...page1.listings]
  // Baselines always take both pages, to seed a window worth diffing against.
  if (isBaseline || needsPage2(live, page1.listings)) {
    const url2 = pageUrl(portal, link.url, 2)
    if (url2) parsed.push(...(await load(url2)).listings)
  }

  // Pages 1 and 2 overlap while the portal reshuffles. First occurrence wins, and its index is
  // the rank removal detection reads.
  const window = new Map<string, ParsedListing>()
  for (const listing of parsed)
    if (!window.has(listing.externalId)) window.set(listing.externalId, listing)
  const fetched = [...window.values()]
  const rankOf = new Map(fetched.map((l, rank) => [l.externalId, rank]))

  const now = new Date()

  // A fresh link finds months of old listings; reporting them as news would bury the real news.
  if (isBaseline) {
    tx(() => {
      for (const [rank, listing] of fetched.entries())
        insertListing({
          ...listing,
          linkId: link.id,
          firstSeenAt: now,
          lastSeenAt: now,
          lastRank: rank,
        })
      updateLink(link.id, { baselinedAt: now })
    })
    return { parsedCount: fetched.length, escalated }
  }

  const known = new Map(live.map((row) => [row.externalId, row]))
  const changes = diff(live, fetched)

  // Confirmed before the write transaction — each one is a network round trip.
  const removed: Array<Listing> = []
  for (const candidate of changes.removalCandidates) {
    const row = known.get(candidate.externalId)
    if (row && (await verifyRemoved({ id: link.id, fetchMode }, row.url)))
      removed.push(row)
  }

  tx(() => {
    for (const listing of changes.added) {
      const row = insertListing({
        ...listing,
        linkId: link.id,
        firstSeenAt: now,
        lastSeenAt: now,
        lastRank: rankOf.get(listing.externalId) ?? 0,
      })
      insertEvent({
        listingId: row.id,
        linkId: link.id,
        runId,
        type: 'new',
        newPrice: listing.price,
      })
    }

    for (const { listing, oldPrice, newPrice } of changes.priced) {
      const row = known.get(listing.externalId)
      if (!row) continue
      updateListing(row.id, {
        price: newPrice,
        pricePerM2: listing.pricePerM2,
      })
      insertEvent({
        listingId: row.id,
        linkId: link.id,
        runId,
        type: 'price',
        oldPrice,
        newPrice,
      })
    }

    for (const row of removed) {
      updateListing(row.id, { removedAt: now })
      insertEvent({
        listingId: row.id,
        linkId: link.id,
        runId,
        type: 'removed',
        oldPrice: row.price,
      })
    }

    for (const listing of fetched) {
      const row = known.get(listing.externalId)
      if (row)
        updateListing(row.id, {
          lastSeenAt: now,
          lastRank: rankOf.get(listing.externalId) ?? row.lastRank,
        })
    }
  })

  return {
    parsedCount: fetched.length,
    newCount: changes.added.length,
    priceCount: changes.priced.length,
    removedCount: removed.length,
    escalated,
  }
}

async function execute(
  runId: number,
  projectId: number,
  projectLinks: Array<Link>,
) {
  let ok = 0
  try {
    for (const link of projectLinks) {
      updateRunLink(runId, link.id, {
        status: 'running',
        startedAt: new Date(),
      })
      // Each link is contained: one dead portal must never abort the run.
      try {
        const result = await runLink(runId, link)
        updateRunLink(runId, link.id, {
          status: 'ok',
          ...result,
          finishedAt: new Date(),
        })
        updateLink(link.id, {
          status: 'ok',
          lastError: null,
          lastRunAt: new Date(),
        })
        ok++
      } catch (err) {
        const error = reasonFor(err)
        updateRunLink(runId, link.id, {
          status: 'error',
          error,
          finishedAt: new Date(),
        })
        updateLink(link.id, {
          status: 'error',
          lastError: error,
          lastRunAt: new Date(),
        })
      }
    }
  } finally {
    // A leaked Chromium per run eats the machine, and a run row stuck on 'running' leaves the UI
    // polling a phantom job forever.
    await closeBrowser().catch(() => {})
    finishRun(runId, projectLinks.length > 0 && ok === 0 ? 'failed' : 'done')
    await notify({ projectId, runId, ok, failed: projectLinks.length - ok })
  }
}

// ponytail: the notify seam — email/Telegram hangs off this one call site. Add a channel here, not
// an abstraction: a provider interface for zero providers is the thing worth not building.
async function notify(summary: {
  projectId: number
  runId: number
  ok: number
  failed: number
}) {
  void summary
}

// Synchronous setup (better-sqlite3 is sync), so the caller gets a runId to poll immediately while
// the work runs behind the global fetch mutex.
export function startRun(projectId: number) {
  const existing = activeRun(projectId)
  if (existing) return { runId: existing.id, finished: Promise.resolve() }

  const projectLinks = listLinks(projectId)
  const runId = createRun(
    projectId,
    projectLinks.map((l) => l.id),
  )
  const finished = withLock(() => execute(runId, projectId, projectLinks))
  // Nobody awaits the manual path; keep a stray rejection from taking the process down.
  finished.catch(() => {})
  return { runId, finished }
}
