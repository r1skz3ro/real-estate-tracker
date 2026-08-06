import { eq, getTableColumns, sql } from 'drizzle-orm'
import { db } from './index'
import { events, links, projects } from './schema'

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

export function deleteLink(id: number) {
  db.delete(links).where(eq(links.id, id)).run()
}

// ponytail: only what phases 02-03 need. Runs/listings/events queries land with their phases.
