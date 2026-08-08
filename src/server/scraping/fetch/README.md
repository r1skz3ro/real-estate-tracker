# server/scraping/fetch

Getting HTML out of a portal, politely, and deciding when a listing is really gone.

## Belongs here

`index.ts` — `withLock` (global mutex), `politely` (jitter), `fetchPage` (the HTTP → browser
escalation), `verifyRemoved`. `http.ts` — plain fetch with Chrome-ish headers and block detection.
`browser.ts` — the single Playwright context.

## Doesn't belong here

Parsing (`../parsers`) and any decision about what the listings mean (`../../services`).

## Gotchas

- `fetchPage` escalates HTTP → browser **once** on a detected block and persists that onto the
  link, so every later run skips the wasted HTTP attempt. This is the one place the scraping layer
  writes to the database.
- `withLock` is reentrant via `AsyncLocalStorage`, so a whole run can be wrapped in it without
  deadlocking the fetches inside. Every request pays the jitter, including page 1 → page 2.
- `verifyRemoved` is deliberately **one-sided**: anything it does not recognise leaves the listing
  live to be retried next run. An unrecorded expiry marker delays a removal rather than inventing
  one — a phantom "sold!" is the failure mode worth avoiding.
- `closeBrowser()` must run in a `finally`. A leaked Chromium per run eats the machine.
