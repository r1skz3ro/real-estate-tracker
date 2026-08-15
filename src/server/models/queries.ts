import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  isNull,
  sql,
} from 'drizzle-orm'
import { db } from './index'
import { events, links, listings, projects, runLinks, runs } from './schema'

// `d` is a seam for tests only — everything in the app uses the singleton.
export function listProjects(d = db) {
  return d
    .select({
      ...getTableColumns(projects),
      // Columns are spelled out against aliases rather than interpolated: inside a raw sql``
      // template drizzle renders `${links.id}` as bare "id", which is ambiguous once two tables
      // are joined ("ambiguous column name: id" at runtime).
      unread: sql<number>`(select count(*) from ${events} e
        join ${links} l on l.id = e.linkId
        where l.projectId = ${projects}.id and e.readAt is null)`,
      // A red link on a project you rarely open is invisible without this.
      failing: sql<number>`(select count(*) from ${links} l
        where l.projectId = ${projects}.id and l.status = 'error')`,
      // Epoch ms, not a Date: a raw column skips drizzle's timestamp mapping. fmtWhen takes both.
      lastRunAt: sql<number | null>`(select max(lastRunAt) from ${links} l
        where l.projectId = ${projects}.id)`,
    })
    .from(projects)
    .orderBy(projects.createdAt)
    .all()
}

export function getProject(id: number) {
  return db.select().from(projects).where(eq(projects.id, id)).get()
}

export function createProject(data: typeof projects.$inferInsert) {
  return db.insert(projects).values(data).returning().get()
}

export function updateProject(
  id: number,
  data: Partial<typeof projects.$inferInsert>,
) {
  return db
    .update(projects)
    .set(data)
    .where(eq(projects.id, id))
    .returning()
    .get()
}

export function deleteProject(id: number) {
  db.delete(projects).where(eq(projects.id, id)).run()
}

export function listLinks(projectId: number) {
  return db
    .select()
    .from(links)
    .where(eq(links.projectId, projectId))
    .orderBy(links.createdAt)
    .all()
}

export function getLink(id: number) {
  return db.select().from(links).where(eq(links.id, id)).get()
}

// Correlated subqueries for the same reason as listProjects: the link header wants all four at once,
// and the aliases keep `id` unambiguous inside the raw sql`` templates.
export function linkStats(linkId: number, d = db) {
  return d
    .select({
      tracked: sql<number>`(select count(*) from ${listings} li
        where li.linkId = ${links}.id)`,
      live: sql<number>`(select count(*) from ${listings} li
        where li.linkId = ${links}.id and li.removedAt is null)`,
      events: sql<number>`(select count(*) from ${events} e
        where e.linkId = ${links}.id)`,
      unread: sql<number>`(select count(*) from ${events} e
        where e.linkId = ${links}.id and e.readAt is null)`,
    })
    .from(links)
    .where(eq(links.id, linkId))
    .get()
}

export function createLink(data: {
  projectId: number
  url: string
  portal: string
  label: string
  fetchMode?: string
}) {
  return db.insert(links).values(data).returning().get()
}

export function updateLink(
  id: number,
  data: Partial<typeof links.$inferInsert>,
) {
  return db.update(links).set(data).where(eq(links.id, id)).returning().get()
}

export function deleteLink(id: number) {
  db.delete(links).where(eq(links.id, id)).run()
}

// better-sqlite3 is synchronous, so a whole link's result applies atomically inside one callback.
// Statements issued through the singleton `db` in here join the transaction — same connection.
export function tx<T>(fn: () => T): T {
  return db.transaction(fn)
}

// The run row and its checklist go in together, before any network call, so the UI can render the
// full list of links immediately instead of items appearing one by one.
export function createRun(projectId: number, linkIds: Array<number>): number {
  return tx(() => {
    const run = db
      .insert(runs)
      .values({ projectId, status: 'running', startedAt: new Date() })
      .returning()
      .get()
    if (linkIds.length > 0)
      db.insert(runLinks)
        .values(linkIds.map((linkId) => ({ runId: run.id, linkId })))
        .run()
    return run.id
  })
}

