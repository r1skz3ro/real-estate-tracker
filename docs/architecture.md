# How Estate Tracker works

A complete technical walkthrough of the running system: what lives in which process, where data is
stored, how a portal page is fetched, how bot protection is handled, how "this listing is new" is
decided, and which file is responsible for what.

This document describes the system as built. [`README.md`](../README.md) covers setup and daily use,
[`docs/portals.md`](./portals.md) is the per-portal extraction reference, [`CLAUDE.md`](../CLAUDE.md)
is the rule sheet for people (and agents) changing the code, and `phases/` holds the build plan the
repo was written from.

---

## 1. The shape of the whole thing

Estate Tracker watches saved search URLs on five Polish real-estate portals and reports what changed
since the last look: **new listings, price changes, removals**.

It is a single-user, no-auth, local application. There is no backend service, no job queue, no
message broker, no container, no database server. **One Node process does everything**:

```
one node process  (pnpm dev, or pnpm build && pnpm preview)
│
├── TanStack Start HTTP handler ── :3000 ──► React SSR + /_serverFn RPC endpoints
│
├── better-sqlite3 ──► data/estate.db      (in-process, synchronous, no daemon)
│
└── Playwright Chromium ──► launched on demand during a run, killed when the run ends
```

Nothing is scheduled and nothing polls. The process sits idle until someone presses **Refresh**;
that click is the only thing that ever starts a run. Kill the process and nothing keeps running.
All state is the one SQLite file plus a cookie jar next to it.

The whole system is roughly 2,000 lines of TypeScript across `src/`. Here is the map:

| Directory               | Responsibility                                                           |
| ----------------------- | ------------------------------------------------------------------------ |
| `src/routes/`           | Three file-based routes: the shell/sidebar, the project list, a project. |
| `src/components/`       | `findings.tsx` (the changes timeline) + `ui/` (shadcn/ui primitives).    |
| `src/lib/`              | `format.ts` (Intl formatters, error copy), `utils.ts` (`cn()`).          |
| `src/server/*.ts`       | The RPC boundary — `createServerFn` wrappers with zod validators.        |
| `src/server/fetch/`     | HTTP + Playwright fetching, block detection, the politeness mutex.       |
| `src/server/parsers/`   | One parser per portal + byte-for-byte HTML fixtures.                     |
| `src/server/diff.ts`    | Pure change detection. No DB, no network.                                |
| `src/server/run.ts`     | The orchestrator: fetch → parse → diff → persist.                        |
| `src/server/portals.ts` | Single source of truth for portal identity.                              |
| `src/db/`               | Drizzle schema, the connection singleton, every query function.          |
| `drizzle/`              | Generated SQL migrations (committed).                                    |
| `data/`                 | The SQLite file and Playwright cookies (gitignored, runtime-created).    |

---

## 2. Boot: what happens when the process starts

### There is no server entry override

TanStack Start's packaged server entry is used as-is. The repo used to override it (`src/server.ts`)
purely to boot the scheduler; with refresh manual-only there is no boot-time side effect left to
run, so the file is gone.

### The import chain that opens the database

Nothing opens the database at boot. The first server function to be called drags the data layer into
existence, and it stays for the life of the process:

```
a /_serverFn request
  └─ #/server/projects | runs | links
       └─ #/db/queries
            └─ #/db/index  ──► export const db = createDb()   ← the file is opened HERE
```

`createDb()` in `src/db/index.ts` is the whole connection story:

```ts
export function createDb(file = 'data/estate.db') {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true })
  const sqlite = new Database(file)
  sqlite.pragma('journal_mode = WAL')
  // SQLite defaults this OFF; cascading deletes silently no-op without it.
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  // Migrate on construction, so a fresh clone (and `pnpm dev`) just works.
  migrate(db, { migrationsFolder: 'drizzle' })
  return db
}

// better-sqlite3 is synchronous; one connection per process is correct.
export const db = createDb()
```

Four consequences worth internalising:

1. **Migrations run on first use.** `pnpm db:migrate` exists but is optional — a fresh clone just
   works.
2. **`foreign_keys = ON` is not optional.** SQLite defaults it off, and every cascade in this schema
   depends on it. `src/db/schema.test.ts` exists purely to prove the pragma is live.
3. **Both `data/estate.db` and `drizzle/` are relative paths.** Start the process from the repo root
   or you get a second, empty database somewhere else.
4. **The connection is a module singleton, never closed.** `createDb` is exported only so tests can
   open a throwaway `:memory:` database through the same pragma + migrate path.

### One Vite quirk

`vite.config.ts` carries:

```ts
// The client dep scan crawls route → server fn → fetch/browser → playwright, whose optional
// fsevents ships a native .node the optimizer chokes on. Server-only; never bundled anyway.
optimizeDeps: { exclude: ['playwright'] },
```

---

## 3. Where the data actually lives

**There is no database running in the background.** `better-sqlite3` is a native library compiled
into the Node process — synchronous function calls straight into SQLite's C code. Nothing listens on
a port, nothing needs starting, nothing needs stopping. Because every call is synchronous, none of
the query functions in `src/db/queries.ts` are `async`, and transactions are a plain callback.

Everything persistent is in `data/`, which is gitignored and created at runtime:

| File                      | What it is                                                      |
| ------------------------- | --------------------------------------------------------------- |
| `data/estate.db`          | The database. Projects, links, listings, runs, events.          |
| `data/estate.db-wal`      | Write-ahead log (`journal_mode = WAL`). Normal, not a leftover. |
| `data/estate.db-shm`      | WAL shared-memory index. Also normal.                           |
| `data/browser-state.json` | Playwright `storageState` — cookies and localStorage for OLX.   |

Back it up with `sqlite3 data/estate.db ".backup backup.db"` (safe while the app is running; copying
the file by hand while WAL is active is not). Deleting `estate.db` loses all history and re-baselines
every link — no false flood of "new" listings, but the old timeline is gone.

---

## 4. The data model

Six tables. There is **no settings table** and no configuration to store: a project is a name and
the links under it.

