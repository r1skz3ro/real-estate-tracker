# Phase 10 — Hardening

**Goal:** make failures obvious, make the app runnable from a cold clone, leave the notification seam.

## Error surfacing

A scraper that quietly returns nothing is worse than one that crashes. Per link, show:

| State | Meaning | Shown as |
|---|---|---|
| `ok` | last run parsed listings | green dot + "last checked 20:00" |
| `error: blocked` | 403/429/challenge, browser retry also failed | red + "blocked by portal" |
| `error: parse-broken` | 0 listings and no empty-state marker | red + "page layout changed — parser needs updating" |
| `error: timeout` / `network` | transport failure | amber + "couldn't reach portal" |
| `pending` | never run | grey |

`parse-broken` deserves its own distinct wording: it means the portal changed its HTML and phase 05's
fixtures need refreshing. Amber vs red matters — a timeout usually fixes itself, a layout change
never does.

`lastError` shows on the link row and clears on the next success. A project with any failing link
gets a warning marker in the sidebar, otherwise a red link on a project you rarely open is invisible.

## UI states

Loading, empty and error states for: project list (empty → "create your first project"), link list
(empty → "add a search URL"), findings timeline (empty → "no changes yet — refresh to set a
baseline"). Error boundary around the project route so one bad query does not blank the app.

## README.md

Written for you-in-six-months, who will have forgotten all of it:

```
pnpm install
pnpm exec playwright install chromium     # required — OLX cannot be scraped without a browser
pnpm db:migrate
pnpm dev                                  # or: pnpm build && pnpm start
```

Cover: what the app does; the five supported portals and the assumption that **each URL is already
sorted newest-first** (the whole design rests on it); where data lives (`data/estate.db`, deleting it
loses history and re-baselines every link); that the app must stay running for scheduled refreshes,
with a `pm2 start`/launchd one-liner for keeping it alive across reboots; and how to refresh parser
fixtures when a portal changes.

Add a `docs/portals.md` recording per portal: fetch mode, extraction path, empty-state marker,
expired-listing marker, pagination scheme. When something breaks in eight months this is the file
that saves the afternoon.

## notify seam

At the end of `runProject`:

```ts
// ponytail: single seam for future email/Telegram. Add a channel here, not an abstraction.
await notify(project, summary)
```

`notify()` currently does nothing. Do not build a provider interface for zero providers.

## Final sweep

- `pnpm lint && pnpm typecheck && pnpm test` clean.
- No secrets or absolute local paths committed; `data/` gitignored.
- `git init` + first commit if not already done (the project is not a git repo yet).

## Done when

- Deliberately break one parser's selector → that link goes red with "page layout changed", the other
  four stay green, and the run still completes.
- Point a link at an unreachable host → amber, not red.
- Fix both → next run clears the errors.
- A cold `git clone` + the four README commands produces a working app.
