import { expect, test } from 'vitest'
import { createDb } from './index'
import {
  appendRunLinkLog,
  archiveLinkListings,
  linkListingsPage,
  linkRuns,
  linkStats,
  listFindings,
  listProjects,
  markProjectRead,
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
        status: 'done',
        startedAt: new Date(now - 60_000),
      },
      {
        projectId: a!.id,
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

// Everything the link page reads, against one graph. These are the queries that fail quietly: a
// mis-scoped subquery just miscounts, and a wrong filter shows the archive as if it were live.
test('the per-link reads scope, order and page correctly', () => {
  const db = createDb(':memory:')
  const now = Date.now()

  const project = db.insert(projects).values({ name: 'A' }).returning().get()
  const [mine, other] = db
    .insert(links)
    .values([
      {
        projectId: project.id,
        url: 'https://gratka.pl/a',
        portal: 'gratka',
        label: 'mine',
      },
      {
        projectId: project.id,
        url: 'https://gratka.pl/b',
        portal: 'gratka',
        label: 'other',
      },
    ])
    .returning()
    .all()

  const listing = (linkId: number, id: string, seenAgo: number, rank: number) =>
    db
      .insert(listings)
      .values({
        linkId,
        externalId: id,
        url: `https://gratka.pl/ob/${id}`,
        title: `Działka ${id}`,
        firstSeenAt: new Date(now - seenAgo),
        lastSeenAt: new Date(now),
        lastRank: rank,
      })
      .returning()
      .get()

  // Two seeded together (same firstSeenAt, split by rank), one older, one belonging elsewhere.
  const newest = listing(mine!.id, '1', 0, 1)
  listing(mine!.id, '2', 0, 0)
  const oldest = listing(mine!.id, '3', 60_000, 0)
  listing(other!.id, '4', 0, 0)

  const run = db
    .insert(runs)
    .values({ projectId: project.id, status: 'done', startedAt: new Date(now) })
    .returning()
    .get()
  db.insert(events)
    .values([
      { listingId: newest.id, linkId: mine!.id, runId: run.id, type: 'new' },
      {
        listingId: oldest.id,
        linkId: mine!.id,
        runId: run.id,
        type: 'price',
        readAt: new Date(now),
      },
    ])
    .run()

  expect(linkStats(mine!.id, db)).toEqual({
    tracked: 3,
    live: 3,
    events: 2,
    unread: 1,
  })
  expect(linkStats(other!.id, db)).toMatchObject({ tracked: 1, events: 0 })

  // firstSeenAt desc, then the portal's own order — a baseline gives every row the same timestamp.
  expect(
    linkListingsPage(mine!.id, {}, db).listings.map((l) => l.externalId),
  ).toEqual(['2', '1', '3'])
  expect(linkListingsPage(mine!.id, { limit: 2 }, db)).toMatchObject({
    hasMore: true,
  })
  expect(linkListingsPage(mine!.id, { limit: 2, offset: 2 }, db)).toMatchObject(
    {
      hasMore: false,
    },
  )

  // Archiving is scoped to live rows of this link, writes no events, and deletes nothing.
  archiveLinkListings(mine!.id, new Date(now), db)
  expect(linkStats(mine!.id, db)).toMatchObject({ tracked: 3, live: 0 })
  expect(linkStats(other!.id, db)).toMatchObject({ tracked: 1, live: 1 })
  expect(
    linkListingsPage(mine!.id, { filter: 'live' }, db).listings,
  ).toHaveLength(0)
  expect(
    linkListingsPage(mine!.id, { filter: 'removed' }, db).listings,
  ).toHaveLength(3)
  expect(db.select().from(events).all()).toHaveLength(2)
})

test('linkRuns returns this link’s history newest first, with its log', () => {
  const db = createDb(':memory:')
  const now = Date.now()

  const project = db.insert(projects).values({ name: 'A' }).returning().get()
  const [mine, other] = db
    .insert(links)
    .values([
      {
        projectId: project.id,
        url: 'https://gratka.pl/a',
        portal: 'gratka',
        label: 'mine',
      },
      {
        projectId: project.id,
        url: 'https://gratka.pl/b',
        portal: 'gratka',
        label: 'other',
      },
    ])
    .returning()
    .all()

  const [first, second] = db
    .insert(runs)
    .values([
      {
        projectId: project.id,
        status: 'done',
        startedAt: new Date(now - 60_000),
      },
      { projectId: project.id, status: 'done', startedAt: new Date(now) },
    ])
    .returning()
    .all()
  db.insert(runLinks)
    .values([
      { runId: first!.id, linkId: mine!.id, status: 'ok', newCount: 1 },
      { runId: second!.id, linkId: mine!.id, status: 'error', error: 'x: y' },
      { runId: second!.id, linkId: other!.id, status: 'ok' },
    ])
    .run()

  appendRunLinkLog(second!.id, mine!.id, 'GET … → 200', db)
  appendRunLinkLog(second!.id, mine!.id, 'error: not-found: HTTP 404', db)

  const history = linkRuns(mine!.id, 20, db)
  expect(history.hasMore).toBe(false)
  expect(history.runs.map((r) => r.runId)).toEqual([second!.id, first!.id])
  expect(history.runs[0]?.status).toBe('error')
  expect(history.runs[0]?.runStartedAt).toBeInstanceOf(Date)
  // Appends accumulate rather than replacing, and land only on their own run-link pair.
  expect(history.runs[0]?.log?.map((l) => l.msg)).toEqual([
    'GET … → 200',
    'error: not-found: HTTP 404',
  ])
  expect(history.runs[1]?.log).toBeNull()

  expect(linkRuns(mine!.id, 1, db).hasMore).toBe(true)
  expect(linkRuns(other!.id, 20, db).runs).toHaveLength(1)
})
