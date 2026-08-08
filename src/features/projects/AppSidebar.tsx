import { Link, useMatchRoute } from '@tanstack/react-router'
import { TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import { NewProjectDialog } from './NewProjectDialog'
import type { ProjectSummary } from './types'

export function AppSidebar({ projects }: { projects: Array<ProjectSummary> }) {
  const matchRoute = useMatchRoute()

  return (
    // Not collapsible="icon": the menu items are text-only, so a project would collapse to nothing.
    <Sidebar>
      <SidebarHeader className="flex-row items-center justify-between gap-2 pl-4">
        <Link to="/" className="text-lg font-semibold tracking-tight">
          Estate Tracker
        </Link>
        <NewProjectDialog />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          {projects.length === 0 ? (
            <p className="px-2 text-sm text-muted-foreground">
              No projects yet
            </p>
          ) : (
            <SidebarMenu>
              {projects.map((project) => (
                <SidebarMenuItem key={project.id}>
                  <SidebarMenuButton
                    asChild
                    isActive={
                      !!matchRoute({
                        to: '/projects/$projectId',
                        params: { projectId: String(project.id) },
                      })
                    }
                  >
                    <Link
                      to="/projects/$projectId"
                      params={{ projectId: String(project.id) }}
                    >
                      <span className="truncate">{project.name}</span>
                      <span className="ml-auto flex shrink-0 items-center gap-1.5">
                        {project.failing > 0 && (
                          <TriangleAlert
                            className="size-3.5 text-amber-500"
                            aria-label={`${project.failing} failing ${project.failing === 1 ? 'link' : 'links'}`}
                          />
                        )}
                        {project.unread > 0 && <Badge>{project.unread}</Badge>}
                      </span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          )}
        </SidebarGroup>
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  )
}
