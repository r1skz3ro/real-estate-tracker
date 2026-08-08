# features/links

A link is one saved search URL on one portal. This folder owns the list of them, adding, renaming
and removing, and how each row reports its state.

## Belongs here

`LinksCard` (the container), `LinkRow`, `AddLinkForm`, the mutation hooks, and `linkState.ts` —
the pure function that turns `(link, runLink, startedAt)` into a dot colour, a label and a tooltip.

## Doesn't belong here

Starting or polling a refresh: that is `features/runs`. `LinksCard` receives the run as a prop
because the route owns it, so the refresh button and every row see the same one.

## Gotchas

- `constants.ts` (`MAX_LINKS`) is imported by `@/server/services/links.ts`. It has no imports of
  its own on purpose — the browser needs it, so it must stay a leaf.
- `linkState.ts` reads the category prefix of `links.lastError` (`timeout:`, `parse-broken:`, …)
  through `linkError()` in `@/lib/format`. That string format is written by
  `@/server/services/runs.ts`'s `reasonFor()`; nothing enforces the contract but the tests.
- The form validates nothing. Portal, https, cap and duplicate are all enforced server-side, and
  the server's message is the one worth showing.
