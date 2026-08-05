# Phase 08 — Findings UI

**Goal:** the screen you actually use — what changed, grouped by refresh, newest first.

## Layout

Project page below the links panel: a timeline of runs, newest first. One section per run that
produced events; runs with zero events collapse to a single quiet line
("5 Aug 20:00 · scheduled · no changes") so an empty week does not look like a broken app.

Section header: timestamp (`5 sie, 20:00`), trigger badge (manual/scheduled), totals
(`3 new · 1 price · 1 removed`), and a "mark all read" button.

## Listing card

Fields, per the locked decision — no more:

```
[thumbnail]  Title                                   [portal badge]
             389 000 zł · 1 556 m² · 250 zł/m²
             Sulistrowice, ul. Aroniowa
```

- Whole card links to the portal listing, `target="_blank" rel="noopener noreferrer"`.
- Missing values render `—`. OLX often has no area; that is expected, not a bug.
- Format numbers with `Intl.NumberFormat('pl-PL')` — thin space groups, `zł` suffix. The stdlib
  already does Polish formatting; do not hand-roll it.
- Thumbnails: hotlink the portal's URL, `loading="lazy"`, and render a neutral placeholder on error.
  Some portals send `Referer`-sensitive images — if one portal's thumbnails 403, drop to the
  placeholder for that portal rather than proxying images.

## Event types

- `new` — standard card.
- `price` — card plus the change: `320 000 → 295 000 zł`, with the direction coloured (a drop is the
  interesting case).
- `removed` — title struck through, muted, labelled "no longer listed".

## Read state

- Unread events get a left accent bar and a slightly stronger background.
- "Mark all read" per section, and a "mark everything read" on the project.
- Auto-read on view: when a section scrolls into the viewport, mark its events read after ~1s with an
  `IntersectionObserver` — native, no library.
- Unread counts drive the sidebar badges from phase 02.

## Data

`listFindingsFn({ projectId, limit })` returns runs with their events joined to listings and link
labels, newest first. Paginate by run, default the most recent 20 runs, "load more" below. Do not
fetch 60 days of history on first paint.

`markReadFn({ runId })` / `markAllReadFn({ projectId })` set `readAt`, then invalidate.

## Filters

One filter row: event type (all / new / price / removed) and portal. Client-side over the loaded set —
the volumes here are tiny and a server round-trip per toggle would be slower.

## Done when

- Two consecutive real refreshes produce two distinct, correctly-timestamped sections.
- Editing a listing's stored price in SQLite and re-running produces a `price` card showing both values.
- Unread styling and badges clear correctly on mark-read and stay cleared after reload.
- A run with no events renders as one quiet line, not an empty box.
