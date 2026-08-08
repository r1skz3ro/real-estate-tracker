# features/runs

A run is one manual refresh of every link on a project. This folder owns starting one and following
it to the end.

## Belongs here

`useRun.ts` — start mutation, polling query, the per-link status map, and the invalidation that
fires when the run stops. `RefreshButton.tsx` renders it.

## Doesn't belong here

Anything about what a run _found_: new listings, price changes and removals are
`features/findings`. Anything about an individual link's row: `features/links`.

## Gotchas

- There is no push channel. `startRunFn` returns a `runId` immediately and the work continues on
  the server behind a global mutex, so polling every 1.5s until the status leaves `running` is the
  only way to follow it — and the poll must stop itself, or it hammers the server forever.
- A finished run rewrote every link's status, `fetchMode` and `lastError`, so `useRun` invalidates
  both the router (link rows) and the `['findings', projectId]` query (the timeline).
- Call `useRun` once per project page, in the route. Two callers means two independent runs polled
  separately.
