# server/controllers

The RPC boundary. One `createServerFn` per operation, grouped by resource.

## Belongs here

A zod `.validator()` describing the wire input, and a `.handler()` that delegates in one call.
Guards that are purely about the request — "this id does not exist" — are fine here.

## Doesn't belong here

Business rules, multi-step orchestration, SQL. If a handler grows a second decision, it belongs in
`../services`. Compare `addLinkFn` (delegates to `services/links.ts`) with `listLinksFn` (one model
call, no service needed).

## Gotchas

- **Every server symbol must be referenced inside a handler body, never at module scope.** Only
  handler bodies are stripped from the client bundle; a top-level reference keeps the import alive
  and drags better-sqlite3 into the browser.
- Controllers are imported _by client code_ — routes call these functions, and feature `types.ts`
  files derive their types from the return signatures with `import type`. Both are safe; anything
  else exported from here is not.
- Zod schemas shared with a form live in the feature folder (`@/features/projects/schema`), not
  here, so the browser can import them without reaching into `server/`.
