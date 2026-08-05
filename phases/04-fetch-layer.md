# Phase 04 — Fetch layer

**Goal:** get HTML for a URL, politely, over HTTP or a real browser, with automatic escalation when a
portal blocks us. **No parsing in this phase.**

## Why both modes exist

Measured during planning, not assumed:

- otodom, gratka, adresowo, nieruchomosci-online → plain `fetch` returns 200 with full listings.
- **olx → 403 from CloudFront on every plain-HTTP variant tried**: browser-identical headers,
  HTTP/2, and its own `/api/v1/offers` JSON endpoint. Headless Chrome renders 65 cards fine.

So OLX needs a browser today, and any other portal might tomorrow.

## `src/server/fetch/http.ts`

```ts
export async function httpFetch(url: string): Promise<FetchResult>
```

- Chrome-like headers: `User-Agent` (current Chrome on macOS), `Accept: text/html,...`,
  `Accept-Language: pl-PL,pl;q=0.9,en-US;q=0.8`, `sec-fetch-*`, `upgrade-insecure-requests: 1`.
- 25s timeout via `AbortSignal.timeout(25_000)`.
- Return `{ ok, status, html, blocked }` — never throw for an HTTP status.
- `blocked = status is 403/429/503` **or** the body matches a challenge marker
  (`Request blocked`, `captcha`, `cf-browser-verification`, `DataDome`). The observed OLX block body
  is an AWS CloudFront `403 ERROR / Request blocked` page — small (~900 bytes) and unmistakable.

## `src/server/fetch/browser.ts`

Playwright Chromium.

- **One browser per run**, not per link. `getBrowser()` lazily launches on first browser-mode link;
  `closeBrowser()` is called in the run's `finally` (phase 07).
- Persist `storageState` to `data/browser-state.json` and reload it on launch, so OLX sees a
  returning visitor with cookies rather than a fresh one every 12 hours.
- Context: `locale: 'pl-PL'`, `timezoneId: 'Europe/Warsaw'`, a normal desktop viewport, same UA
  family as the HTTP path.
- `page.goto(url, { waitUntil: 'domcontentloaded' })`, then wait for the portal's card selector with
  a bounded timeout, then return `page.content()`. Falling back to a fixed wait when the selector
  never appears is fine — the parser and its empty-state check decide whether the result is valid.
- Close the *page* after each link; keep the *context* for cookie continuity.

## Politeness

Non-negotiable, per the decisions in `README.md`:

- `sleep(3000 + Math.random() * 5000)` between every request, including between page 1 and page 2.
- **Global mutex**: one run at a time, process-wide. A promise-chain mutex in a module-level variable
  is enough — this is one process. A second refresh queues behind the first rather than running
  concurrently or being dropped.
- Twice-daily × 10 links × ≤2 pages ≈ 40 requests/day/project. Deliberately indistinguishable from
  a person browsing.

## Escalation (`src/server/fetch/index.ts`)

```ts
export async function fetchPage(link, url): Promise<{ html, usedBrowser }>
```

1. If `link.fetchMode === 'browser'` → browser directly.
2. Otherwise HTTP. If the result is `blocked`, retry **once** via browser.
3. Phase 07 additionally escalates on a *broken-parse verdict* (0 listings + no empty-state), because
   some blocks return 200 with a challenge page.
4. On a successful escalation, persist `link.fetchMode = 'browser'` and set `runLinks.escalated = 1`.

One rule, so a portal that tightens up next month needs no code change.

Never escalate more than once per link per run, and never retry a plain network timeout more than
once — hammering a host that is already refusing us is exactly what gets an IP flagged.

## Done when

A scratch script (`pnpm tsx scripts/probe.ts`, not committed as a test) shows:

- otodom example URL over HTTP → 200, HTML contains `__NEXT_DATA__`.
- OLX example URL over the browser path → HTML contains `data-cy="l-card"`.
- Forcing an otodom link to `fetchMode: 'browser'` also works — the two paths are interchangeable.
- Two `fetchPage` calls fired concurrently are serialised by the mutex (log timestamps to confirm).
- `data/browser-state.json` exists after a browser run.
