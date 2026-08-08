# Estate Tracker

Local, single-user, no-auth app that watches saved search URLs across five Polish real-estate
portals and tells you what changed since the last look: **new listings, price changes, removals**.

Portals: [OLX](https://www.olx.pl), [Otodom](https://www.otodom.pl),
[Gratka](https://gratka.pl), [Adresowo](https://adresowo.pl),
[Nieruchomosci-Online](https://www.nieruchomosci-online.pl).

TanStack Start (React 19) + SQLite via Drizzle + Playwright/cheerio for scraping.

## Setup

```bash
pnpm install
pnpm exec playwright install chromium   # REQUIRED — OLX cannot be scraped without a real browser
pnpm db:migrate                          # creates data/estate.db
pnpm dev                                 # http://localhost:3000
```

Production:

```bash
pnpm build && pnpm preview               # http://localhost:4173
```

Chromium only — the full Playwright browser set is a few hundred MB you will never use. OLX's
CloudFront 403s every plain-HTTP variant that was tried (realistic Chrome headers, HTTP/2, its own
`/api/v1/offers` JSON endpoint); the other four portals are plain HTTP and never launch a browser.

## Using it

1. Create a **project** (a set of searches refreshed together, with two daily refresh times).
2. Paste search URLs into it — up to 10 per project. The portal is detected from the hostname.
3. Hit **Refresh**, or wait for a scheduled run.

### Every search URL must already be sorted newest-first

This is the one rule the whole design rests on. Each refresh fetches roughly the first two pages of
a search, not all of it, and diffs that window against what it saw last time. If the portal returns
that window in "newest first" order:

- genuinely new offers appear at the top, where they get seen;
- old offers scrolling off the bottom of the window are recognised as _falling out of the window_,
  not as removals.

Sort a search by price instead and both of those break: a price edit anywhere reshuffles the page
and the app will report churn that did not happen. Set the sort on the portal before saving the URL.

The first run of a link is a **baseline** — it records everything currently on the search without
reporting any of it as news, because a fresh link finds months of old listings and reporting them
would bury the real news. Changes start with the second run.

### What the link statuses mean

| Dot   | Message                                       | What happened                                                                                              |
| ----- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| grey  | —                                             | never run                                                                                                  |
| green | `last checked 20:00`                          | the last run parsed listings fine                                                                          |
| red   | `blocked by portal`                           | 403/429/challenge, and the browser retry was blocked too                                                   |
| red   | `page layout changed — parser needs updating` | 0 listings parsed _and_ no empty-state marker — see [refreshing fixtures](#when-a-portal-changes-its-html) |
| amber | `couldn't reach portal`                       | timeout or network failure; usually fixes itself                                                           |

The full error string (category + detail) is the tooltip on that message. A failing link puts an
amber warning triangle next to its project in the sidebar, so a red link on a project you rarely
open is still visible. Errors clear on the next successful run.

**A run that finds nothing is a green run.** A quiet search still parses ~30 listings and produces
0 changes — that is the normal result, not a failure.

## Where the data lives

Everything is in `data/`, which is gitignored and created at runtime:

- `data/estate.db` — SQLite (WAL mode). Projects, links, listings, events, run history.
- `data/estate.db-wal`, `-shm` — WAL sidecars, same lifetime as the db.
- `data/browser-state.json` — Playwright cookies/localStorage, so OLX sees a returning visitor
  rather than a fresh one every 12 hours.

**Deleting `data/estate.db` loses all history and re-baselines every link** — the next run reports
zero changes and starts over. There is no other copy. Back it up by copying the file (stop the app
first, or use `sqlite3 data/estate.db ".backup backup.db"`).

Listings are never deleted, on purpose. The `listings` table is both the seen-set (deleting a live
row makes that listing reappear as "new" forever) and the permanent archive — a listing's price,
description and photo stay readable years after the portal drops the offer. Only runs older than the
retention window _that produced no events_ are pruned.

## Keeping it running

Scheduled refreshes only happen while the process is alive — there is no external cron. The
scheduler boots from `src/server.ts`, compares the wall clock in `Europe/Warsaw` against each
project's two times every 30 minutes, and catches up after sleep: a laptop shut through 08:00 fires
that slot when it wakes.

With [pm2](https://pm2.keymetrics.io):

```bash
pnpm build
pm2 start pnpm --name estate-tracker -- preview
pm2 save && pm2 startup          # survive reboots
```

With launchd (macOS), `~/Library/LaunchAgents/com.local.estate-tracker.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>Label</key><string>com.local.estate-tracker</string>
  <key>ProgramArguments</key>
  <array><string>/opt/homebrew/bin/pnpm</string><string>preview</string></array>
  <key>WorkingDirectory</key><string>/path/to/estate-tracker</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/estate-tracker.log</string>
  <key>StandardErrorPath</key><string>/tmp/estate-tracker.log</string>
</dict></plist>
```

`launchctl load ~/Library/LaunchAgents/com.local.estate-tracker.plist` to start it.

Environment knobs (plain `process.env`, no `.env` loader):

| Variable                 | Default | Effect                                                                                  |
| ------------------------ | ------- | --------------------------------------------------------------------------------------- |
| `SCHEDULER_ENABLED`      | on      | `false` disables scheduled runs — use it in `pnpm dev` so no Chromium launches mid-edit |
| `SCHEDULER_TICK_MINUTES` | `30`    | how often due projects are checked                                                      |
| `RETENTION_DAYS`         | `90`    | age past which empty runs are pruned (04:00 Warsaw daily)                               |

## Being polite to the portals

Deliberate, do not "optimise" away: sequential fetches only (never parallel), a random 3–8s gap
before every request, one refresh run at a time process-wide, one reused browser context per run.
A ten-link project therefore takes a minute or two.

## When a portal changes its HTML

The symptom is a link going red with **"page layout changed — parser needs updating"**: the fetch
worked, but the parser found 0 listings and the page carried no "we found nothing" marker either.

Parsers live in `src/server/parsers/`, one per portal, and are tested byte-for-byte against saved
HTML in `src/server/parsers/__fixtures__/` — the only code in this project that rots silently when
someone else changes their site. To fix:

1. Open the failing search in a browser, save the page HTML over the matching
   `__fixtures__/<portal>-search.html`. Do the same for a deliberately zero-result search
   (`<portal>-empty.html`) if the empty-state marker is what moved.
2. `pnpm vitest run src/server/parsers/parsers.test.ts` — the assertions will point at what moved.
3. Fix the parser. Anchor on embedded `ld+json` / `__NEXT_DATA__` / `data-*` attributes, **never on
   CSS classes** — portals churn those constantly.
4. Never derive `emptyState` from `listings.length === 0`; it must come from a real "the portal said
   zero" signal, or a broken parser will look like a quiet week forever.

Every portal pads its results with offers that are not results of the search (recommendations,
wider-radius filler) — the parsers filter those out. The per-portal extraction paths, empty-state
markers, expired-listing markers and pagination schemes are recorded in
[`docs/portals.md`](./docs/portals.md).

## Development

```bash
pnpm lint / pnpm format / pnpm check   # eslint / eslint --fix + prettier / prettier --check
pnpm typecheck                         # tsc --noEmit
pnpm test                              # vitest run
pnpm generate-routes                   # regenerate src/routeTree.gen.ts
pnpm db:generate / pnpm db:migrate     # drizzle-kit, schema in src/db/schema.ts
```

[`docs/architecture.md`](./docs/architecture.md) is the full technical walkthrough — process model,
data model, fetching and anti-bot handling, change detection, scheduling, and which file does what.
`phases/` holds the build plan this repo was written from, one file per phase; `CLAUDE.md` holds the
architecture notes and the non-negotiable domain rules.

# TODO

- store logs if something goes wrong.
- refresh per link
- more explanation of the data in every added link.
- way to preview already fetched link, even if they are not new - initial fetch.
- consider auto fetching, manuall seems to be good enough for now.
- no way of createing new project
- updating new project data (title) should reflect in left panel.
- create view to see all stored listings in db
- option to see and edit provided link
- tracking number of requests per link.
- What each status mean for each link. Every provided link be a separate entity, with latest fethcing logs, separate listings, if it fails what it mens (like 404 error), possibility to edit a link.
- The app should be hosted, the jobs shouldnt work in the background. They should be manually triggered by user and then their cookies and network is used.
- For some reason nieruchomosci-online returns results that are not new.
- Gratka often fails.
