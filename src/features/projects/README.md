# features/projects

A project is a named set of saved search URLs refreshed together. This folder owns creating,
editing, listing and deleting one.

## Belongs here

`AppSidebar.tsx` (the app-wide left nav, rendered by `__root.tsx` on every route), the create
dialog it launches, the inline name + description header on the project page (which also carries
the delete dialog), and the three mutation hooks behind them (`useProjects.ts`). `schema.ts` holds the zod schemas that
both the forms and the server fns validate against.

## Doesn't belong here

Links, runs and the changes timeline — each has its own feature folder even though they all render
on the project page.

## Gotchas

- `schema.ts` is imported by `@/server/controllers/projects.ts`, and `constants.ts`
  (`MAX_SELECTED_PROJECTS`) by `@/server/controllers/runs.ts`. Keep both dependency-free apart from
  zod: the browser imports them too, so a stray server import there breaks hydration.
- Every project write invalidates the **router**, not a query key — the sidebar's unread and
  failing counts come from the root loader, not from React Query.
- `ProjectHeader` uses react-hook-form's `values` rather than `defaultValues`: the route component
  is not remounted when the `$projectId` param changes, so the inputs must re-sync.
- Deleting a project is a soft delete: `archiveProject` stamps `projects.archivedAt` and
  `listProjects` filters on it. Nothing under the project is ever removed — a real `DELETE` cascades
  into `listings`, which rule 4 keeps exportable forever. There is no unarchive UI, and `getProject`
  is deliberately unfiltered, so a direct `/projects/:id` URL still opens an archived one.
- `ProjectHeader`'s delete trigger needs `type="button"`: the whole card is one `<form>`, and a
  shadcn `Button` has no default type, so without it opening the dialog submits the name field.
- `AppSidebar` is named around the `Sidebar` primitive it imports from `@/components/ui/sidebar`,
  not the other way round. The `--sidebar-*` tokens it renders against are hand-written in
  `src/styles.css` — see `src/components/ui/README.md`.
- `description` is nullable in SQLite but the forms write `''`, so every reader needs `?? ''`. The
  zod schema deliberately has no `.transform()` to fold one into the other: that would split the
  resolver's output type from the form's input type.
