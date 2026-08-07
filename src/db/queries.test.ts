import { expect, test } from 'vitest'
import { createDb } from './index'
import {
  listFindings,
  listProjects,
  markProjectRead,
  pruneRuns,
} from './queries'
import { events, links, listings, projects, runLinks, runs } from './schema'

// The unread badge is a correlated subquery over a join — it either blows up ("ambiguous column
// name") or silently miscounts, and neither shows up until the sidebar renders.
test('listProjects counts only unread events, per project', () => {
  const db = createDb(':memory:')
  const now = new Date()

  const [a] = db
    .insert(projects)
    .values([{ name: 'A' }, { name: 'B' }])
    .returning()
    .all()
  const link = db
    .insert(links)
    .values({
      projectId: a!.id,
      url: 'https://example.com/search',
      portal: 'gratka',
      label: 'gratka · test',
    })
    .returning()
    .get()
  const listing = db
    .insert(listings)
    .values({
      linkId: link.id,
      externalId: '1',
      url: 'https://example.com/ob/1',
      title: 'Działka',
      firstSeenAt: now,
      lastSeenAt: now,
      lastRank: 0,
    })
    .returning()
    .get()
  const run = db
    .insert(runs)
    .values({
      projectId: a!.id,
      trigger: 'manual',
      status: 'done',
      startedAt: now,
    })
    .returning()
    .get()

  const event = { listingId: listing.id, linkId: link.id, runId: run.id }
  db.insert(events)
    .values([
      { ...event, type: 'new' },
      { ...event, type: 'price', readAt: now },
      { ...event, type: 'removed' },
    ])
    .run()

  const [first, second] = listProjects(db)
  expect(first?.name).toBe('A')
  expect(first?.unread).toBe(2)
  expect(second?.name).toBe('B')
  expect(second?.unread).toBe(0)
})

// A run with zero events has to survive the grouping — dropping it is what makes a quiet week look
// like a broken app. markProjectRead's subquery scope is the other thing that fails silently.
test('listFindings groups events under their run, keeps quiet runs, paginates', () => {
  const db = createDb(':memory:')
  const now = Date.now()

  const [a, b] = db
    .insert(projects)
    .values([{ name: 'A' }, { name: 'B' }])
    .returning()
    .all()
  const [linkA, linkB] = db
    .insert(links)
    .values([
      {
        projectId: a!.id,
        url: 'https://gratka.pl/s',
        portal: 'gratka',
        label: 'gratka · a',
      },
      {
        projectId: b!.id,
        url: 'https://olx.pl/s',
        portal: 'olx',
        label: 'olx · b',
      },
    ])
    .returning()
    .all()

  const listing = (linkId: number, externalId: string, title: string) =>
    db
      .insert(listings)
      .values({
        linkId,
        externalId,
        url: `https://example.com/o/${externalId}`,
        title,
        firstSeenAt: new Date(now),
        lastSeenAt: new Date(now),
        lastRank: 0,
      })
      .returning()
      .get()

  const listingA = listing(linkA!.id, '1', 'Działka A')
  const listingB = listing(linkB!.id, '2', 'Działka B')

  // Deliberately out of chronological insert order — listFindings sorts by startedAt, not id.
  const [quiet, loud] = db
    .insert(runs)
    .values([
      {
        projectId: a!.id,
        trigger: 'scheduled',
        status: 'done',
        startedAt: new Date(now - 60_000),
      },
      {
        projectId: a!.id,
        trigger: 'manual',
        status: 'done',
        startedAt: new Date(now),
      },
    ])
    .returning()
    .all()
  const runB = db
    .insert(runs)
    .values({
      projectId: b!.id,
      trigger: 'manual',
      status: 'done',
      startedAt: new Date(now),
    })
    .returning()
    .get()

  db.insert(events)
    .values([
      {
        listingId: listingA.id,
        linkId: linkA!.id,
        runId: loud!.id,
        type: 'new',
      },
      {
        listingId: listingA.id,
        linkId: linkA!.id,
        runId: loud!.id,
        type: 'price',
        oldPrice: 320_000,
        newPrice: 295_000,
      },
      {
        listingId: listingB.id,
        linkId: linkB!.id,
        runId: runB.id,
        type: 'new',
      },
    ])
    .run()

  const all = listFindings(a!.id, 20, db)
  expect(all.hasMore).toBe(false)
  expect(all.runs.map((r) => r.id)).toEqual([loud!.id, quiet!.id])
  expect(all.runs[0]?.events.map((e) => e.type)).toEqual(['new', 'price'])
  expect(all.runs[0]?.events[0]?.title).toBe('Działka A')
  expect(all.runs[0]?.events[0]?.portal).toBe('gratka')
  expect(all.runs[1]?.events).toEqual([])

  const firstPage = listFindings(a!.id, 1, db)
  expect(firstPage.hasMore).toBe(true)
  expect(firstPage.runs.map((r) => r.id)).toEqual([loud!.id])

  markProjectRead(a!.id, db)
  expect(
    listFindings(a!.id, 20, db).runs.flatMap((r) =>
      r.events.filter((e) => e.readAt === null),
    ),
  ).toEqual([])
  expect(listProjects(db).map((p) => p.unread)).toEqual([0, 1])
})

