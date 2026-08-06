# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Estate Tracker: a local, single-user, no-auth app that monitors saved search URLs across five Polish
real-estate portals (OLX, Otodom, Gratka, Adresowo, Nieruchomosci-Online) and surfaces new listings,
price changes, and removals. TanStack Start (React 19, file-based routing) + SQLite via Drizzle +
Playwright/cheerio for scraping.

## Commands

```bash
pnpm dev                              # vite dev server on :3000
pnpm build && pnpm preview            # production build / preview
pnpm generate-routes                  # regenerate src/routeTree.gen.ts (tsr generate)
pnpm lint / pnpm format / pnpm check  # eslint / prettier --write + eslint --fix / prettier --check
pnpm typecheck                        # tsc --noEmit
pnpm test                             # vitest run
pnpm vitest run src/path/to/x.test.ts # single test file
pnpm vitest run -t "test name"        # single test by name
pnpm exec playwright install chromium # required once; Chromium only, not the full browser set
```

No `db:generate` / `db:migrate` scripts exist yet — they land in phase 01 (see below).

## Build plan — read before writing code

This repo is built phase-by-phase from `phases/README.md` (the index) and `phases/NN-*.md` (one
phase each). **Read the relevant phase file in full before implementing it** — each one carries
verified specifics (exact JSON paths, selectors, regexes) that aren't guessable from the codebase
alone, plus a "Done when" section that is the actual acceptance criteria, not this file.

Current state: only **phase 00 (scaffold)** is done — a stock TanStack Start app, no `src/db`,
`src/server`, or feature code yet. Work through phases in order; don't skip ahead or build phase N+1
plumbing while implementing phase N.

Git commit history and phase filenames are the source of truth for what's actually done — check
`git log` / which `src/` directories exist rather than assuming from this file.

## Non-negotiable domain rules

These came from live reconnaissance against the real portals during planning (see
`phases/README.md`). They look like they could be simplified; don't — each one fixes a bug that was
actually observed.

1. **OLX requires a real browser.** Verified 403 from CloudFront on every plain-HTTP variant tried
   (matching headers, HTTP/2, its own JSON endpoint). The other four portals are plain HTTP.
2. **Zero parsed ≠ zero new.** A quiet search run still parses ~30 listings and finds 0 changes — that
   is a normal green result, not an error. A link only errors when it parses **0 listings AND** the
   page has no empty-state marker.
3. **A listing falling off the fetch window is not a removal.** With a newest-first, ~2-page window,
   old listings scroll off naturally as new ones appear. Only nominate a removal when the listing
   vanished while listings *older* than it are still present on the page — then confirm by fetching
   its own detail URL before marking it gone.
4. **Never delete a live listing (`removedAt IS NULL`) when pruning.** `listings` is the seen-set;
   deleting a live row makes it reappear as "new" on the next run, forever.
5. **Be polite to the portals.** Sequential fetches only (never parallel), 3–8s random jitter between
   every request, one refresh run at a time process-wide (global mutex), one reused browser context
   per run with persisted cookies.

## Architecture (as phases land)

- **`src/server/portals.ts`** (phase 03) is the single source of truth for portal identity: hostname
  regex → `fetchMode` (`http` | `browser`). Everything else (fetch layer, parsers, orchestration)
  imports from it rather than re-deriving portal logic.
- **Fetch layer** (phase 04) has two interchangeable paths — `http.ts` (fetch + Chrome-like headers)
  and `browser.ts` (one Playwright Chromium instance per run, not per link, `storageState` persisted
  to `data/browser-state.json`) — unified behind `fetchPage()`, which escalates HTTP → browser once on
  a detected block and persists that escalation onto the link.
- **Parsers** (phase 05) are pure functions `(html, pageUrl) => { listings, emptyState }`, one per
  portal in `src/server/parsers/`, anchored on `data-*` attributes/structure rather than CSS classes
  (portals churn their class names). This is the only code in the project with a real fixture-based
  test suite (`fixtures/raw/`, moved to `src/server/parsers/__fixtures__/`), because it's the only
  code that silently rots when a portal changes.
- **Diff engine** (phase 06) — `src/server/diff.ts` — is pure (no DB, no network) and takes the
  known/live listings plus a freshly parsed page and returns added / price-changed / removal
  candidates. The removal logic is the subtle part (rule 3 above); its test suite is what catches
  regressions there.
- **Run orchestration** (phase 07) — `src/server/run.ts` `runProject()` — is the only place fetch →
  parse → diff → persist gets wired together, sequentially per link, each link isolated in its own
  try/catch so one dead portal never aborts the run.
- **Scheduler** (phase 09) polls every 5 minutes and compares wall-clock time in `Europe/Warsaw`
  against each project's two configured times, rather than using per-time cron entries — this makes
  catch-up-after-sleep and schedule changes fall out for free instead of needing re-registration.
- **DB** (phase 01): SQLite via `drizzle-orm/sqlite-core`, singleton `better-sqlite3` connection with
  `foreign_keys = ON` explicitly set (SQLite defaults this off, so cascading deletes silently no-op
  without it). Plain exported query functions in `src/db/queries.ts` — no repository classes, no
  generic CRUD wrapper.

## Conventions

- Path aliases `#/*` and `@/*` both resolve to `./src/*` (see `tsconfig.json` / `package.json#imports`).
- TypeScript is `strict` + `noUncheckedIndexedAccess` + `noUnusedLocals`/`noUnusedParameters` —
  deliberate, since parser/scraper code indexes into arrays constantly and this catches `undefined`
  bugs at compile time. Don't relax these.
- ESLint is TanStack's flat config (`@tanstack/eslint-config`) with `import/no-cycle`, `import/order`,
  `sort-imports`, `@typescript-eslint/array-type`, `@typescript-eslint/require-await`, and
  `pnpm/json-enforce-catalog` turned off; Prettier owns formatting, ESLint doesn't duplicate it.
- Vitest runs in `environment: 'node'` only (`vitest.config.ts` is deliberately separate from
  `vite.config.ts`) — everything under test (parsers, diff engine) is server-side, no jsdom needed.
- `fixtures/raw/` holds live HTML captures of all five portals' search results, taken during planning
  for phase 05's parser tests — don't delete or "clean up" these.
- `data/` (SQLite file + Playwright `storageState`) is gitignored and created at runtime; never
  committed.
