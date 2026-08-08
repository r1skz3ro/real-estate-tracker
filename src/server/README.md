# server

The entire backend. Nothing outside this folder touches the database, the network or a browser.

## The layers

```
controllers/   createServerFn — validate input, delegate, return
     ↓
services/      business rules and orchestration
     ↓                          ↓
models/        schema+queries   scraping/   portals, fetch, parsers
```

| Layer          | Holds                                                                   | May import                                  |
| -------------- | ----------------------------------------------------------------------- | ------------------------------------------- |
| `controllers/` | one `createServerFn` per operation, zod validator + one delegating call | services, models                            |
| `services/`    | rules, orchestration, pure domain logic                                 | models, scraping                            |
| `models/`      | drizzle schema and flat query functions                                 | nothing else in `src/`                      |
| `scraping/`    | portal identity, fetching, parsing                                      | models (to persist a fetch-mode escalation) |

## Rules

- **A service exists only where there is logic.** `projects` and `findings` have none worth a
  module, so their controllers call the model directly. A pass-through service is noise, not
  symmetry.
- **Controllers may only reference server symbols inside handler bodies.** Handler bodies are the
  only thing stripped from the client bundle. Touch a model or service at module scope and
  better-sqlite3 follows the import into the browser, which kills hydration. `pnpm build` still
  succeeds when this breaks — the check that catches it is
  `grep -rE "better.sqlite3|playwright" dist/client/`, which must find nothing.
- Values both sides need (zod schemas, `MAX_LINKS`) live in the feature folder as dependency-free
  leaves and are imported _from_ here. That is the only server → client dependency.

## Request path

`route → controllers/runs.ts:startRunFn → services/runs.ts:startRun → withLock(execute) → runLink
→ scraping/fetch → scraping/parsers → services/diff → models/queries`
