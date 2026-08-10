# features/links

A link is one saved search URL on one portal, and it is the unit the app actually works in — calls
run one link at a time, each with its own status, listings and history. This folder owns the list of
them on the project page **and** the page each one gets at
`/projects/$projectId/links/$linkId`.

## Belongs here

The project-page list (`LinksCard`, `LinkRow`, `AddLinkForm`) and the link page itself: `LinkPage`
(header + tabs), `LinkHeader`, `LinkListings`, `LinkActivity`, `LinkSettings`, `ListingsTable`, the
mutation and query hooks, and the two pure modules — `linkState.ts` (a row's dot, label and tooltip)
and `runHistory.ts` (a fetch's outcome, duration, and whether it was the initial one).

## Doesn't belong here

Starting or polling a **project-wide** refresh: that is `features/runs`. `LinksCard` receives the
run as a prop because the route owns it, so the button and every row see the same one.

## Gotchas

- `constants.ts` (`MAX_LINKS`) is imported by `@/server/services/links.ts`. It has no imports of
  its own on purpose — the browser needs it, so it must stay a leaf.
- `linkState.ts` reads the category prefix of `links.lastError` (`timeout:`, `parse-broken:`, …)
  through `linkError()` in `@/lib/format`. That string format is written by
  `@/server/services/runs.ts`'s `reasonFor()`; nothing enforces the contract but the tests.
- `runHistory.ts` has the same kind of contract: it detects a baseline by the `baseline:` line in
  the run's log, because the counters cannot — a baseline and a quiet run are both all-zero.
- **The link page does not use `features/runs`' `useRun`.** That hook keeps the run id in component
  state, so it can only follow a run it started; the two this page cares about most are ones it did
  not — the baseline a new link fires on itself, and a project-wide refresh. `useLinkRun` polls the
  link's own history instead, which needs no id and survives a reload.
- Adding a link starts a run. `addLink` returns `{ link, runId }` and the fetch doubles as the
  validation — a dead URL or a blocked portal surfaces as a real error with a log.
- Changing a link's URL is not an edit, it is a restart: the old listings are archived, `baselinedAt`
  is cleared, and the next fetch re-baselines. `LinkSettings` confirms before doing it.
- The form validates nothing. Portal, https, cap and duplicate are all enforced server-side, and
  the server's message is the one worth showing.
- Renaming happens on the Settings tab, not in the row — the row's label is the way into the page.
