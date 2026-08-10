import { Link as RouterLink, createFileRoute } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { LinkPage } from '@/features/links/LinkPage'
import { getLinkFn } from '@/server/controllers/links'
import { getProjectFn } from '@/server/controllers/projects'
import type { ErrorComponentProps } from '@tanstack/react-router'

// `$projectId_` opts this route out of nesting under projects.$projectId.tsx: the path still reads
// /projects/1/links/2, but the project page stays a leaf and needs no Outlet.
export const Route = createFileRoute('/projects/$projectId_/links/$linkId')({
  loader: async ({ params }) => {
    const [{ link, stats }, project] = await Promise.all([
      getLinkFn({ data: Number(params.linkId) }),
      getProjectFn({ data: Number(params.projectId) }),
    ])
    return { link, stats, project }
  },
  errorComponent: LinkError,
  component: LinkDetail,
})

function LinkDetail() {
  const { link, stats, project } = Route.useLoaderData()
  return <LinkPage link={link} stats={stats} projectName={project.name} />
}

function LinkError({ error, reset }: ErrorComponentProps) {
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Could not load this link</CardTitle>
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
