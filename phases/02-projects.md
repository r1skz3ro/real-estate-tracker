# Phase 02 — Projects

**Goal:** create, rename, delete projects; set each project's two daily refresh times.

## Server functions (`src/server/projects.ts`)

TanStack Start server functions, zod-validated:

```ts
export const listProjectsFn = createServerFn({ method: 'GET' }).handler(...)
export const createProjectFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ name: z.string().min(1).max(80) }))
  .handler(({ data }) => createProject(data))
export const updateProjectFn = ... // name, runAt1, runAt2
export const deleteProjectFn = ...
```

> API note: recent TanStack Start renamed `.validator()` → `.inputValidator()`. Check the installed
> package's types rather than trusting either this doc or older tutorials.

Validate times with `/^([01]\d|2[0-3]):[0-5]\d$/`. Reject a project whose two times are equal — it
would silently halve the schedule.

## Routes

- `src/routes/index.tsx` — project list. Empty state: "No projects yet" + create form.
- `src/routes/projects.$projectId.tsx` — project detail. This phase: header with editable name, the
  two time inputs, delete button. Links and findings arrive in phases 03 and 08.

Load through the route `loader` so data is server-rendered, and use TanStack Query for
mutations + invalidation. One pattern, applied consistently.

## Schedule inputs

Two `<input type="time">`. Native — the browser already ships a time picker, do not install one.
Label them plainly: "Refresh at" / "and at", with a note that times are Europe/Warsaw.

Saving is an explicit form submit, not on-change; auto-saving a half-typed time is a bad idea.

## Sidebar

The `__root.tsx` sidebar lists projects with their unread count (already returned by
`listProjects()`). The count renders as a badge; it stays 0 until phase 07 produces events.

## Delete

Confirm before deleting — cascade removes all links, runs, listings and events. A native
`confirm()` is sufficient for a single-user local tool.

## Done when

- Create three projects; they appear in the sidebar and survive a server restart.
- Rename one, set its times to 07:30 / 19:30, reload — values persisted.
- Setting both times to the same value shows a validation error.
- Delete a project; it disappears and the DB has no orphaned rows.
