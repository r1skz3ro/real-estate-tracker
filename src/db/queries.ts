import { and, eq, getTableColumns, isNull, sql } from 'drizzle-orm'
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
    })
    .from(projects)
    .orderBy(projects.createdAt)
    .all()
}

export function getProject(id: number) {
  return db.select().from(projects).where(eq(projects.id, id)).get()
}

export function createProject(data: { name: string }) {
  return db.insert(projects).values(data).returning().get()
}

export function updateProject(
  id: number,
  data: Partial<{ name: string; runAt1: string; runAt2: string }>,
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
export function createRun(
  projectId: number,
  trigger: string,
  linkIds: Array<number>,
): number {
  return tx(() => {
    const run = db
      .insert(runs)
      .values({ projectId, trigger, status: 'running', startedAt: new Date() })
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

export function liveListings(linkId: number) {
  return db
    .select()
    .from(listings)
    .where(and(eq(listings.linkId, linkId), isNull(listings.removedAt)))
    .all()
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
