# Estate Tracker — phase index

Cross-portal Polish real-estate listing change monitor. Local, single-user, no auth.

Execute phases in order, one per session. Each phase ends with a **Done when** check that must
actually pass before moving on.

| # | Phase | Delivers | Status |
|---|---|---|---|
| 00 | [Scaffold](./00-scaffold.md) | TanStack Start app, TS strict, lint, test runner | ✅ done |
| 01 | [Database](./01-database.md) | Drizzle schema + migrations + query helpers | ✅ done |
| 02 | [Projects](./02-projects.md) | Project CRUD + per-project schedule times | ✅ done |
| 03 | [Links](./03-links.md) | Link CRUD, portal detection, 10-link cap | ✅ done |
| 04 | [Fetch layer](./04-fetch-layer.md) | HTTP + Playwright fetch, throttle, escalation | ✅ done |
| 05 | [Parsers](./05-parsers.md) | Five portal parsers + fixture tests | ✅ done |
| 06 | [Diff engine](./06-diff-engine.md) | new / price-changed / removed detection | ⬜ next |
| 07 | [Run orchestration](./07-run-orchestration.md) | Background refresh job + live progress | ⬜ |
| 08 | [Findings UI](./08-findings-ui.md) | Timeline of refresh batches, listing cards | ⬜ |
| 09 | [Scheduler](./09-scheduler.md) | node-cron, per-project times, catch-up, prune | ⬜ |
| 10 | [Hardening](./10-hardening.md) | Error surfacing, README, notify seam | ⬜ |

## Non-negotiable rules

These come from live reconnaissance and from decisions already made. Do not "simplify" them away.

1. **OLX cannot be fetched over plain HTTP.** Verified: CloudFront 403s realistic Chrome headers,
   HTTP/2, and its own `/api/v1/offers` JSON endpoint. It needs a real browser. The other four
   portals do not.
2. **Zero parsed ≠ zero new.** A quiet search still parses ~30 listings and produces 0 findings —
   that is normal and green. A link only errors on *0 parsed **and** no empty-state marker*.
3. **Falling off the window ≠ removed.** With a newest-first 2-page window, old listings scroll off
   naturally. Only nominate a removal when a listing vanished while listings *older* than it are
   still present, then confirm against its own detail URL.
4. **Never delete live listings when pruning.** `listings` is the seen-set; deleting a row with
   `removedAt IS NULL` makes that listing reappear as "new" forever.
5. **Be polite.** Sequential fetches, 3–8s random gap, one run at a time globally, one reused
   browser per run with persisted cookies.

## Reference: verified extraction paths

| Portal | Fetch | Path | Empty state |
|---|---|---|---|
| otodom.pl | HTTP | `<script id="__NEXT_DATA__">` → `props.pageProps.data.searchAds.items` | `items: []` |
| nieruchomosci-online.pl | HTTP | ld+json `CollectionPage` → `mainEntity.offers[0].offers` | `offers: []` |
| gratka.pl | HTTP | ld+json `Product` → `offers.offers` | `offerCount: 0` |
| adresowo.pl | HTTP | `#offer-list-results a[data-track="offer-link"]` → `/o/<slug>` | grid renders empty |
| olx.pl | **browser** | `[data-cy="l-card"]`, `a[href^="/d/oferta/"]` → `-ID<code>.html` | `[data-testid="total-count"]` reads 0 |

Each portal pads a search with offers that are **not** results of it, and phase 05 filters all three
out: gratka renders six "you might like" cards on an empty search (hence ld+json, not the
`[data-property-id]` cards), adresowo appends an "Oferty z najbliższej okolicy" block below the
results grid, and OLX marks wider-radius and last-resort fillers with a `reason=extended_search…`
query param.

Live HTML captures of all five, plus a zero-result page per portal, are in
`src/server/parsers/__fixtures__/` — used by phase 05's tests.