```
projects ─┬─* links ─┬─* listings ─* events
          │          ├─* runLinks
          │          └─* events        (linkId denormalised)
          └─* runs ──┬─* runLinks
                     └─* events
```

Everything is defined in `src/db/schema.ts` using Drizzle's SQLite builder. All primary keys are
`integer autoincrement`; all timestamps are `integer` columns with `mode: 'timestamp_ms'`, so they
are JS `Date` objects in code and millisecond epochs on disk.

### `projects`

A set of searches refreshed together.

| Column      | Type         | Notes    |
| ----------- | ------------ | -------- |
| `id`        | integer PK   |          |
| `name`      | text         | not null |
| `createdAt` | timestamp_ms | not null |

### `links`

One saved search URL. Capped at 10 per project — enforced in `src/server/links.ts` (`MAX_LINKS`),
not in the schema.

| Column        | Type         | Notes                                                             |
| ------------- | ------------ | ----------------------------------------------------------------- |
| `id`          | integer PK   |                                                                   |
| `projectId`   | integer FK   | → `projects.id`, **cascade delete**                               |
| `url`         | text         | the saved search URL, exactly as pasted                           |
| `portal`      | text         | `olx` / `otodom` / `gratka` / `adresowo` / `nieruchomosci-online` |
| `label`       | text         | derived from the URL, editable inline                             |
| `fetchMode`   | text         | `'http'` \| `'browser'`, default `'http'`                         |
| `status`      | text         | `'pending'` \| `'ok'` \| `'error'`                                |
| `lastError`   | text         | nullable, `'<category>: <detail>'`                                |
| `lastRunAt`   | timestamp_ms | nullable                                                          |
| `baselinedAt` | timestamp_ms | **null until the first successful fetch**                         |
| `createdAt`   | timestamp_ms |                                                                   |

Two columns carry state the run loop mutates: `fetchMode` is permanently upgraded to `'browser'` the
first time a link is blocked (§5d), and `baselinedAt === null` is what marks the next run as a silent
baseline (§8).

### `runs` and `runLinks`

A run is one refresh of one project. `runLinks` is the per-link checklist for that run, and it is
what the UI polls while a refresh is in flight.

| `runs`       | Type         | Notes                                 |
| ------------ | ------------ | ------------------------------------- |
| `id`         | integer PK   |                                       |
| `projectId`  | integer FK   | → `projects.id`, cascade              |
| `status`     | text         | `'running'` \| `'done'` \| `'failed'` |
| `startedAt`  | timestamp_ms | not null                              |
| `finishedAt` | timestamp_ms | nullable while running                |

| `runLinks`                                           | Type         | Notes                                       |
| ---------------------------------------------------- | ------------ | ------------------------------------------- |
| `runId` / `linkId`                                   | integer FK   | both cascade                                |
| `status`                                             | text         | `'pending'`→`'running'`→`'ok'`\|`'error'`   |
| `parsedCount` `newCount` `priceCount` `removedCount` | integer      | default 0 — the run summary shown in the UI |
| `escalated`                                          | boolean      | integer 0/1 — "fell back to browser"        |
| `error`                                              | text         | nullable, same format as `links.lastError`  |
| `startedAt` / `finishedAt`                           | timestamp_ms | nullable                                    |

Index `runs_project_started (projectId, startedAt)` drives the newest-first timeline;
`runLinks_run (runId)` drives the polling query.

### `listings` — the seen-set _and_ the permanent archive

This table has two jobs at once, and both constrain what you may do to it. The schema says so:

```ts
// The seen-set. Never delete a row with removedAt IS NULL — it would reappear as "new" forever.
```

| Column                       | Type         | Notes                                                   |
| ---------------------------- | ------------ | ------------------------------------------------------- |
| `id`                         | integer PK   |                                                         |
| `linkId`                     | integer FK   | → `links.id`, cascade                                   |
| `externalId`                 | text         | the portal's own id, stable across refreshes            |
| `url`                        | text         | the listing's own detail URL — used to confirm removals |
| `title`                      | text         |                                                         |
| `price`                      | integer      | whole PLN, nullable (`"cena do negocjacji"`)            |
| `currency`                   | text         | default `'PLN'`                                         |
| `areaM2` / `pricePerM2`      | real         | nullable                                                |
| `location` / `imageUrl`      | text         | nullable                                                |
| `description`                | text         | nullable — captured at first sight, never refreshed     |
| `details`                    | text (json)  | nullable — whatever extra the portal published          |
| `firstSeenAt` / `lastSeenAt` | timestamp_ms | not null                                                |
| `lastRank`                   | integer      | position in the last fetch — removal detection reads it |
| `removedAt`                  | timestamp_ms | **null = live**                                         |

- `uniqueIndex('listings_link_external').on(linkId, externalId)` is the dedupe key. It is why the
  diff engine deduplicates additions before they reach the insert.
- `index('listings_link_removed').on(linkId, removedAt)` serves `liveListings()`, the hot read.
- After insert, only `price`, `pricePerM2`, `lastSeenAt`, `lastRank` and `removedAt` are ever
  updated. Title, description and photo stay as first captured — the row has to stay exportable
  years after the portal drops the offer.

### `events` — the timeline

One row per thing that happened to a listing.

| Column                  | Type         | Notes                                    |
| ----------------------- | ------------ | ---------------------------------------- |
| `listingId`             | integer FK   | → `listings.id`, cascade                 |
| `linkId`                | integer FK   | → `links.id`, cascade — **denormalised** |
| `runId`                 | integer FK   | → `runs.id`, cascade                     |
| `type`                  | text         | `'new'` \| `'price'` \| `'removed'`      |
| `oldPrice` / `newPrice` | integer      | nullable                                 |
| `readAt`                | timestamp_ms | **null = unread**                        |
| `createdAt`             | timestamp_ms |                                          |

`linkId` is denormalised deliberately — the sidebar's unread badge counts events per project on every
render, and would otherwise join through `listings` each time. `markProjectRead()` needs no join for
the same reason. Indexes: `events_link_created (linkId, createdAt)` and `events_read (readAt)`.

### Cascades

Every foreign key is `ON DELETE cascade`:

