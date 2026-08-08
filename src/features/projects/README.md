# features/projects

A project is a named set of saved search URLs refreshed together. This folder owns creating,
editing, listing and deleting one.

## Belongs here

`AppSidebar.tsx` (the app-wide left nav, rendered by `__root.tsx` on every route), the create
dialog it launches, the inline name + description header on the project page, the delete dialog,
and the three mutation hooks behind them (`useProjects.ts`). `schema.ts` holds the zod schemas that
both the forms and the server fns validate against.

## Doesn't belong here

Links, runs and the changes timeline — each has its own feature folder even though they all render
on the project page.

## Gotchas

- `schema.ts` is imported by `@/server/controllers/projects.ts`. Keep it dependency-free apart from
  zod: the browser imports it too, so a stray server import there breaks hydration.
- Every project write invalidates the **router**, not a query key — the sidebar's unread and
  failing counts come from the root loader, not from React Query.
- `ProjectHeader` uses react-hook-form's `values` rather than `defaultValues`: the route component
  is not remounted when the `$projectId` param changes, so the inputs must re-sync.
- `AppSidebar` is named around the `Sidebar` primitive it imports from `@/components/ui/sidebar`,
  not the other way round. The `--sidebar-*` tokens it renders against are hand-written in
  `src/styles.css` — see `src/components/ui/README.md`.
- `description` is nullable in SQLite but the forms write `''`, so every reader needs `?? ''`. The
  zod schema deliberately has no `.transform()` to fold one into the other: that would split the
  resolver's output type from the form's input type.
