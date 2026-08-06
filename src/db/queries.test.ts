import { expect, test } from 'vitest'
import { createDb } from './index'
import { listProjects } from './queries'
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