- delete a **project** → its links, runs, runLinks, listings and events all go;
- delete a **link** → its listings, its runLinks rows and its events go (runs survive, they hang off
  the project);
- delete a **run** → its runLinks go, **and its events go with them** — which is exactly why nothing
  in the app ever deletes a run. Runs, events and listings accumulate forever; only an explicit
  project or link deletion by the user removes anything.

There are no `CHECK` constraints and no Drizzle enums: the string unions above are documented in
comments and enforced at the zod boundary in `src/server/*.ts`.

### Migrations

`drizzle.config.ts` points drizzle-kit at `src/db/schema.ts` → `drizzle/`. Two migrations exist:

- `drizzle/0000_unknown_puma.sql` — all six tables and five indexes.
- `drizzle/0001_brown_shadow_king.sql` — adds `listings.description` and `listings.details`.

`pnpm db:generate` diffs the schema file against `drizzle/meta/` snapshots and writes a new SQL file;
`pnpm db:migrate` applies pending ones. Applying also happens automatically at boot, so `db:migrate`
matters mainly for creating the file before the first `pnpm dev`. The `drizzle/` folder is
prettier-ignored but committed.

---

## 5. Fetching a portal page

This is the part with the most non-obvious behaviour. It lives in `src/server/fetch/` (three files)
plus `src/server/portals.ts`.

### 5a. Portal identity

`src/server/portals.ts` is the **single source of truth** for which portal a URL belongs to and how
it must be fetched. Nothing else re-derives it.

```ts
export const PORTALS = {
  olx: { host: /(^|\.)olx\.pl$/, fetchMode: 'browser', ready: '[data-cy="l-card"]' },
  otodom: { host: /(^|\.)otodom\.pl$/, fetchMode: 'http', ready: 'script#__NEXT_DATA__' },
  ...
} as const
```

| Portal                 | `fetchMode` | `ready` selector (browser path only) |
| ---------------------- | ----------- | ------------------------------------ |
| `olx`                  | `browser`   | `[data-cy="l-card"]`                 |
| `otodom`               | `http`      | `script#__NEXT_DATA__`               |
| `gratka`               | `http`      | `[data-property-id]`                 |
| `adresowo`             | `http`      | `a[data-track="offer-link"]`         |
| `nieruchomosci-online` | `http`      | `script[type="application/ld+json"]` |

`detectPortal(url)` parses the URL and tests each regex against `new URL(url).hostname` — never a
substring:

```ts
// Matched against the parsed hostname, never a substring: nieruchomosci-online.pl.evil.com must not
// match, wroclaw.nieruchomosci-online.pl must.
```

The `fetchMode` here is only the **seed** value written into `links.fetchMode` when a link is created.
After that the database column is authoritative, because a link can escalate (§5d).

Two other exports live here: `pageUrl(portal, url, page)` builds a page-2 URL (three portals take a
`page` query param; nieruchomosci-online's query string is positional so the param is appended raw;
adresowo encodes the page in a path token), and `deriveLabel()` produces the default link label.

### 5b. Two ways to fetch

**`httpFetch(url)`** — `src/server/fetch/http.ts`. Plain `fetch()` with a complete Chrome-141-on-macOS
navigation header set: `user-agent`, `accept`, `accept-language: pl-PL,pl;q=0.9,…`, `sec-ch-ua`,
`sec-ch-ua-mobile`, `sec-ch-ua-platform: "macOS"`, `sec-fetch-dest/mode/site/user`,
`upgrade-insecure-requests`. Timeout `AbortSignal.timeout(25_000)`. No cookie jar, no retries.
Returns `{ ok, status, html, blocked, url }`, where `url` is post-redirect.

**`browserFetch(url, waitFor?)`** — `src/server/fetch/browser.ts`. Playwright Chromium, with a
module-level singleton browser and context:

```ts
context = await browser.newContext({
  userAgent: UA, // the same string the HTTP path sends
  locale: 'pl-PL',
  timezoneId: 'Europe/Warsaw',
  viewport: { width: 1440, height: 900 },
  // Reloading cookies makes OLX see a returning visitor rather than a fresh one every 12 hours.
  storageState: existsSync(STATE_FILE) ? STATE_FILE : undefined,
})
```

Navigation is `goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })`, then, if the portal
declared a `ready` selector:

```ts
await page
  .waitForSelector(waitFor, { timeout: 15_000 })
  .catch(() => page.waitForTimeout(2_000))
```

A missing selector degrades to a flat 2-second wait rather than throwing — an empty search page
legitimately has no listing cards. Each fetch opens and closes a page; **the context stays alive,
because that is where the cookies live**.

### 5c. How bot protection is handled

Nothing here evades detection. There is no proxy rotation, no fingerprint spoofing, no header
randomisation, no CAPTCHA solving. The approach is: look like an ordinary browser, behave like a
considerate human, and when a portal insists on a real browser, use a real browser. Four mechanisms:

**1. A consistent, realistic identity.** Both paths send the same Chrome 141 user agent; the browser
path additionally matches locale (`pl-PL`), timezone (`Europe/Warsaw`) and a desktop viewport. The
HTTP path sends the full `sec-fetch-*` / `sec-ch-ua` set a real navigation carries — a bare `fetch()`
with only a UA string is trivially distinguishable.

**2. Cookie persistence.** The browser context is seeded from `data/browser-state.json` and written
back at the end of each run by `closeBrowser()`. Once a portal has decided this visitor is fine, that
verdict carries over to the next run instead of being re-earned every 12 hours. Note the timing: the
state file is written **only when a run finishes**, so a crashed process loses that run's cookie delta.

**3. Rate limiting — the real defence.** One request at a time process-wide, with 3–8 seconds of
random jitter before every single one (§5d). A refresh of ten links takes minutes on purpose. This is
what keeps the app under any sane rate limit, and it is the reason a run is a background job the UI
polls rather than a request the UI waits on.

