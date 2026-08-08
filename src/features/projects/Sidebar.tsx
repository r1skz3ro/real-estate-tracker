import { Link } from '@tanstack/react-router'
import { TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { ProjectSummary } from './types'

export function Sidebar({ projects }: { projects: Array<ProjectSummary> }) {
  return (
    <aside className="w-64 shrink-0 border-r border-border bg-card p-4">
      <Link to="/" className="block px-2 text-lg font-semibold tracking-tight">
        Estate Tracker
      </Link>
      {projects.length === 0 ? (
        <p className="mt-6 px-2 text-sm text-muted-foreground">
          No projects yet
        </p>
      ) : (
        <nav className="mt-6 space-y-0.5">
          {projects.map((project) => (
            <Link
              key={project.id}
              to="/projects/$projectId"
              params={{ projectId: String(project.id) }}
              activeProps={{
                className: 'bg-accent text-accent-foreground font-medium',
              }}
              className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
            >
              <span className="truncate">{project.name}</span>
              <span className="flex shrink-0 items-center gap-1.5">
                {project.failing > 0 && (
                  <TriangleAlert
                    className="size-3.5 text-amber-500"
                    aria-label={`${project.failing} failing ${project.failing === 1 ? 'link' : 'links'}`}
                  />
                )}
                {project.unread > 0 && <Badge>{project.unread}</Badge>}
              </span>
            </Link>
          ))}
        </nav>
      )}
    </aside>
  )
}
