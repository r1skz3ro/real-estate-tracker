import { createFileRoute, useLoaderData } from '@tanstack/react-router'
import { CreateProjectForm } from '@/features/projects/CreateProjectForm'
import { ProjectList } from '@/features/projects/ProjectList'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  // The root loader already fetched these for the sidebar — no second request.
  const projects = useLoaderData({ from: '__root__' })

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
      <ProjectList projects={projects} />
      <CreateProjectForm />
    </div>
  )
}