**4. Escalation instead of evasion.** OLX's CloudFront returns 403 to every plain-HTTP variant that
was tried during planning — realistic headers, HTTP/2, even its own `/api/v1/offers` JSON endpoint —
so OLX is `fetchMode: 'browser'` from the start. The other four portals are plain HTTP and only
launch a browser if they actually start refusing. If the browser is _also_ blocked, the link fails
with `blocked:` and the UI says so; nothing tries harder than that.

### 5d. `fetchPage()` — one entry point, plus the politeness mutex

`src/server/fetch/index.ts` unifies the two paths and owns the global serialization. The mutex is the
least guessable code in the repo:

```ts
// ponytail: promise-chain mutex — one process, so this is enough. Reentrant via AsyncLocalStorage
// so phase 07 can wrap a whole run in withLock() without deadlocking the fetches inside it.
let chain: Promise<unknown> = Promise.resolve()
const held = new AsyncLocalStorage<true>()

export function withLock<T>(fn: () => Promise<T>): Promise<T> {
  if (held.getStore()) return fn()
  const run = () => held.run(true, fn)
  const next = chain.then(run, run) // both handlers: a rejection never breaks the chain
  chain = next.catch(() => {})
  return next
}

// Every request pays the jitter, including page 1 → page 2 and an escalation retry of the same URL.
const politely = <T>(fn: () => Promise<T>) =>
  withLock(async () => {
    await sleep(3000 + Math.random() * 5000)
    return fn()
  })
```

Two things to take from it. First, **every outbound request** — page 1, page 2, an escalation retry of
the same URL, each removal-confirmation detail page — waits 3–8 seconds and runs alone. Second, the
`AsyncLocalStorage` reentrancy is what lets `run.ts` wrap an _entire run_ in `withLock()` (so two
projects never interleave their requests) without the fetches inside that run deadlocking on the lock
their own caller is holding.

`fetchPage()` itself:

```ts
export async function fetchPage(link: Link, url: string) {
  const portal = detectPortal(url)
  const ready = portal ? PORTALS[portal].ready : undefined
  const viaBrowser = async () => ({
    ...(await politely(() => browserFetch(url, ready))),
    usedBrowser: true,
  })

  if (link.fetchMode === 'browser') return viaBrowser()

  const res = await politely(() => httpFetch(url))
  if (!res.blocked)
    return {
      html: res.html,
      status: res.status,
      url: res.url,
      usedBrowser: false,
    }

  const escalated = await viaBrowser()
  // Persisted so the rest of this run — and every run after — skips the wasted HTTP attempt.
  updateLink(link.id, { fetchMode: 'browser' })
  return escalated
}
```

```
fetchPage(link, url)
   │
   ├── link.fetchMode === 'browser' ──► politely(browserFetch) ──────────────► done
   │
   └── otherwise: politely(httpFetch)
          ├── not blocked ──────────────────────────────────────────────────► done
          └── blocked ──► politely(browserFetch) + updateLink(fetchMode:'browser')
                          (permanent — nothing ever demotes a link back to http)
```

**Block detection** (`src/server/fetch/http.ts`) is two signals, one of them size-gated:

```ts
const CHALLENGE = /Request blocked|captcha|cf-browser-verification|DataDome/i
const MAX_CHALLENGE_BYTES = 20_000

const blocked =
  [403, 429, 503].includes(res.status) ||
  (html.length < MAX_CHALLENGE_BYTES && CHALLENGE.test(html))
```

The size gate is load-bearing: real search pages ship recaptcha keys in their markup, so the marker
regex alone false-positives on three of the five portals. Genuine block pages are tiny — the observed
CloudFront one is about 900 bytes.

The browser result is deliberately **not** block-scanned. If a browser fetch comes back with a 403,
the status check in `run.ts` catches it; there is no third tier to escalate to.

### 5e. Confirming a removal — `verifyRemoved()`

The diff engine can only _nominate_ removals (§7). Confirmation is a network call to the listing's own
detail URL, stored on the `listings` row when it was first seen:

```ts
export async function verifyRemoved(link: Link, url: string): Promise<boolean> {
  const { html, status, url: finalUrl } = await fetchPage(link, url)
  if (status === 404 || status === 410) return true
  if (new URL(finalUrl).pathname === '/') return true // bounced to the site root

  const portal = detectPortal(url)
  const marker = portal ? EXPIRED_MARKERS[portal] : undefined
  return marker?.test(html) === true || EXPIRED_FALLBACK.test(html)
}
```

Two portals answer a dead listing with HTTP 200 and an error body, so they need explicit markers
(`src/server/portals.ts`):

```ts
export const EXPIRED_MARKERS: Partial<Record<Portal, RegExp>> = {
  'nieruchomosci-online': /<title>Strona błędu 404/, // soft 404: HTTP 200 with an error page
  otodom: /"shouldShowExpiredAdPage":\s*true/,
}
```

Plus a shared wording fallback, anchored on the word "Ogłoszenie" because a bare `zakończone` or
`archiwalne` also appears in live listing descriptions:

```ts
const EXPIRED_FALLBACK =
  /Ogłoszenie (nieaktualne|zakończone|zostało usunięte)|nie jest już dostępn/i
```

The check is **deliberately one-sided**: anything unrecognised returns `false`, leaving the listing
live to be retried next run. A marker nobody has recorded yet delays a removal rather than inventing
one.

---

## 6. Parsing a portal page

`src/server/parsers/` holds one parser per portal plus shared helpers. Every parser has the same
signature and returns the same shape:

```ts
export type Parser = (html: string, pageUrl: string) => ParseResult
export type ParseResult = {
  listings: Array<ParsedListing>
  emptyState: boolean
}
```

`src/server/parsers/index.ts` maps them by portal in a `Record<Portal, Parser>`, so adding a portal
without a parser is a type error.

### The two rules parsers obey

**Never anchor on CSS classes.** Portals churn them constantly. Every parser anchors on embedded
structured data (`ld+json`, `__NEXT_DATA__`) or on stable `data-*` attributes.

**`emptyState` must come from the portal saying zero, never from `listings.length === 0`.** This is
the invariant the whole error-handling story rests on, and §8 explains what it buys.