export function activeRun(projectId: number) {
  return db
    .select()
    .from(runs)
    .where(and(eq(runs.projectId, projectId), eq(runs.status, 'running')))
    .get()
}

// Every run in flight with how far its checklist has got — the sidebar's live state for all
// projects at once. A multi-project refresh creates all its run rows up front and the global fetch
// mutex walks them one at a time, so `fetching` is what separates the one working from the queue.
// Table names are literal inside sql``: interpolating `${runLinks.status}` renders bare "status",
// which `runs` also has ("ambiguous column name" at runtime).
export function activeRuns(d = db) {
  return d
    .select({
      projectId: runs.projectId,
      total: count(runLinks.id),
      done: sql<number>`coalesce(sum(case when runLinks.status in ('ok', 'error') then 1 else 0 end), 0)`,
      fetching: sql<number>`coalesce(sum(case when runLinks.status = 'running' then 1 else 0 end), 0)`,
    })
    .from(runs)
    .leftJoin(runLinks, eq(runLinks.runId, runs.id))
    .where(eq(runs.status, 'running'))
    .groupBy(runs.id)
    .all()
}

export function finishRun(id: number, status: string) {
  db.update(runs)
    .set({ status, finishedAt: new Date() })
    .where(eq(runs.id, id))
    .run()
}

// Keyed by (runId, linkId) rather than the row id — the orchestrator already has both.
export function updateRunLink(
  runId: number,
  linkId: number,
  data: Partial<typeof runLinks.$inferInsert>,
) {
  db.update(runLinks)
    .set(data)
    .where(and(eq(runLinks.runId, runId), eq(runLinks.linkId, linkId)))
    .run()
}

export function getRunStatus(runId: number) {
  const run = db.select().from(runs).where(eq(runs.id, runId)).get()
  if (!run) return null
  return {
    run,
    links: db
      .select({
        ...getTableColumns(runLinks),
        label: links.label,
        portal: links.portal,
        // Lets the UI tell a baseline (baselined during this run) from a quiet run — both report
        // zero events.
        baselinedAt: links.baselinedAt,
      })
      .from(runLinks)
      .innerJoin(links, eq(links.id, runLinks.linkId))
      .where(eq(runLinks.runId, runId))
      .orderBy(runLinks.id)
      .all(),
  }
}

const MAX_LOG_LINES = 200

// ponytail: read-modify-write on the row's own JSON. ~15 writes per link per run on a synchronous
// driver, and no query ever reads a log line across runs — promote to a rows table if one does.
export function appendRunLinkLog(
  runId: number,
  linkId: number,
  msg: string,
  d = db,
) {
  const pair = and(eq(runLinks.runId, runId), eq(runLinks.linkId, linkId))
  const row = d.select({ log: runLinks.log }).from(runLinks).where(pair).get()
  const log = [...(row?.log ?? []), { at: Date.now(), msg }]
  d.update(runLinks)
    .set({ log: log.slice(-MAX_LOG_LINES) })
    .where(pair)
    .run()
}

// One link's fetch history, newest first — and its logs with it, since the log lives on the row.
export function linkRuns(linkId: number, limit = 20, d = db) {
  const page = d
    .select({
      ...getTableColumns(runLinks),
      runStatus: runs.status,
      runStartedAt: runs.startedAt,
      runFinishedAt: runs.finishedAt,
    })
    .from(runLinks)
    .innerJoin(runs, eq(runs.id, runLinks.runId))
    .where(eq(runLinks.linkId, linkId))
    .orderBy(desc(runLinks.id))
    .limit(limit + 1)
    .all()
  return { runs: page.slice(0, limit), hasMore: page.length > limit }
}

// Removed rows come back too: they are still the seen-set, and a relisted id must find its own row
// rather than insert a second one.
export function linkListings(linkId: number) {
  return db.select().from(listings).where(eq(listings.linkId, linkId)).all()
}

export type ListingFilter = 'all' | 'live' | 'removed'

