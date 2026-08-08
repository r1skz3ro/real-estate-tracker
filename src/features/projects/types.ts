import type {
  getProjectFn,
  listProjectsFn,
} from '@/server/controllers/projects'

// Derived from the server fns rather than from the schema: what the UI gets is the query's shape,
// including the unread/failing counts the sidebar needs, which no table declares. `import type` is
// erased, so pointing at a controller from the client costs nothing at runtime.
export type ProjectSummary = Awaited<ReturnType<typeof listProjectsFn>>[number]
export type Project = Awaited<ReturnType<typeof getProjectFn>>