| Parser                   | Anchor                                                               | `emptyState` signal                        |
| ------------------------ | -------------------------------------------------------------------- | ------------------------------------------ |
| `otodom.ts`              | `__NEXT_DATA__` → `props.pageProps.data.searchAds.items`             | script matched **and** zero items          |
| `nieruchomosciOnline.ts` | ld+json `CollectionPage` → `mainEntity.offers[0].offers`             | block found **and** zero offers            |
| `gratka.ts`              | ld+json `Product` → `offers.offers[]`                                | block found **and** zero offers            |
| `adresowo.ts`            | cheerio, scoped `#offer-list-results a[data-track="offer-link"]`     | results grid exists **and** rendered empty |
| `olx.ts`                 | cheerio, first `[data-testid="listing-grid"]` → `[data-cy="l-card"]` | `[data-testid="total-count"]` parses to 0  |

### Every portal pads its results

This is the single most common source of phantom "new listings", and each parser filters it
differently:

- **Gratka** renders six "you might like" cards even on a search that matched nothing. So the parser
  reads the ld+json `offers` array — which lists exactly the results, in page order — and ignores the
  `[data-property-id]` cards entirely.
- **OLX** renders _two_ `listing-grid` blocks: the results, then a padding block of wider-radius and
  last-resort filler that still holds ~40 cards on a zero-result page. The parser takes `.first()`
  only, and additionally drops any card whose URL carries `reason=extended_search`.
- **Adresowo** appends an "Oferty z najbliższej okolicy" block below the grid. The parser scopes its
  selector to `#offer-list-results`, so the scope _is_ the filter.
- **Otodom** and **nieruchomosci-online** expose the results as a clean array in structured data, so
  no filtering is needed.

One deliberate non-filter: **OLX search results legitimately contain `otodom.pl` URLs**. The two
portals share an owner and OLX interleaves Otodom ads into its own results with identical card
markup. Those are real results of the search and are kept (15 of the 25 listings in the OLX fixture).

### Shared helpers — `parsers/util.ts`

- `parsePlNumber()` — strips whitespace and swaps `,` for `.`. JS `\s` already matches NBSP (U+00A0)
  and narrow NBSP (U+202F), which are the thousands separators Polish portals actually emit. Accepts
  `null`/`undefined` because ld+json omits `price` outright on a "cena do negocjacji" offer.
- `derivePricePerM2(price, areaM2)` — null unless both are present and `areaM2 > 0`.
- `absoluteUrl(href, pageUrl)` — the parser always receives the **post-redirect** page URL, so
  relative hrefs resolve correctly.
- `findLdJson<T>(html, type)` — walks every `ld+json` block and returns the first whose `@type` matches.

### The fixtures — the only code that rots on its own

`src/server/parsers/__fixtures__/` holds ten live captures, `<portal>-search.html` and
`<portal>-empty.html` for all five portals (~7.5 MB total). `parsers.test.ts` parses them
byte-for-byte, which is why `**/__fixtures__/` is in `.prettierignore`: reformatting them would
invalidate the tests.

The test table pins exact counts and the first listing's id — page order is load-bearing, because
rank is what removal detection reads:

| Portal                 | Expected listings | First id                                                    |
| ---------------------- | ----------------- | ----------------------------------------------------------- |
| `otodom`               | 19                | `68238693`                                                  |
| `nieruchomosci-online` | 40                | `25921151`                                                  |
| `gratka`               | 35                | `48341533`                                                  |
| `adresowo`             | 33                | `dzialka-budowlana-sobotka-sulistrowice-ul-aroniowa-v3j5b2` |
| `olx`                  | 25                | `1bB3GO`                                                    |

Three suites run over that table: the search fixture (counts, ids, portal of every URL, ≥80% priced,
unique external ids, descriptions where the portal publishes them), the empty fixture
(`emptyState === true`, zero listings), and a **garbage page** (`'<html><body>nope</body></html>'`)
which must produce zero listings **and** `emptyState === false` — that is the invariant `run.ts`
depends on to tell "quiet week" from "broken parser".

All `*-empty.html` are genuine zero-result captures except adresowo's: that portal answers an empty
search by widening it rather than reporting zero, so its fixture is the real page with the results
grid emptied by hand.

This directory is the one part of the codebase that breaks without anyone touching it. A portal
redesign makes a parser wrong, the fixture still holds the old markup, and the tests keep passing
while production reports `parse-broken`. Refreshing a fixture means re-capturing the live page — the
procedure is in `README.md`.

See [`docs/portals.md`](./portals.md) for the exact JSON paths, selectors and pagination shapes.

---

## 7. Deciding what changed — `src/server/diff.ts`

A pure function. No database, no network, no clock. Given what we knew and what we just fetched, it
returns what changed:

```ts
export type Known = {
  externalId: string
  price: number | null
  lastRank: number
}

export type Diff = {
  added: Array<ParsedListing>
  priced: Array<{ listing: ParsedListing; oldPrice: number; newPrice: number }>
  removalCandidates: Array<Known>
}

export function diff(known: Array<Known>, fetched: Array<ParsedListing>): Diff
```

**`added`** — any fetched `externalId` not in `known`, deduplicated via a local set. Pages 1 and 2
overlap while a portal reshuffles between the two requests, and a duplicate here would violate the
`listings_link_external` unique index on insert.

**`priced`** — only when both the old and the new price are non-null and differ by at least
`PRICE_EPSILON = 1`. A `null → 250000` transition is a listing _publishing_ its price, not changing
it; the epsilon absorbs float noise from `parsePlNumber`.

**`removalCandidates`** — the subtlest rule in the system.

Each refresh fetches roughly the first two pages of a newest-first search, not the whole thing. Old
listings scroll off the bottom of that window naturally, so "I did not see it this time" means
nothing on its own. What _does_ mean something is a listing vanishing while listings _older_ than it
are still there:

```ts
// The window is newest-first and ~2 pages deep, so old listings scroll off the bottom on their
// own. Only what sat *above* a survivor is genuinely gone. -1 when nothing survived: the whole
// window turned over and we cannot tell, so nominate nothing.
const deepestPresent = known.reduce(
  (deepest, k) =>
    fetchedIds.has(k.externalId) && k.lastRank > deepest ? k.lastRank : deepest,
  -1,
)

const removalCandidates = known.filter(
  (k) => !fetchedIds.has(k.externalId) && k.lastRank < deepestPresent,
)
```

