import { useState } from 'react'
import { Link, useMatchRoute } from '@tanstack/react-router'
import { Check } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { RefreshButton } from '@/features/runs/RefreshButton'
import { cn } from '@/lib/utils'
import { MAX_SELECTED_PROJECTS } from './constants'
import { NewProjectDialog } from './NewProjectDialog'
import { projectState } from './projectState'
import { useProjectRuns } from './useProjectRuns'
import type { ProjectRun, ProjectSummary } from './types'

export function AppSidebar({ projects }: { projects: Array<ProjectSummary> }) {
  const { running, starting, start, byProjectId } = useProjectRuns()
  // One value, not a boolean plus a set: null is "selection mode off".
  const [selected, setSelected] = useState<Set<number> | null>(null)

  const toggle = (id: number) =>
    setSelected((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })

  return (
    // Not collapsible="icon": the menu items are text-only, so a project would collapse to nothing.
    <Sidebar>
      <SidebarHeader className="gap-2 pl-4">
        <div className="flex flex-row items-center justify-between gap-2">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            Estate Tracker
          </Link>
          <NewProjectDialog />
        </div>

        {projects.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pr-2">
            {selected ? (
              <>
                <RefreshButton
                  size="sm"
                  label={`Refresh selected (${selected.size})`}
                  running={running}
                  starting={starting}
                  disabled={selected.size === 0}
                  start={() => {
                    start([...selected])
                    setSelected(null)
                  }}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelected(null)}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelected(new Set())}
              >
                Select projects
              </Button>
            )}
          </div>
        )}
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
                <ProjectRow
                  key={project.id}
                  project={project}
                  run={byProjectId.get(project.id)}
                  selected={selected?.has(project.id) ?? null}
                  atCap={(selected?.size ?? 0) >= MAX_SELECTED_PROJECTS}
                  toggle={() => toggle(project.id)}
                />
              ))}
            </SidebarMenu>
          )}
        </SidebarGroup>
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  )
}

// `selected` is null outside selection mode — the row is a link then, and a toggle otherwise.
function ProjectRow({
  project,
  run,
  selected,
  atCap,
  toggle,
}: {
  project: ProjectSummary
  run: ProjectRun | undefined
  selected: boolean | null
  atCap: boolean
  toggle: () => void
}) {
  const matchRoute = useMatchRoute()
  const { dot, text, tone } = projectState(project, run)

  const body = (
    <>
      {selected !== null && (
        <span
          className={cn(
            'flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input',
            selected && 'border-primary bg-primary text-primary-foreground',
          )}
        >
          {/* `!`: the button's own [&_svg]:size-4 outranks a plain size-3 on the icon. */}
          {selected && <Check className="size-3!" />}
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="truncate">{project.name}</span>
          {project.unread > 0 && (
            <Badge className="ml-auto shrink-0">{project.unread}</Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className={cn('size-2 shrink-0 rounded-full', dot)} />
          <span
            className={cn(
              'truncate text-xs tabular-nums',
              tone === 'amber' ? 'text-amber-400' : 'text-muted-foreground',
            )}
          >
            {text}
          </span>
        </div>
      </div>
    </>
  )

  return (
    <SidebarMenuItem>
      {selected === null ? (
        <SidebarMenuButton
          asChild
          // h-auto: every size variant is a fixed height, and these rows are two lines.
          className="h-auto"
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
            {body}
          </Link>
        </SidebarMenuButton>
      ) : (
        <SidebarMenuButton
          className="h-auto"
          aria-pressed={selected}
          disabled={!selected && atCap}
          onClick={toggle}
        >
          {body}
        </SidebarMenuButton>
      )}
    </SidebarMenuItem>
  )
}