// The single most damaging mistake available in this codebase is deleting a listing: `listings` is
// the seen-set, so a dropped row comes back as "new" forever — and it is also the archive the user
// exports from years later. Nothing but empty old runs may go.
test('pruneRuns drops only old runs that found nothing, never listings or history', () => {
  const db = createDb(':memory:')
  const now = Date.now()
  const old = new Date(now - 100 * 24 * 60 * 60 * 1000)

  const project = db.insert(projects).values({ name: 'A' }).returning().get()
  const link = db
    .insert(links)
    .values({
      projectId: project.id,
      url: 'https://gratka.pl/s',
      portal: 'gratka',
      label: 'gratka · a',
    })
    .returning()
    .get()
  const [live, gone] = db
    .insert(listings)
    .values([
      {
        linkId: link.id,
        externalId: '1',
        url: 'https://gratka.pl/ob/1',
        title: 'Żywa',
        firstSeenAt: old,
        lastSeenAt: new Date(now),
        lastRank: 0,
      },
      {
        linkId: link.id,
        externalId: '2',
        url: 'https://gratka.pl/ob/2',
        title: 'Usunięta',
        firstSeenAt: old,
        lastSeenAt: old,
        lastRank: 1,
        removedAt: old,
      },
    ])
    .returning()
    .all()

  const run = (startedAt: Date) =>
    db
      .insert(runs)
      .values({
        projectId: project.id,
        trigger: 'scheduled',
        status: 'done',
        startedAt,
      })
      .returning()
      .get()
  const oldQuiet = run(old)
  const oldLoud = run(old)
  const fresh = run(new Date(now))

  db.insert(runLinks).values({ runId: oldQuiet.id, linkId: link.id }).run()
  db.insert(events)
    .values({
      listingId: gone!.id,
      linkId: link.id,
      runId: oldLoud.id,
      type: 'removed',
      oldPrice: 295_000,
    })
    .run()

  expect(pruneRuns(90, db)).toBe(1)

  expect(
    db
      .select()
      .from(runs)
      .all()
      .map((r) => r.id)
      .sort(),
  ).toEqual([oldLoud.id, fresh.id].sort())
  expect(db.select().from(runLinks).all()).toEqual([])
  // Price history and the listings it points at outlive the retention window.
  expect(db.select().from(events).all()).toHaveLength(1)
  expect(
    db
      .select()
      .from(listings)
      .all()
      .map((l) => l.id),
  ).toEqual([live!.id, gone!.id])
})