```
   known rank   this fetch
   ──────────   ──────────
      0   A     present
      1   B     MISSING   ◄── candidate: something older than it survived
      2   C     present   ◄── deepestPresent = 2
   ──────────────────────────  water line
     30   D     MISSING   ──── not a candidate: it simply scrolled off the window
```

If nothing survived at all, `deepestPresent` stays `-1` and **nothing** is nominated — the entire
window turned over and there is no way to tell removal from displacement.

And these are still only candidates. `run.ts` confirms each one against its own detail page (§5e)
before anything is marked removed.

**`needsPage2(known, page1)`** — `page1.length > 0 && !page1.some(l => knownIds.has(l.externalId))`.
An entirely unfamiliar page 1 means more than a page of news arrived and there is probably more below
it. The length guard stops an empty search from vacuously passing and burning a request.

---

## 8. A refresh run, end to end — `src/server/run.ts`

This is where fetching, parsing, diffing and persistence come together.

```
startRunFn (RPC)                                        ← returns in milliseconds
  └─ startRun(projectId)                                 [synchronous setup]
       ├─ activeRun(projectId)  ─── already running? return that runId, start nothing
       ├─ listLinks(projectId)
       ├─ createRun()  ─── ONE transaction: the runs row + one runLinks row per link
       │                   (the checklist exists before any network call, so the UI can
       │                    render the whole list at once instead of items trickling in)
       └─ withLock(() => execute(...))   ← the WHOLE run holds the global fetch mutex
              │
              │  for each link, sequentially — never in parallel:
              │
              ├─ updateRunLink(status:'running')
              │
              ├─ runLink():
              │     load(page 1) ─► fetchPage ─► status checks ─► PARSERS[portal](html, url)
              │        └─ broken? (0 listings AND no empty-state marker)
              │             ├─ already on browser ─► throw parse-broken
              │             └─ else: escalate to browser, persist it, retry once
              │     liveListings(linkId)                       ← the seen-set for this link
              │     baseline OR needsPage2? ─► load(page 2)     ← pays another 3-8s jitter
              │     dedupe (first occurrence wins) ─► rank by position ─► diff()
              │     verifyRemoved() per candidate               ← network, BEFORE the transaction
              │     ONE transaction:
              │        insert new listings      + 'new' events
              │        update changed prices    + 'price' events
              │        stamp removedAt          + 'removed' events
              │        refresh lastSeenAt / lastRank for everything still present
              │
              ├─ ok    ─► updateRunLink(counts) + updateLink(status:'ok', lastError:null)
              └─ error ─► updateRunLink(error)  + updateLink(status:'error', lastError:reason)
                          ── per-link try/catch: one dead portal never aborts the run
              │
              finally:
                 closeBrowser()   ─► flush cookies to data/browser-state.json, kill Chromium
                 finishRun(runId, ok === 0 && links.length > 0 ? 'failed' : 'done')
                 notify(summary)  ─► deliberately empty seam
```

### Why `startRun` is synchronous

better-sqlite3 is synchronous, so the run row and its whole checklist are written before the function
returns. The caller gets a `runId` immediately and starts polling, while the actual work proceeds
behind the mutex:

```ts
export function startRun(projectId: number) {
  const existing = activeRun(projectId)
  if (existing) return { runId: existing.id, finished: Promise.resolve() }
  ...
  const finished = withLock(() => execute(runId, projectId, projectLinks))
  // Nobody awaits the manual path; keep a stray rejection from taking the process down.
  finished.catch(() => {})
  return { runId, finished }
}
```

A second click while a run is in flight gets the same run id back. Nothing starts twice.

### Baseline runs

A link whose `baselinedAt` is `null` has never been fetched. Its first run inserts every listing it
finds and emits **zero events**:

```ts
// A fresh link finds months of old listings; reporting them as news would bury the real news.
```

Baselines also always fetch both pages, to seed a window worth diffing against. In the UI a baseline
reads as `baseline: 33` rather than `0 new · 0 price · 0 removed` — `getRunStatus()` selects
`links.baselinedAt` precisely so the two can be told apart.

### Zero parsed is not an error

A quiet run still parses ~30 listings and finds nothing changed. That is the normal green result. A
link is only broken when the parser produced nothing **and** the portal never said "zero results":

```ts
// A quiet search still parses ~30 listings, so zero parsed is only broken when the portal never
// said "zero results" itself.
const broken = (page: ParseResult) =>
  page.listings.length === 0 && !page.emptyState
```

This is why `emptyState` may never be derived from `listings.length === 0` in a parser — that would
make a broken parser indistinguishable from a quiet week, and the app would go silently blind.

`broken()` is also the **second, independent escalation trigger**: a portal that serves a stripped-down
page to plain HTTP looks exactly like a broken parser, so the link is promoted to browser mode
(persisted) and the same URL is retried once. Still broken afterwards → `parse-broken`.

### Removal confirmation happens before the write

Each candidate is a network round trip with its own 3–8 second jitter, so all of them are resolved
before the transaction opens — a transaction must never be held open across the network:

```ts
// Confirmed before the write transaction — each one is a network round trip.
for (const candidate of changes.removalCandidates) {
  const row = known.get(candidate.externalId)
  if (row && (await verifyRemoved({ id: link.id, fetchMode }, row.url)))
    removed.push(row)
}
```

A confirmed removal sets `removedAt` on the listing. **It never deletes the row** — the listing is
both the seen-set (a deleted live row reappears as "new" forever) and the archive.

### Error taxonomy

`reasonFor(err)` normalises everything into `'<category>: <detail>'`, truncated to 300 characters,
written to both `runLinks.error` and `links.lastError`:

