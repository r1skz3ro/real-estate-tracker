# Phase 09 — Scheduler

**Goal:** the twice-a-day automation, surviving a laptop that sleeps. Plus the 60-day prune.

## `src/server/scheduler.ts`

Started once with the server, in the same process as everything else.

```ts
cron.schedule('*/5 * * * *', tick)   // node-cron, every 5 minutes
```

### Why a 5-minute tick instead of two cron entries

Two cron entries at 08:00 and 20:00 would silently skip the slot if the Mac was asleep, and would
need re-registering whenever a project's times change. Instead the tick *compares clock times*, which
makes catch-up fall out for free.

### `tick()`

For each project:

1. Current wall-clock time in **Europe/Warsaw** — get it via
   `Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit', hour12: false })`.
   Do not use the host's local timezone; do not add a date library for this one operation.
2. For each of `runAt1`, `runAt2`: build today's timestamp for that time.
3. A slot is **due** if it is in the past and `lastScheduledAt` is before it.
4. If any slot is due → `runProject(project.id, 'scheduled')`, then set
   `lastScheduledAt = now`.

Both slots overdue (machine off all day) collapses into **one** run, not two — you want the current
state of the portals, not two runs 30 seconds apart.

### Startup catch-up

Call `tick()` once on server start, before the interval. Booting the app at 09:00 after the 08:00
slot passed must produce a run immediately. This is the behaviour that makes the whole
always-on-app model actually work.

### Serialisation

Scheduled runs go through the same global mutex as manual ones. A tick landing mid-manual-refresh
queues behind it. Never run two projects concurrently — the politeness budget is global, not
per-project.

## Prune (daily, `0 4 * * *`)

Applying the 60-day retention decision:

```sql
DELETE FROM events   WHERE createdAt < now - 60d;
DELETE FROM listings WHERE removedAt IS NOT NULL AND removedAt < now - 60d;
DELETE FROM runs     WHERE startedAt < now - 60d;   -- cascades runLinks
```

**Never delete a listing with `removedAt IS NULL`.** `listings` is the seen-set: dropping a live row
makes that listing reappear as "new" on the next run, forever. This is the single most damaging
mistake available in this codebase — leave the comment in the code.

Run `VACUUM` after pruning. Deleting event rows does not shrink the file on its own.

## Config

`.env`: `SCHEDULER_ENABLED=true`, `RETENTION_DAYS=60`. Being able to switch the scheduler off while
developing matters — you do not want a background Chromium launching mid-edit. Disable it under
`vitest` unconditionally.

## Done when

- Set a project's `runAt1` two minutes ahead, leave the app running → a `scheduled` run appears on
  its own and lands in the timeline.
- Stop the app, set a time that has just passed, start the app → a run fires within seconds of boot.
- Two due slots produce exactly one run.
- Backdate an event to 61 days and run the prune manually → the event is gone, live listings are
  untouched, and a subsequent refresh reports **0 new** (proving the seen-set survived).
