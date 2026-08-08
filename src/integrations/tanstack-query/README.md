# integrations/tanstack-query

The React Query client and its devtools panel.

## Belongs here

`root-provider.tsx` — creates the `QueryClient` and returns it as router context.
`devtools.tsx` — the panel registration `__root.tsx` plugs into `TanStackDevtools`.

## Doesn't belong here

Query keys, query functions, mutations. Those live with the feature that owns the data.

## Gotcha

Two data planes coexist on purpose: **router loaders** own projects and links (so a write is a
`router.invalidate()`), **React Query** owns run polling and the findings timeline (so a write is a
`queryClient.invalidateQueries()`). Several actions touch both and must invalidate both — see
`features/runs/useRun.ts` and `features/findings/useFindings.ts`.