| Category       | Raised when                                                 | UI tone |
| -------------- | ----------------------------------------------------------- | ------- |
| `blocked`      | HTTP 403 / 429 / 503                                        | red     |
| `not-found`    | HTTP 404 / 410 — the search URL itself is dead              | red     |
| `parse-broken` | 0 listings and no empty-state marker, even after escalating | red     |
| `network`      | any other 4xx/5xx, or `ENOTFOUND` / `ECONN` / `net::` …     | amber   |
| `timeout`      | `timeout` / `ETIMEDOUT` / `abort` in the message            | amber   |
| `unknown`      | unrecognised, including an unsupported portal               | red     |

`src/lib/format.ts` maps the category prefix to user-facing copy and a colour. The split is the whole
point: _a timeout usually fixes itself, a layout change never does_.

### The notify seam

`notify()` is called once per run with `{ projectId, runId, ok, failed }` and does nothing:

```ts
// ponytail: the notify seam — email/Telegram hangs off this one call site. Add a channel here, not
// an abstraction: a provider interface for zero providers is the thing worth not building.
```

## 9. The web layer

### Routing

TanStack Start with file-based routing. Only three route files exist:

| File                                 | URL                    | What it does                                                  |
| ------------------------------------ | ---------------------- | ------------------------------------------------------------- |
| `src/routes/__root.tsx`              | (layout for all)       | HTML document shell + sidebar; loads the project list.        |
| `src/routes/index.tsx`               | `/`                    | Project list + create form. **No loader** — reuses root data. |
| `src/routes/projects.$projectId.tsx` | `/projects/:projectId` | Settings, links, refresh, findings, delete.                   |

Conventions in play: `__root.tsx` is the reserved root route; dots in a filename are path separators
(`projects.$projectId.tsx` → `/projects/$projectId`); `$param` is a dynamic segment.
`src/routeTree.gen.ts` is generated by `tsr generate` (and automatically by the Vite plugin on file
change) — never hand-edited, `@ts-nocheck`'d, prettier-ignored.

The root route loads the project list once for every route:

```ts
// The sidebar needs the project list on every route, so it is loaded once here and reused by
// the index route via useLoaderData({ from: '__root__' }).
loader: () => listProjectsFn(),
```

`listProjects()` computes the sidebar's `unread` and `failing` badges as correlated SQL subqueries
rather than extra round trips.

The router itself is assembled in `src/router.tsx`: it feeds the generated route tree to
`createTanStackRouter`, sets `defaultPreload: 'intent'` (loaders run on link hover) with
`defaultPreloadStaleTime: 0` (never serve stale preloaded data), and wires SSR dehydration for
TanStack Query via `setupRouterSsrQueryIntegration`. The router context is a single `QueryClient`,
created with default options in `src/integrations/tanstack-query/root-provider.tsx`; the sibling
`devtools.tsx` only default-exports the devtools panel descriptor mounted in `__root.tsx`.

### There are no API routes

Every client↔server call is a TanStack Start **server function** (`createServerFn`), compiled into an
RPC handler under `/_serverFn`. On SSR the call is a direct in-process invocation with no HTTP hop; in
the browser it becomes a `GET` (payload in the query string) or `POST` (payload in the body). The
client-side signature is always `fn({ data })`.

Fourteen of them, grouped by module:

| Module                   | Functions                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------- |
| `src/server/projects.ts` | `listProjectsFn` `getProjectFn` `createProjectFn` `updateProjectFn` `deleteProjectFn` |
| `src/server/links.ts`    | `listLinksFn` `addLinkFn` `renameLinkFn` `deleteLinkFn`                               |
| `src/server/runs.ts`     | `startRunFn` `getRunStatusFn`                                                         |
| `src/server/findings.ts` | `listFindingsFn` `markReadFn` `markAllReadFn`                                         |

Each carries a `.validator(zodSchema)` — that is the trust boundary. `addLinkFn` is the fullest
example: valid URL, `https:` only, a recognised portal, under the 10-link cap, not a duplicate. The
forms mirror some of those rules for immediate feedback, but the server's checks are the real ones.

**One structural constraint governs these files**, and breaking it breaks the app in a confusing way:

