import { expect, test } from 'vitest'
import { createDb } from './index'
import { listFindings, listProjects, markProjectRead } from './queries'
import { events, links, listings, projects, runs } from './schema'

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
