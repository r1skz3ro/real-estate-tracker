import { Link } from '@tanstack/react-router'
import { Card } from '@/components/ui/card'
import type { ProjectSummary } from './types'

export function ProjectList({ projects }: { projects: Array<ProjectSummary> }) {
  if (projects.length === 0)
    return (
      <p className="mt-2 text-sm text-muted-foreground">
        Create your first project below — a project is a set of saved search
        URLs refreshed together.
      </p>
    )

  return (
    <Card className="mt-4 gap-0 py-0">
      <ul className="divide-y divide-border">
        {projects.map((project) => (
          <li key={project.id}>
            <Link
              to="/projects/$projectId"
              params={{ projectId: String(project.id) }}
              className="block px-4 py-3 font-medium transition-colors hover:bg-accent/50"
            >
              {project.name}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}