```ts
// Everything here lives inside a handler on purpose. Only handler bodies are stripped from the
// client bundle; anything else in this file keeps its `#/db/queries` import alive and drags
// better-sqlite3 into the browser, which kills hydration.
```

So: no helper functions, no constants derived from DB imports at module scope in `src/server/*.ts` —
put the logic inside `.handler()`.

### Two data planes, on purpose

| Plane               | Carries                         | Invalidated by                                |
| ------------------- | ------------------------------- | --------------------------------------------- |
| Route loaders (SSR) | projects, links, sidebar badges | `router.invalidate()`                         |
| TanStack Query      | findings timeline, run polling  | `queryClient.invalidateQueries({ queryKey })` |

Anything that changes a link or project refreshes the loader; anything that changes the timeline
refreshes the query; a finished run does both.

### Worked example: clicking Refresh

1. `startRun.mutate({ data: project.id })` → `POST /_serverFn/...startRunFn...`.
2. Handler: `startRun(data, 'manual').runId` — the run row and checklist are already in the database
   when the response is sent.
3. `onSuccess: ({ runId: id }) => setRunId(id)` arms the polling query:

   ```ts
   const run = useQuery({
     queryKey: ['run', runId],
     queryFn: () => getRunStatusFn({ data: runId ?? 0 }),
     enabled: runId !== null,
     refetchInterval: ({ state }) =>
       state.data?.run.status === 'running' ? 1500 : false,
   })
   ```

4. Each poll returns `{ run, links }` — the `runLinks` rows joined to their labels — and the link
   list renders live status dots, per-link progress and the counts written so far.
5. Meanwhile `execute()` walks the links sequentially in the background (§8).
6. When polling sees a non-running status, one effect refreshes both planes:

   ```ts
   // The run rewrote every link's status, fetchMode and lastError — pull the loader back through,
   // and drop the run's new section into the timeline without a reload.
   useEffect(() => {
     if (!run.data || running) return
     void router.invalidate()
     void queryClient.invalidateQueries({ queryKey: ['findings', project.id] })
   }, [run.data, running, router, queryClient, project.id])
   ```

### The findings timeline — `src/components/findings.tsx`

The main read surface. Runs newest-first, each with its events:

- **Quiet runs collapse to one line** (`"6 sie 20:15 · no changes"`) rather than being
  hidden — `listFindings()` deliberately keeps runs with zero events, because dropping them would
  make a quiet week look like a broken app.
- **Pagination** is `limit + 1`: fetch one extra row to answer "is there more?" without a count query.
  `PAGE = 20`, "Load more" adds another 20.
- **Filters** (type, portal) are applied client-side over the fetched page; portal chips are derived
  from the events actually present and only appear when more than one portal is represented.
- **Auto-read** uses a native `IntersectionObserver`: a section with unread events that stays visible
  for `AUTO_READ_MS = 1000` marks itself read once. The observer is armed only while unread events
  remain, so it tears itself down when the invalidated query comes back read.
- **Unread state** is the left border and background tint; `removed` events render struck through and
  dimmed; a price change shows `old → new` in emerald when it dropped, red when it rose.
- **Thumbnails are hotlinked** straight from the portal. Some portals reject the referer, so an
  `onError` fallback to a placeholder icon is expected behaviour, not a bug to fix by proxying.

### Formatting — `src/lib/format.ts`

`Intl.NumberFormat('pl-PL')` for prices/areas and `Intl.DateTimeFormat('pl-PL', …)` for timestamps,
with `timeZone: 'Europe/Warsaw'` pinned so the server and the browser render identical strings (an SSR
mismatch otherwise). `linkError()` maps an error category to `{ tone, text }`. Nulls render as `—`.

### Styling

Tailwind v4 + shadcn/ui, dark-only. **There is no `tailwind.config.*`** — the entire theme is
`:root` custom properties plus `@theme inline` in `src/styles.css`. `<html className="dark">` is
hardcoded and `color-scheme: dark` is set on `:root` so native `<input type="time">` and scrollbars
render dark. `src/components/ui/` is CLI-generated. The rules for changing any of this are in
[`CLAUDE.md`](../CLAUDE.md).

---

## 10. Conventions, tests, and what breaks first

### Conventions

- **Path aliases**: `#/*` and `@/*` both resolve to `./src/*`. `#/*` is a real Node subpath import
  (declared in `package.json`), used for `#/db/*` and `#/server/*`; `@/*` is the shadcn alias used for
  UI and lib imports.
- **TypeScript**: `strict`, plus `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`,
  `noFallthroughCasesInSwitch`. The indexed-access flag is deliberate — parser code indexes into
  arrays and regex match groups constantly, and it is what forces the `?? null` fallbacks you see.
- **`pnpm format` runs `eslint --fix` before `prettier --write`.** That order matters: ESLint's
  `consistent-type-imports` fix leaves lines unformatted.
- **Comments** are for the non-obvious only. Most of the ones quoted in this document explain a
  decision that looks simplifiable but fixes a bug that was actually observed.

### Test map

`pnpm test` runs vitest in a Node environment over `src/**/*.test.ts` — no jsdom, no component tests.

| Suite                                | Guards                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------- |
| `src/server/parsers/parsers.test.ts` | Fixture parsing: counts, ids, padding filters, empty state, garbage page. |
| `src/server/parsers/util.test.ts`    | Polish number parsing, price-per-m², URL resolution.                      |
| `src/server/diff.test.ts`            | Window semantics — scroll-off is not a removal, dedupe, price epsilon.    |
| `src/server/run.test.ts`             | Dead portal isolated; baseline emits nothing; escalate exactly once.      |
| `src/server/portals.test.ts`         | Hostname matching (including the `.evil.com` case), page URLs, labels.    |
| `src/db/schema.test.ts`              | `foreign_keys = ON` — deletes a project, asserts the cascade happened.    |
| `src/db/queries.test.ts`             | Unread counts per project; findings grouped by run, quiet runs kept.      |
| `src/lib/format.test.ts`             | Error category → red/amber copy, including unrecognised categories.       |

### What breaks first

Ranked by how likely you are to hit it:

1. **A portal changes its markup.** That link reports `parse-broken`; every other link keeps working.
   Fix: re-capture the fixture, update the parser, re-run `pnpm test`.
2. **A portal starts blocking plain HTTP.** The link auto-escalates to browser mode once and
   persists it. If the browser is blocked too, the link reports `blocked:` and stays that way.
3. **Fixtures go stale silently.** This is the nastiest one: tests pass against captured HTML that no
   longer resembles the live page. Nothing detects it except a `parse-broken` in production.
4. **`data/estate.db` is deleted.** Every link re-baselines: no false flood of "new" listings, but the
   entire history and price timeline are gone.
5. **The process is started from the wrong directory.** `data/estate.db` and `drizzle/` are relative
   paths, so you silently get a second, empty database.

### Known open issues

Carried in `README.md`'s TODO list and worth knowing before you debug them from scratch:

- nieruchomosci-online sometimes reports results that are not actually new.
- Gratka fails more often than the other portals.

---

## Appendix: the five rules that must not be simplified

Each one came from live reconnaissance against the real portals, and each looks unnecessary until you
remove it.

1. **OLX requires a real browser.** Verified 403 from CloudFront on every plain-HTTP variant tried,
   including its own JSON API. The other four portals are plain HTTP. → §5a, §5c
2. **Zero parsed is not zero new.** A quiet run still parses ~30 listings and finds 0 changes — that
   is a normal green result. A link errors only when it parses 0 listings **and** the page carries no
   empty-state marker. → §6, §8
3. **A listing falling off the fetch window is not a removal.** With a newest-first, ~2-page window,
   old listings scroll off naturally. Only nominate a removal when the listing vanished while
   listings _older_ than it are still present — then confirm via its own detail URL. → §7, §5e
4. **Never delete a listing.** `listings` is the seen-set (deleting a live row makes it reappear as
   "new" next run, forever) _and_ the permanent archive — its price, description and photo must stay
   exportable years after the portal drops the offer. Nothing is pruned on a schedule. → §4, §8
5. **Be polite to the portals.** Sequential fetches only, 3–8 s random jitter between requests, one
   refresh run at a time process-wide, one reused browser context per run with persisted cookies.
   → §5c, §5d
