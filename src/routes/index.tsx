import { createFileRoute, useLoaderData } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  // The root loader already fetched these for the sidebar — no second request.
  const projects = useLoaderData({ from: '__root__' })

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {projects.length === 0
          ? 'No projects yet — create one with + in the sidebar. A project is a set of saved search URLs refreshed together.'
          : 'Select a project from the sidebar.'}
      </p>
    </div>
  )
}
