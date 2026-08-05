# Phase 06 — Diff engine

**Goal:** decide what is new, what changed price, and what actually disappeared. Pure functions, no
DB, no network — so it is fully unit-testable.

## `src/server/diff.ts`

```ts
type Known = { externalId: string; price: number | null; firstSeenAt: number }

export function diff(known: Known[], fetched: ParsedListing[]): {
  added:   ParsedListing[]
  priced:  { listing: ParsedListing; oldPrice: number; newPrice: number }[]
  removalCandidates: Known[]
}
```

Caller (phase 07) supplies `known` = live listings for that link (`removedAt IS NULL`) and `fetched`
= the parsed page(s) in page order.

## Rule 1 — baseline

If the link has never been fetched (`baselinedAt IS NULL`), everything is recorded as seen and **no
events are emitted**. The run reports `baseline: N`. Handle this in the caller by skipping `diff()`
entirely, not with a flag inside it.

Rationale: a fresh link finds 65 months-old listings. Reporting them as "new" makes the first batch
pure noise and buries the real news that follows.

## Rule 2 — added / price changed

- `externalId` not in `known` → `added`.
- present, and `price` differs from the stored price → `priced` with both values.
  Only when both prices are non-null; `null → 250000` is a listing that simply published its price,
  which is not a price *change*. Ignore sub-1 PLN differences from float noise.

## Rule 3 — removal, the part that is easy to get wrong

Naive "in `known` but not in `fetched` ⇒ removed" is **wrong** and will fire phantom "sold!" events
on every run: the window is newest-first and only ~2 pages deep, so old listings scroll off the
bottom as new ones arrive.

Correct nomination:

```
present        = known ∩ fetched
oldestPresent  = min(firstSeenAt) over present        // the bottom edge of the window
candidates     = known where absent from fetched AND firstSeenAt > oldestPresent
```

If something *older* than X is still on the page, X did not fall off the bottom — it is genuinely
gone. If `present` is empty, nominate nothing (the whole window turned over; we cannot tell).

Then confirm each candidate individually:

```ts
export async function verifyRemoved(url: string): Promise<boolean>
```

GET the listing's own detail page. Removed if: 404/410, a redirect to a search/home page, or the body
carries an expired marker (`Ogłoszenie nieaktualne`, `nie jest już dostępne`, `zakończone`). Anything
else → leave the listing live and try again next run. Candidates are rare, so this costs almost
nothing; apply the same 3–8s jitter.

> Record the real expired-page markers per portal by fetching one dead listing from each, the same
> way phase 05 records empty-state markers. Do not guess the wording.

## Rule 4 — how deep to fetch

Lives here as a helper the orchestrator calls:

- Always fetch page 1.
- Fetch page 2 **only if page 1 contained zero already-known `externalId`s** — an entirely unfamiliar
  page 1 means more than a page of news arrived and there is probably more below.
- Baseline runs always take both pages, to seed a useful window.
- Never more than 2 pages.

Page-2 URL construction is per-portal (`page=2` for gratka/otodom, path-position for
nieruchomosci-online, `page=2` for olx, `/2` style for adresowo) — put `pageUrl(portal, url, n)` in
`src/server/portals.ts` next to `detectPortal`, and return `null` where a portal's pagination cannot
be derived, in which case page 1 alone is used.

## Tests (`diff.test.ts`)

The whole point of making this pure. Cover:

1. baseline path emits nothing;
2. an unseen `externalId` → `added`;
3. price 320000 → 295000 → `priced` with old and new;
4. `null → 250000` → **not** a price change;
5. a listing pushed off the bottom of the window (absent, and the oldest present listing is newer
   than it) → **no** candidate;
6. a listing absent while older listings are still present → candidate;
7. `present` empty → no candidates;
8. unchanged listing → no events at all.

Test 5 is the one that matters. Without it you ship phantom removals.

## Done when

`pnpm test` green on all eight cases, and `diff.ts` imports neither the DB nor the fetch layer.
