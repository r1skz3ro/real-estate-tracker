import { Link as RouterLink, createFileRoute } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Findings } from '@/features/findings/Findings'
import { LinksCard } from '@/features/links/LinksCard'
import { DangerZone } from '@/features/projects/DangerZone'
import { ProjectHeader } from '@/features/projects/ProjectHeader'
import { useRun } from '@/features/runs/useRun'
import { listLinksFn } from '@/server/controllers/links'
import { getProjectFn } from '@/server/controllers/projects'
import type { ErrorComponentProps } from '@tanstack/react-router'

export const Route = createFileRoute('/projects/$projectId')({
  loader: async ({ params }) => {
    const id = Number(params.projectId)
    const [project, links] = await Promise.all([
      getProjectFn({ data: id }),
      listLinksFn({ data: id }),
    ])
    return { project, links }
  },
  errorComponent: ProjectError,
  component: ProjectDetail,
})

function ProjectDetail() {
  const { project, links } = Route.useLoaderData()
  // Owned here, not inside LinksCard: one run drives both the refresh button and every link row.
  const run = useRun(project.id)

  return (
    <div className="max-w-4xl space-y-6">
      <ProjectHeader project={project} />
      <LinksCard projectId={project.id} links={links} run={run} />
      <Findings projectId={project.id} />
      <DangerZone project={project} linkCount={links.length} />
    </div>
  )
}

function ProjectError({ error, reset }: ErrorComponentProps) {
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Could not load this project</CardTitle>
        <CardDescription>{error.message}</CardDescription>
      </CardHeader>
      <CardFooter className="gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button variant="secondary" asChild>
          <RouterLink to="/">All projects</RouterLink>
        </Button>
      </CardFooter>
    </Card>
  )
}
