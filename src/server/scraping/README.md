# server/scraping

Everything that talks to the five portals: who they are, how to fetch them, how to read them.

## Belongs here

`portals.ts` — the single source of truth for portal identity (hostname regex → `fetchMode`, ready
selector, expired markers, pagination URLs, label derivation). `fetch/` and `parsers/`.

## Doesn't belong here

What to _do_ with what came back. Diffing, event creation and run bookkeeping are `../services`.

## Gotchas

- **Be polite.** Sequential fetches only, never parallel; 3–8s random jitter between requests; one
  refresh run at a time process-wide behind a global mutex; one reused browser context per run with
  persisted cookies. These are not tunables.
- **OLX requires a real browser** — every plain-HTTP variant returns 403 from CloudFront. The other
  four portals are plain HTTP.
- Don't re-derive portal identity anywhere else. `detectPortal()` is the only way to go from a URL
  to a portal.
