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
pnpm lint / pnpm format / pnpm check  # eslint / eslint --fix + prettier --write / prettier --check
pnpm typecheck                        # tsc --noEmit
pnpm test                             # vitest run
pnpm vitest run src/path/to/x.test.ts # single test file
pnpm vitest run -t "test name"        # single test by name
pnpm exec playwright install chromium # required once; Chromium only, not the full browser set
```

`pnpm db:generate` / `pnpm db:migrate` (drizzle-kit) manage the SQLite schema — see
`src/server/models/`.

## Project structure

Every folder under `src/` carries a `README.md` with what belongs in it, what doesn't, and its one
gotcha. Read the folder's README before adding a file to it; those are the authority, this is the
map.

```
src/
  routes/       thin route shells — def, loader, composition (~20-60 lines each)
  features/     projects/ links/ runs/ findings/   ← all app UI
  components/   ui/ only: shadcn CLI output
  lib/          cross-feature helpers (format.ts, cn())
  server/       the entire backend
    controllers/  createServerFn: validate → delegate → return
    services/     business rules, orchestration, pure domain logic
    models/       drizzle schema + flat query functions
    scraping/     portals.ts, fetch/, parsers/
  integrations/ third-party wiring (React Query provider)
```

**Backend layering.** `controllers → services → {models, scraping}`. A service exists only where
there is logic: `projects` and `findings` have none worth a module, so their controllers call the
model directly — a pass-through service is noise, not symmetry. `models/schema.ts` must import
nothing but drizzle (drizzle-kit resolves it outside the bundler).

**Frontend split.** `.tsx` is markup and props; `.ts` is logic and its test. Hooks, derivations and
formatting go in `.ts` siblings — that is what makes them testable, since vitest runs
`src/**/*.test.ts` under plain node with no jsdom and no React plugin. One `.tsx` per major UI
block; small private subcomponents stay in their parent file.

**Feature folders.** No `index.ts` barrels — a barrel re-exporting a component next to a contract is
how server code reaches the browser bundle. Values both sides need (zod schemas, `MAX_LINKS`) live
in the feature as dependency-free leaves and are imported _from_ `server/`; that is the only
server → client dependency.

**The bundle rule.** Only `createServerFn` handler bodies are stripped from the client build.
Reference a model or service at module scope in a controller and better-sqlite3 follows the import
into the browser, killing hydration. `pnpm build` still succeeds when this breaks — the check that
catches it is `grep -rE "better.sqlite3|playwright" dist/client/`, which must find nothing.

## Build plan

This repo is built phase-by-phase from `phases/README.md` (index) and `phases/NN-*.md` (one phase
each), in order — don't skip ahead or build phase N+1 plumbing while implementing phase N. **Read
the relevant phase file in full before implementing it**: each one carries verified specifics
(exact JSON paths, selectors, regexes) not guessable from the codebase, plus the actual "Done when"
acceptance criteria. Check `git log` / existing `src/` dirs for what's actually done — don't trust
a progress summary in this file, it goes stale.

## Non-negotiable domain rules

From live reconnaissance against the real portals during planning. They look simplifiable; don't —
each one fixes a bug that was actually observed.

1. **OLX requires a real browser.** Verified 403 from CloudFront on every plain-HTTP variant tried.
   The other four portals are plain HTTP.
2. **Zero parsed ≠ zero new.** A quiet run still parses ~30 listings and finds 0 changes — that's a
   normal green result. A link only errors when it parses **0 listings AND** the page has no
   empty-state marker.
3. **A listing falling off the fetch window is not a removal.** With a newest-first, ~2-page window,
   old listings scroll off naturally. Only nominate a removal when the listing vanished while
   listings _older_ than it are still present — then confirm via its own detail URL before marking
   it gone.
4. **Never delete a listing.** `listings` is the seen-set (deleting a live row makes it reappear as
   "new" next run, forever) _and_ the permanent archive — its price/description/photo must stay
   exportable years after the portal drops the offer. Nothing is ever deleted on a schedule —
   listings, events and runs are all kept forever, so price history stays available for analytics.
5. **Be polite to the portals.** Sequential fetches only (never parallel), 3–8s random jitter
   between requests, one refresh run at a time process-wide (global mutex), one reused browser
   context per run with persisted cookies.

## Architecture gotchas

- `src/server/scraping/portals.ts` is the single source of truth for portal identity (hostname
  regex → `fetchMode`) — don't re-derive portal logic elsewhere.
- `fetchPage()` unifies `http.ts`/`browser.ts` and escalates HTTP → browser once on a detected
  block, persisting that escalation onto the link.
- Parsers anchor on embedded ld+json/`__NEXT_DATA__` or `data-*` attributes — **never CSS classes**
  (portals churn those). `emptyState` must come from a real "portal said zero" signal, never from
  `listings.length === 0` (that would make a broken parser look like a quiet week). Every portal
  pads results with non-matching offers (recommendations, wider radius) that parsers must filter.
  `src/server/scraping/parsers/__fixtures__/` is the only real fixture-based test suite in the
  project — it's the only code that silently rots when a portal changes.
- Diff engine (`src/server/services/diff.ts`) is pure — no DB, no network.
- `startRun()` (`src/server/services/runs.ts`) isolates each link in its own try/catch so one dead
  portal never aborts the run.
- `reasonFor()` in `services/runs.ts` writes `<category>: <detail>` into `links.lastError`; the UI
  parses that prefix back in `linkError()` (`src/lib/format.ts`) to pick amber vs red. Add a
  category on one side and add it to the other.
- Refresh is **user-triggered only** — there is no scheduler, no background process, no cron. A run
  starts on exactly two user actions: clicking Refresh, and adding a link (which fires a one-link
  baseline, because the fetch is also how a new URL gets validated). Both go through `startRunFn` /
  `startRun(projectId, linkId?)`. Don't add a timer, and don't add a third trigger.
- DB requires `foreign_keys = ON` set explicitly (SQLite defaults it off, so cascading deletes
  silently no-op without it). Plain exported query functions in `src/server/models/queries.ts`, no
  repository classes.
- Two data planes on purpose: router loaders own projects and links (a write ends in
  `router.invalidate()`), React Query owns run polling and the findings timeline (a write ends in
  `queryClient.invalidateQueries()`). Several actions touch both and must invalidate both.
- A run's per-link record is `runLinks` — counters, status, and the fetch log. It is the link page's
  history _and_ its live progress: `useLinkRun` polls it instead of a run id, so it can follow a run
  it did not start (an add-triggered baseline, or a project-wide refresh) and survive a reload.
- `listings.postedAt` is the portal's own date and means something different on each portal — three
  publish one, two don't. `firstSeenAt` is the timestamp that always exists. See `docs/portals.md`.
- Changing a link's URL archives its listings and clears `baselinedAt` rather than editing in place;
  the baseline branch of `runLink()` therefore has to upsert, never blind-insert.

## Conventions

- One path alias: `@/*` → `./src/*`. Use it across folders, relative imports within one.
- TypeScript `strict` + `noUncheckedIndexedAccess` + `noUnusedLocals`/`noUnusedParameters` are
  deliberate (parser code indexes into arrays constantly) — don't relax.
- Don't delete or "clean up" `src/server/scraping/parsers/__fixtures__/` — parsers match them
  byte-for-byte.
- Adding a folder under `src/` means adding its `README.md` too. Keep them structural — what
  belongs, what doesn't, the gotcha. A file inventory rots on the next commit; a rule doesn't.
- `data/` (SQLite file + Playwright `storageState`) is gitignored, created at runtime, never
  committed.
- `pnpm format` runs `eslint --fix` before `prettier --write` — that order matters, ESLint's
  `consistent-type-imports` fix leaves lines unformatted.

## Styling

shadcn/ui on Tailwind v4, dark-only. `components.json` drives the CLI; `src/styles.css` is the
whole theme.

- No `tailwind.config.*` — don't add one; theme lives in `:root` + `@theme inline` in `styles.css`.
- Dark-only by design: `<html className="dark">` is hardcoded, `color-scheme: dark` is on `:root`
  (keeps native controls and scrollbars dark) — no toggle, no `prefers-color-scheme`.
  Never write `dark:` variants in app code (only `src/components/ui/` needs the `.dark` class).
- Semantic tokens (`bg-background`, `text-muted-foreground`, etc.) for chrome; literal Tailwind
  colors only where color carries information (status dots, the amber `browser` badge) — pick
  dark-appropriate shades directly (`emerald-500`), not light-mode pairs.
- `src/components/ui/` is CLI-generated (`pnpm dlx shadcn@latest add <name>`) — add only what's
  needed, not a bulk install. Hand-edits must survive a re-add: the AlertDialog overlay is bumped
  to `bg-black/60` (default `bg-black/10` is invisible on a dark background), and `tabs`,
  `scroll-area`, `separator` have their shipped `data-horizontal:`/`data-vertical:` variants
  rewritten to `data-[orientation=…]:` — Tailwind compiles the shorthand to `[data-horizontal]`,
  an attribute nothing renders, so those rules were dead (tabs laid out sideways, invisible
  scrollbar thumb).
- Use `cn()` from `@/lib/utils` for any conditional/merged class string.

## Dependency policy

Ladder (need it → already installed → stdlib → native platform feature → new dependency) applies
as usual. The one deliberate exception already in this repo is the shadcn/ui adoption (`radix-ui`,
`class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `tw-animate-css`,
`@fontsource-variable/geist`), requested directly rather than derived from a phase. If a new
dependency is genuinely needed, check peer compatibility with what's pinned (React 19, Vite 8,
TypeScript 6, Tailwind 4, drizzle-orm 0.45) and pin with `^`, not `latest`.

## Comments policy

Do not add comments unless necessary — code should be self-explanatory; if you feel the urge,
consider refactoring instead. If you do add one, make it clear, concise, and non-obvious (don't
state what the code already expresses).

## DONT DO

- Don't modify directly original shadcn components inside src/components/ui folder.
