import { eq } from 'drizzle-orm'
import { expect, test } from 'vitest'
import { createDb } from './index'
import { links, listings, projects } from './schema'

// Proves `foreign_keys = ON` is actually in effect: without it the cascades silently no-op.
test('deleting a project cascades to its links and listings', () => {
  const db = createDb(':memory:')

  const project = db
    .insert(projects)
    .values({ name: 'Sulistrowice' })
    .returning()
    .get()
  const link = db
    .insert(links)
    .values({
      projectId: project.id,
      url: 'https://www.olx.pl/nieruchomosci/dzialki/sprzedaz/sulistrowice_143815/',
      portal: 'olx',
      label: 'olx · sulistrowice',
      fetchMode: 'browser',
    })
    .returning()
    .get()
  const listing = db
    .insert(listings)
    .values({
      linkId: link.id,
      externalId: '123456',
      url: 'https://www.olx.pl/d/oferta/dzialka-ID123456.html',
      title: 'Działka budowlana',
      price: 250_000,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      lastRank: 0,
    })
    .returning()
    .get()

  expect(link.status).toBe('pending')
  expect(listing.currency).toBe('PLN')
  expect(listing.removedAt).toBeNull()

  db.delete(projects).where(eq(projects.id, project.id)).run()

  expect(db.select().from(projects).all()).toHaveLength(0)
  expect(db.select().from(links).all()).toHaveLength(0)
  expect(db.select().from(listings).all()).toHaveLength(0)
})
