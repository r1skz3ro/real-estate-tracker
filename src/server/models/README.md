# server/models

The M: the drizzle schema and every query in the app.

## Belongs here

`schema.ts` (six tables: projects, links, runs, runLinks, listings, events), `queries.ts` (plain
exported functions, no repository classes), and `index.ts` (the connection).

## Doesn't belong here

Anything that decides _whether_ to write — that is `../services`. Fetching, parsing, request
handling.

## Gotchas

- **`schema.ts` must import nothing but drizzle.** drizzle-kit resolves it outside the bundler, so
  an aliased import there breaks `pnpm db:generate`. `ListingDetails` and `LogLine` are declared
  here rather than next to their users for exactly this reason.
- **`foreign_keys = ON` is set explicitly** in `index.ts`. SQLite defaults it off, and without it
  cascading deletes silently no-op.
- `createDb(':memory:')` is the test seam; `db` is a singleton created and migrated at import time.
- `runLinks.log` is a link's fetch log, appended line by line during a run. Read-modify-write on
  one row's JSON, because nothing ever queries a log line across runs — if something ever needs to,
  it becomes a table.
- `linkListingsPage` selects every column _except_ `details`. That column is `Record<string,
unknown>`, which a server function cannot prove serializable; returning it fails typecheck rather
  than runtime, which is why `listFindings` spells its columns out too.
- `listProjects` and `listFindings` return view-shaped results (unread/failing counts, runs grouped
  with a `hasMore` flag). Deliberate: one query beats a service that re-walks the rows in JS.
