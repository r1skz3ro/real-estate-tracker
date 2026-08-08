# server/services

Business logic. The only layer allowed to compose the model with scraping.

## Belongs here

Rules a controller cannot express in one call: `links.ts` (what makes a search URL acceptable),
`runs.ts` (the whole refresh orchestration), `diff.ts` (what counts as new, repriced or removed).

## Doesn't belong here

`createServerFn` (that is `../controllers`), raw SQL (that is `../models`), HTTP and HTML (that is
`../scraping`).

## Gotchas

- `diff.ts` is **pure** — no DB, no network, no clock. Keep it that way; it is the one piece of
  this app whose correctness is cheap to test.
- `runs.ts:runLink` isolates each link in its own try/catch so one dead portal never aborts a run,
  and confirms every removal candidate against its own detail page _before_ opening the write
  transaction, because each confirmation is a network round trip.
- `runs.ts:reasonFor` writes `<category>: <detail>` into `links.lastError`. The UI parses that
  prefix back in `@/lib/format`'s `linkError()`. Add a category here and add it there too.
- Nothing is ever deleted. `listings` is both the seen-set and the permanent archive — removing a
  live row makes it reappear as "new" on the next run, forever.
