# Phase 01 — Database

**Goal:** Drizzle schema, migrations, and a singleton connection. No UI.

## Schema (`src/db/schema.ts`)

SQLite via `drizzle-orm/sqlite-core`. Timestamps as integer epoch ms (`{ mode: 'timestamp_ms' }`).

```ts
projects
  id            integer pk autoincrement
  name          text not null
  runAt1        text not null default '08:00'   // 'HH:MM', Europe/Warsaw
  runAt2        text not null default '20:00'
  lastScheduledAt integer                        // last time the scheduler fired for this project
  createdAt     integer not null

links
  id          integer pk autoincrement
  projectId   integer not null → projects.id  ON DELETE CASCADE
  url         text not null
  portal      text not null                    // 'olx'|'otodom'|'gratka'|'adresowo'|'nieruchomosci-online'
  label       text not null
  fetchMode   text not null default 'http'     // 'http'|'browser'
  status      text not null default 'pending'  // 'pending'|'ok'|'error'
  lastError   text
  lastRunAt   integer
  baselinedAt integer                          // null until the first successful fetch
  createdAt   integer not null

runs
  id         integer pk autoincrement
  projectId  integer not null → projects.id ON DELETE CASCADE
  trigger    text not null                     // 'manual'|'scheduled'
  status     text not null                     // 'running'|'done'|'failed'
  startedAt  integer not null
  finishedAt integer

runLinks
  id            integer pk autoincrement
  runId         integer not null → runs.id ON DELETE CASCADE
  linkId        integer not null → links.id ON DELETE CASCADE
  status        text not null default 'pending' // 'pending'|'running'|'ok'|'error'
  parsedCount   integer not null default 0
  newCount      integer not null default 0
  priceCount    integer not null default 0
  removedCount  integer not null default 0
  escalated     integer not null default 0      // boolean: fell back to browser
  error         text
  startedAt     integer
  finishedAt    integer

listings                                        // the seen-set
  id          integer pk autoincrement
  linkId      integer not null → links.id ON DELETE CASCADE
  externalId  text not null                     // portal's own id, stable across refreshes
  url         text not null
  title       text not null
  price       integer                           // whole PLN, nullable ("cena do negocjacji")
  currency    text not null default 'PLN'
  areaM2      real
  pricePerM2  real
  location    text
  imageUrl    text
  firstSeenAt integer not null
  lastSeenAt  integer not null
  lastRank    integer not null                  // position in last fetch; used by removal detection
  removedAt   integer                           // null = live
  UNIQUE (linkId, externalId)

events                                          // the timeline
  id         integer pk autoincrement
  listingId  integer not null → listings.id ON DELETE CASCADE
  linkId     integer not null → links.id ON DELETE CASCADE
  runId      integer not null → runs.id ON DELETE CASCADE
  type       text not null                      // 'new'|'price'|'removed'
  oldPrice   integer
  newPrice   integer
  readAt     integer                            // null = unread
  createdAt  integer not null
```

Indexes: `listings(linkId, externalId)` unique, `listings(linkId, removedAt)`, `events(linkId, createdAt)`,
`events(readAt)`, `runLinks(runId)`, `runs(projectId, startedAt)`.

`linkId` is denormalised onto `events` on purpose — the unread badge counts events per project and
would otherwise join through `listings` on every render.

## Connection (`src/db/index.ts`)

```ts
// singleton — better-sqlite3 is synchronous, one connection is correct
const sqlite = new Database('data/estate.db')
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')   // SQLite defaults this OFF; cascades silently no-op without it
export const db = drizzle(sqlite, { schema })
```

Create `data/` if missing. It is gitignored.

## Queries (`src/db/queries.ts`)

Plain exported functions, no repository classes, no generic CRUD wrapper. Start with what phases 02–03
need and grow the file as later phases require:

`listProjects()` (with unread counts), `getProject(id)`, `createProject`, `updateProject`,
`deleteProject`, `listLinks(projectId)`, `createLink`, `deleteLink`.

`listProjects()` returns the unread badge in the same query:

```sql
SELECT p.*, (SELECT count(*) FROM events e
             JOIN links l ON l.id = e.linkId
             WHERE l.projectId = p.id AND e.readAt IS NULL) AS unread
FROM projects p ORDER BY p.createdAt
```

## drizzle.config.ts

Dialect `sqlite`, schema `./src/db/schema.ts`, out `./drizzle`. Scripts: `db:generate`, `db:migrate`.
Run migrations at server start too, so a fresh clone just works.

## Done when

- `pnpm db:generate && pnpm db:migrate` creates `data/estate.db` with all six tables.
- A Vitest smoke test inserts a project + link + listing, reads them back, deletes the project, and
  asserts the link and listing are gone — this proves `foreign_keys = ON` is actually in effect.