// The link page's read: paged and ordered, unlike linkListings which the run needs whole. Ordered by
// when we first saw it, then by the portal's own ordering within a batch — a baseline seeds every
// row with the same firstSeenAt, so lastRank is what keeps "newest first" meaningful there.
export function linkListingsPage(
  linkId: number,
  { limit = 20, offset = 0, filter = 'all' } = {},
  d = db,
) {
  const scope =
    filter === 'live'
      ? isNull(listings.removedAt)
      : filter === 'removed'
        ? isNotNull(listings.removedAt)
        : undefined

  const { details: _details, ...columns } = getTableColumns(listings)

  const page = d
    // Every column but `details`: it is a per-portal grab bag of `unknown`, which no view renders
    // and which a server function cannot prove serializable. It stays in the table as the archive.
    .select(columns)
    .from(listings)
    .where(and(eq(listings.linkId, linkId), scope))
    .orderBy(desc(listings.firstSeenAt), asc(listings.lastRank))
    .limit(limit + 1)
    .offset(offset)
    .all()

  return { listings: page.slice(0, limit), hasMore: page.length > limit }
}

// A link's URL changed, so the old search's results are no longer its seen-set. Rule 4 still holds —
// they are archived, never deleted — and no events are written: nobody took these offers down, we
// simply stopped looking at them.
export function archiveLinkListings(linkId: number, at: Date, d = db) {
  d.update(listings)
    .set({ removedAt: at })
    .where(and(eq(listings.linkId, linkId), isNull(listings.removedAt)))
    .run()
}

export function insertListing(data: typeof listings.$inferInsert) {
  return db.insert(listings).values(data).returning().get()
}

export function updateListing(
  id: number,
  data: Partial<typeof listings.$inferInsert>,
) {
  db.update(listings).set(data).where(eq(listings.id, id)).run()
}

export function insertEvent(data: typeof events.$inferInsert) {
  db.insert(events).values(data).run()
}

// Runs newest-first with their events attached. A run with no events keeps an empty array on
// purpose — the timeline renders it as the "no changes" line, and dropping it would make a quiet
// week look like a broken app.
export function listFindings(projectId: number, limit = 20, d = db) {
  // limit + 1 answers "is there more?" without a second count query.
  const page = d
    .select()
    .from(runs)
    .where(eq(runs.projectId, projectId))
    .orderBy(desc(runs.startedAt), desc(runs.id))
    .limit(limit + 1)
    .all()
  const visible = page.slice(0, limit)
  const runIds = visible.map((r) => r.id)

  const rows = runIds.length
    ? d
        .select({
          ...getTableColumns(events),
          title: listings.title,
          url: listings.url,
          price: listings.price,
          areaM2: listings.areaM2,
          pricePerM2: listings.pricePerM2,
          location: listings.location,
          imageUrl: listings.imageUrl,
          portal: links.portal,
          label: links.label,
        })
        .from(events)
        .innerJoin(listings, eq(listings.id, events.listingId))
        .innerJoin(links, eq(links.id, events.linkId))
        .where(inArray(events.runId, runIds))
        .orderBy(events.id)
        .all()
    : []

  const byRun = new Map<number, typeof rows>()
  for (const row of rows) {
    const bucket = byRun.get(row.runId)
    if (bucket) bucket.push(row)
    else byRun.set(row.runId, [row])
  }

  return {
    runs: visible.map((run) => ({ ...run, events: byRun.get(run.id) ?? [] })),
    hasMore: page.length > limit,
  }
}

export function markRunRead(runId: number, d = db) {
  d.update(events)
    .set({ readAt: new Date() })
    .where(and(eq(events.runId, runId), isNull(events.readAt)))
    .run()
}

// events.linkId is denormalised precisely so this needs no join.
export function markProjectRead(projectId: number, d = db) {
  d.update(events)
    .set({ readAt: new Date() })
    .where(
      and(
        isNull(events.readAt),
        inArray(
          events.linkId,
          d
            .select({ id: links.id })
            .from(links)
            .where(eq(links.projectId, projectId)),
        ),
      ),
    )
    .run()
}
