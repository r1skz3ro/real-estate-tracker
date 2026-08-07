# Phase 09 — Scheduler

**Goal:** the twice-a-day automation, surviving a laptop that sleeps. Plus the 90-day prune and the
listing archive.

## `src/server/scheduler.ts`

Started once with the server, in the same process as everything else, from `src/server.ts` — the
optional TanStack Start server-entry override, which is the only module guaranteed to run exactly
once per server process in both `pnpm dev` and a built server.

```ts
cron.schedule('*/30 * * * *', tick)   // node-cron, every 30 minutes
```

### Why a 30-minute tick instead of two cron entries

Two cron entries at 08:00 and 20:00 would silently skip the slot if the Mac was asleep, and would
need re-registering whenever a project's times change. Instead the tick *compares clock times*, which
makes catch-up fall out for free.

30 rather than 5: the tick itself never touches a portal — only a due slot does — but the coarser
interval pairs with the one-project-per-tick rule below to spread portal traffic out. The interval is
`SCHEDULER_TICK_MINUTES` so the acceptance checks below don't take half an hour.

### `tick()`

For each project:

1. Current wall-clock day + time in **Europe/Warsaw**, via
   `Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw', dateStyle: 'short', timeStyle: 'short' })`
   → `"2026-08-06 20:15"`. `sv-SE` is ISO-ordered, so both halves compare as plain strings: no
   offset arithmetic, no date library, and none of the pain of building "today 08:00 Warsaw" as a
   timestamp.
2. A slot is **due** if its `HH:MM` has passed today and `lastScheduledAt` does not already cover it
   (`lastDay === today && lastTime >= slot`). A stamp from any earlier day never covers today —
   that is the catch-up.
3. If either slot is due → stamp `lastScheduledAt = now` **first**, then
   `runProject(project.id, 'scheduled')`, then **stop for this tick**.

Both slots overdue (machine off all day) collapses into **one** run, not two — `isDue` is a boolean
per project, not per slot. You want the current state of the portals, not two runs 30 seconds apart.

**One project per tick.** Several projects sharing 08:00 would otherwise queue every one of their
links against the same portal in a single uninterrupted serial burst — exactly the shape that looks
automated. Starting one project per tick spreads them 30 minutes apart instead. Drop the `break` if
a project ever needs its slot honoured to the minute.

### Startup catch-up

Call `tick()` once on server start, before the interval. Booting the app at 09:00 after the 08:00
slot passed must produce a run immediately. This is the behaviour that makes the whole
always-on-app model actually work.

### Serialisation

Scheduled runs go through the same global mutex as manual ones (`runProject` → `startRun` →
`withLock`). A tick landing mid-manual-refresh queues behind it. Never run two projects concurrently
— the politeness budget is global, not per-project.

## Prune (daily, `0 4 * * *` Europe/Warsaw)

Applying the 90-day retention decision — and the decision that this app is an **archive**:

```sql
DELETE FROM runs
WHERE startedAt < now - 90d
  AND id NOT IN (SELECT runId FROM events);   -- cascades runLinks
VACUUM;                                       -- deletes alone never shrink the file
```

That is the whole prune. **Nothing ever deletes a listing, and nothing ever deletes an event.**

- `listings` is the seen-set: dropping a row makes that listing reappear as "new" on the next run,
  forever. This is the single most damaging mistake available in this codebase.
- `listings` is also the archive. The whole point of keeping price, description, photo and plot data
  is that they stay exportable long after the offer expires on the portal.
- Events carry the price history that makes an archived listing worth having, so a run that produced
  any is kept too. What is left — runs that found nothing — is ~99% of them and pure noise.

`VACUUM` cannot run inside a transaction.

## Config

Plain `process.env`, no dotenv dependency (vite does not load `.env` into `process.env` for the
server runtime anyway):

| Var | Default | Why |
|---|---|---|
| `SCHEDULER_ENABLED` | on unless `false` | `SCHEDULER_ENABLED=false pnpm dev` — you do not want a background Chromium launching mid-edit |
| `SCHEDULER_TICK_MINUTES` | `30` | drop it to `1` to test the slot behaviour |
| `RETENTION_DAYS` | `90` | prune window |

Disabled under `vitest` unconditionally (`process.env.VITEST`).

## Listing archive

Two nullable columns on `listings`, captured at first sight and not refreshed afterwards (only price
is — that is what the diff engine tracks):

- `description` — text.
- `details` — JSON (`text({ mode: 'json' })`, typed `ListingDetails` from `parsers/util.ts`).

Only what the **search page** already returns; no detail-page fetch per listing, which would cost one
polite 3–8s request each. Verified against the committed fixtures:

| Portal | description | details |
|---|---|---|
| otodom | `shortDescription` (portal truncates it to ~200 chars) | `estate`, `transaction`, `roomsNumber`, `floorNumber`, `terrainAreaInSquareMeters`, `dateCreated`, `isPrivateOwner`, all image URLs |
| nieruchomosci-online | `itemOffered.description` (full) | `addressRegion` |
| gratka | — its ld+json `Product` carries only name/url/floorSize/address | — |
| adresowo | — nothing on the cards | — |
| olx | — nothing on the `l-card`s | — |

The fields are **optional** on `ParsedListing`, so the three portals with nothing to add are
untouched. `parsers.test.ts` asserts ≥80% coverage on the two that do have them — otherwise a renamed
JSON key would silently start writing nulls forever, which is the exact rot the fixture suite exists
to catch.

## Done when

- Set a project's `runAt1` two minutes ahead with `SCHEDULER_TICK_MINUTES=1`, leave the app running →
  a `scheduled` run appears on its own and lands in the timeline.
- Stop the app, set a time that has just passed, start the app → a run fires within seconds of boot.
- Two due slots produce exactly one run; two due projects produce one run per tick, not two at once.
- `SCHEDULER_ENABLED=false pnpm dev` → nothing fires.
- Backdate an event-free run to 91 days and prune → that run and its runLinks are gone, runs with
  events survive, every listing row survives, and a subsequent refresh reports **0 new** (proving the
  seen-set survived).
