import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import type { ListingDetails } from '#/server/parsers/util'

const createdAt = () =>
  integer('createdAt', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date())

export const projects = sqliteTable('projects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  // 'HH:MM', Europe/Warsaw
  runAt1: text('runAt1').notNull().default('08:00'),
  runAt2: text('runAt2').notNull().default('20:00'),
  lastScheduledAt: integer('lastScheduledAt', { mode: 'timestamp_ms' }),
  createdAt: createdAt(),
})

export const links = sqliteTable('links', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('projectId')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  // 'olx'|'otodom'|'gratka'|'adresowo'|'nieruchomosci-online'
  portal: text('portal').notNull(),
  label: text('label').notNull(),
  fetchMode: text('fetchMode').notNull().default('http'), // 'http'|'browser'
  status: text('status').notNull().default('pending'), // 'pending'|'ok'|'error'
  lastError: text('lastError'),
  lastRunAt: integer('lastRunAt', { mode: 'timestamp_ms' }),
  // null until the first successful fetch
  baselinedAt: integer('baselinedAt', { mode: 'timestamp_ms' }),
  createdAt: createdAt(),
})

export const runs = sqliteTable(
  'runs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('projectId')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    trigger: text('trigger').notNull(), // 'manual'|'scheduled'
    status: text('status').notNull(), // 'running'|'done'|'failed'
    startedAt: integer('startedAt', { mode: 'timestamp_ms' }).notNull(),
    finishedAt: integer('finishedAt', { mode: 'timestamp_ms' }),
  },
  (t) => [index('runs_project_started').on(t.projectId, t.startedAt)],
)

export const runLinks = sqliteTable(
  'runLinks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    runId: integer('runId')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    linkId: integer('linkId')
      .notNull()
      .references(() => links.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('pending'), // 'pending'|'running'|'ok'|'error'
    parsedCount: integer('parsedCount').notNull().default(0),
    newCount: integer('newCount').notNull().default(0),
    priceCount: integer('priceCount').notNull().default(0),
    removedCount: integer('removedCount').notNull().default(0),
    // fell back to browser
    escalated: integer('escalated', { mode: 'boolean' })
      .notNull()
      .default(false),
    error: text('error'),
    startedAt: integer('startedAt', { mode: 'timestamp_ms' }),
    finishedAt: integer('finishedAt', { mode: 'timestamp_ms' }),
  },
  (t) => [index('runLinks_run').on(t.runId)],
)

// The seen-set. Never delete a row with removedAt IS NULL — it would reappear as "new" forever.
export const listings = sqliteTable(
  'listings',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    linkId: integer('linkId')
      .notNull()
      .references(() => links.id, { onDelete: 'cascade' }),
    // portal's own id, stable across refreshes
    externalId: text('externalId').notNull(),
    url: text('url').notNull(),
    title: text('title').notNull(),
    price: integer('price'), // whole PLN, nullable ("cena do negocjacji")
    currency: text('currency').notNull().default('PLN'),
    areaM2: real('areaM2'),
    pricePerM2: real('pricePerM2'),
    location: text('location'),
    imageUrl: text('imageUrl'),
    // Captured at first sight and not refreshed afterwards (only price is) — listings outlive the
    // portal offer here, so this is the archive copy of what the search page said.
    description: text('description'),
    details: text('details', { mode: 'json' }).$type<ListingDetails>(),
    firstSeenAt: integer('firstSeenAt', { mode: 'timestamp_ms' }).notNull(),
    lastSeenAt: integer('lastSeenAt', { mode: 'timestamp_ms' }).notNull(),
    // position in last fetch; used by removal detection
    lastRank: integer('lastRank').notNull(),
    removedAt: integer('removedAt', { mode: 'timestamp_ms' }), // null = live
  },
  (t) => [
    uniqueIndex('listings_link_external').on(t.linkId, t.externalId),
    index('listings_link_removed').on(t.linkId, t.removedAt),
  ],
)

// The timeline. linkId is denormalised on purpose: the unread badge counts events per project and
// would otherwise join through listings on every render.
export const events = sqliteTable(
  'events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    listingId: integer('listingId')
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    linkId: integer('linkId')
      .notNull()
      .references(() => links.id, { onDelete: 'cascade' }),
    runId: integer('runId')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // 'new'|'price'|'removed'
    oldPrice: integer('oldPrice'),
    newPrice: integer('newPrice'),
    readAt: integer('readAt', { mode: 'timestamp_ms' }), // null = unread
    createdAt: createdAt(),
  },
  (t) => [
    index('events_link_created').on(t.linkId, t.createdAt),
    index('events_read').on(t.readAt),
  ],
)
