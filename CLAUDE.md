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

`pnpm db:generate` / `pnpm db:migrate` (drizzle-kit) manage the SQLite schema — see `src/db/`.

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

- `src/server/portals.ts` is the single source of truth for portal identity (hostname regex →
  `fetchMode`) — don't re-derive portal logic elsewhere.
- `fetchPage()` unifies `http.ts`/`browser.ts` and escalates HTTP → browser once on a detected
  block, persisting that escalation onto the link.
- Parsers anchor on embedded ld+json/`__NEXT_DATA__` or `data-*` attributes — **never CSS classes**
  (portals churn those). `emptyState` must come from a real "portal said zero" signal, never from
  `listings.length === 0` (that would make a broken parser look like a quiet week). Every portal
  pads results with non-matching offers (recommendations, wider radius) that parsers must filter.
  `src/server/parsers/__fixtures__/` is the only real fixture-based test suite in the project — it's
  the only code that silently rots when a portal changes.
- Diff engine (`src/server/diff.ts`) is pure — no DB, no network.
- `startRun()` isolates each link in its own try/catch so one dead portal never aborts the run.
- Refresh is **manual only** — there is no scheduler, no background process, no cron. A run starts
  when the user clicks Refresh (`startRunFn`) and never any other way; don't add a timer.
- DB requires `foreign_keys = ON` set explicitly (SQLite defaults it off, so cascading deletes
  silently no-op without it). Plain exported query functions in `src/db/queries.ts`, no repository
  classes.

## Conventions

- Path aliases `#/*` and `@/*` both resolve to `./src/*`.
- TypeScript `strict` + `noUncheckedIndexedAccess` + `noUnusedLocals`/`noUnusedParameters` are
  deliberate (parser code indexes into arrays constantly) — don't relax.
- Don't delete or "clean up" `src/server/parsers/__fixtures__/` — parsers match them byte-for-byte.
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
  to `bg-black/60` (default `bg-black/10` is invisible on a dark background).
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
