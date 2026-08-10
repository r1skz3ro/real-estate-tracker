import {
  activeRun,
  appendRunLinkLog,
  createRun,
  finishRun,
  insertEvent,
  insertListing,
  linkListings,
  listLinks,
  tx,
  updateLink,
  updateListing,
  updateRunLink,
} from '@/server/models/queries'
import { diff } from './diff'
import { fetchPage, verifyRemoved, withLock } from '@/server/scraping/fetch'
import { closeBrowser } from '@/server/scraping/fetch/browser'
import { PARSERS } from '@/server/scraping/parsers'
import { detectPortal, pageUrl } from '@/server/scraping/portals'
import type { ParseResult, ParsedListing } from '@/server/scraping/parsers/util'
import type { links, listings } from '@/server/models/schema'

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

// ponytail: a backstop, not a target — the loop below stops on its own once a page holds nothing
// new, and a portal that pads past its own results is the parser's job to filter (see
// nieruchomosciOnline's `PADDING`), not this cap's. Raise it only if a real pool is deeper than
// this, whose symptom is bumped old listings reported as new forever.
const MAX_PAGES = 10

const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`
const dur = (ms: number) => (ms >= 1000 ? secs(ms) : `${ms}ms`)

type Log = (msg: string) => void

async function runLink(runId: number, link: Link, log: Log) {
  const portal = detectPortal(link.url)
  if (!portal) throw new LinkError('unknown: unsupported portal')

  let fetchMode = link.fetchMode
  let escalated = false

  const load = async (url: string): Promise<ParseResult> => {
    const res = await fetchPage({ id: link.id, fetchMode }, url)
    // The wait is reported apart from the request: every request pays 3–8s of politeness, and
    // folding it in would hide a portal that actually got slow.
    log(
      `GET ${url} → ${res.status} · waited ${secs(res.waitedMs)} · ${dur(res.ms)} · ` +
        `${res.usedBrowser ? 'browser' : 'http'} · ${Math.round(res.html.length / 1024)} KB`,
    )
    // fetchPage escalates on a detected block and persists it — keep our copy in step.
    if (res.usedBrowser && fetchMode !== 'browser') {
      fetchMode = 'browser'
      escalated = true
      log(
        'plain request was blocked — this link now fetches through the browser',
      )
    }
    if ([403, 429, 503].includes(res.status))
      throw new LinkError(`blocked: HTTP ${res.status}`)
    // The portal answered, and its answer is that this URL is gone — waiting will not fix it, so
    // it is a category of its own rather than a transport failure.
    if (res.status === 404 || res.status === 410)
      throw new LinkError(`not-found: HTTP ${res.status}`)
    if (res.status >= 400) throw new LinkError(`network: HTTP ${res.status}`)

    const parsed = PARSERS[portal](res.html, res.url)
    log(
      `parsed ${parsed.listings.length} listings` +
        (parsed.emptyState ? ' · portal reported no results' : ''),
    )
    return parsed
  }

  log(`${portal} · fetching over ${fetchMode}`)

  let page1 = await load(link.url)
  if (broken(page1)) {
    if (fetchMode === 'browser') throw new LinkError(PARSE_BROKEN)
    fetchMode = 'browser'
    escalated = true
    updateLink(link.id, { fetchMode })
    log('0 listings and no empty-state marker — retrying through the browser')
    page1 = await load(link.url)
    if (broken(page1)) throw new LinkError(PARSE_BROKEN)
  }

  const all = linkListings(link.id)
  const live = all.filter((row) => row.removedAt === null)
  // Every row this link has ever recorded. A listing we are about to add may already own one — a
  // relist, or a re-baseline after the URL changed — and inserting a second would break
  // listings_link_external and roll the whole transaction back.
  const existing = new Map(all.map((row) => [row.externalId, row]))
  const isBaseline = link.baselinedAt === null

  // Keep paging while a page still holds ids we have never seen. nieruchomosci-online sorts by
  // *modification* date, so an agent bumping an old listing floats it onto page 1 — it only reads
  // as news if the seen-set never covered the rest of the pool. A baseline starts with an empty
  // seen-set, so it walks to the cap on its own.
  const seen = new Set(live.map((row) => row.externalId))
  const parsed: Array<ParsedListing> = []
  let page = page1
  for (let n = 2; ; n++) {
    const fresh = page.listings.some((l) => !seen.has(l.externalId))
    for (const l of page.listings) seen.add(l.externalId)
    parsed.push(...page.listings)
    if (!fresh) {
      log(`page ${n - 1} held nothing unseen — stopping here`)
      break
    }
    if (n > MAX_PAGES) break
    const url = pageUrl(portal, link.url, n)
    if (!url) break
    // Extra pages are best-effort: gratka answers a page past the last one with a hard 404, and
    // losing page 2 must never cost us page 1.
    try {
      page = await load(url)
    } catch {
      log(`page ${n} could not be fetched — keeping what pages 1–${n - 1} gave`)
      break
    }
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
      for (const [rank, listing] of fetched.entries()) {
        const previous = existing.get(listing.externalId)
        if (previous)
          updateListing(previous.id, {
            ...listing,
            removedAt: null,
            lastSeenAt: now,
            lastRank: rank,
          })
        else
          insertListing({
            ...listing,
            linkId: link.id,
            firstSeenAt: now,
            lastSeenAt: now,
            lastRank: rank,
          })
      }
      updateLink(link.id, { baselinedAt: now })
    })
    log(
      `baseline: recorded ${fetched.length} listings — a first fetch reports no changes`,
    )
    return { parsedCount: fetched.length, escalated }
  }

  // Live only, on purpose: a row already marked removed must not be nominated for removal again.
  const known = new Map(live.map((row) => [row.externalId, row]))
  const changes = diff(live, fetched)
  log(
    `diff over ${fetched.length} fetched vs ${live.length} tracked: ${changes.added.length} new · ` +
      `${changes.priced.length} price · ${changes.removalCandidates.length} possibly gone`,
  )

  // Confirmed before the write transaction — each one is a network round trip.
  const removed: Array<Listing> = []
  for (const candidate of changes.removalCandidates) {
    const row = known.get(candidate.externalId)
    if (!row) continue
    const gone = await verifyRemoved({ id: link.id, fetchMode }, row.url)
    log(
      `checked ${row.url} — ${gone ? 'gone, marking removed' : 'still live, keeping'}`,
    )
    if (gone) removed.push(row)
  }

  tx(() => {
    for (const listing of changes.added) {
      const lastRank = rankOf.get(listing.externalId) ?? 0
      // A relist keeps its row. firstSeenAt stays put: the row is the permanent archive.
      const previous = existing.get(listing.externalId)
      if (previous)
        updateListing(previous.id, {
          ...listing,
          removedAt: null,
          lastSeenAt: now,
          lastRank,
        })
      const row =
        previous ??
        insertListing({
          ...listing,
          linkId: link.id,
          firstSeenAt: now,
          lastSeenAt: now,
          lastRank,
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

  const result = {
    parsedCount: fetched.length,
    newCount: changes.added.length,
    priceCount: changes.priced.length,
    removedCount: removed.length,
    escalated,
  }
  log(
    `done: ${result.newCount} new · ${result.priceCount} price · ${result.removedCount} removed`,
  )
  return result
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
        // A refresh replaces the previous attempt's log rather than appending to it — the link page
        // shows one run at a time, and its history keeps the older ones.
        log: [],
      })
      const log = (msg: string) => appendRunLinkLog(runId, link.id, msg)
      // Each link is contained: one dead portal must never abort the run.
      try {
        const result = await runLink(runId, link, log)
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
        log(`error: ${error}`)
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
//
// `linkId` narrows the run to one link — the link page's own refresh, and the baseline a new link
// fires on itself. It is still a project run with a one-link checklist, so the timeline, the unread
// counts and the dedupe below all keep working unchanged.
// ponytail: dedupe stays project-wide. The fetch mutex is process-global, so a second run would
// queue rather than overlap anyway; the UI disables refresh while one is in flight.
export function startRun(projectId: number, linkId?: number) {
  const existing = activeRun(projectId)
  if (existing) return { runId: existing.id, finished: Promise.resolve() }

  const all = listLinks(projectId)
  const projectLinks =
    linkId === undefined ? all : all.filter((l) => l.id === linkId)
  const runId = createRun(
    projectId,
    projectLinks.map((l) => l.id),
  )
  const finished = withLock(() => execute(runId, projectId, projectLinks))
  // Nobody awaits the manual path; keep a stray rejection from taking the process down.
  finished.catch(() => {})
  return { runId, finished }
}
