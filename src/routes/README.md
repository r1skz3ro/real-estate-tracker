# routes

File-based routes, compiled to `src/routeTree.gen.ts` by `pnpm generate-routes` (`tsr generate`).

## Belongs here

Route definitions only: `createFileRoute`, `loader`, `errorComponent`, and a component that
composes feature components. Anything that needs the URL — params, loader data, error boundaries.

## Doesn't belong here

Markup, forms, mutations, derived state. If a route file is growing past ~60 lines it is holding a
feature's UI hostage; move it into `src/features/<feature>/`.

## Gotchas

- `routeTree.gen.ts` is generated — never hand-edit it; re-run `pnpm generate-routes` after adding
  or renaming a route file.
- `__root.tsx` is the whole app shell: `SidebarProvider` + `AppSidebar` + `SidebarInset`. Every
  route renders inside the inset, so no route draws its own chrome.
- `__root.tsx` loads the project list for the sidebar, and `index.tsx` reuses it with
  `useLoaderData({ from: '__root__' })` instead of fetching again. Deliberate, not an accident.
- `index.tsx` is a signpost, not a page — projects are created and picked in the sidebar, so `/`
  only says which. It is also where deleting a project lands.
- Loaders run in parallel or not at all — use `Promise.all`, two sequential `await`s are a request
  waterfall.
