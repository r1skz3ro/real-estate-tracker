import { useState } from 'react'
import { Link, useMatchRoute } from '@tanstack/react-router'
import { DragDropProvider } from '@dnd-kit/react'
import { useSortable } from '@dnd-kit/react/sortable'
import { move } from '@dnd-kit/helpers'
import { Check, GripVertical } from 'lucide-react'
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
import { useProjectOrder } from './useProjectOrder'
import { useProjectRuns } from './useProjectRuns'
import type { ProjectRun, ProjectSummary } from './types'

export function AppSidebar({ projects }: { projects: Array<ProjectSummary> }) {
  const { running, starting, start, byProjectId } = useProjectRuns()
  const { ordered, reorder } = useProjectOrder(projects)
  // One value, not a boolean plus a set: null is "selection mode off".
  const [selected, setSelected] = useState<Set<number> | null>(null)

  const toggle = (id: number) =>
    setSelected((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })

  return (
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
            <DragDropProvider
              onDragOver={(event) =>
                reorder(
                  move(
                    ordered.map((p) => p.id),
                    event,
                  ),
                )
              }
            >
              <SidebarMenu>
                {ordered.map((project, index) => (
                  <ProjectRow
                    key={project.id}
                    project={project}
                    index={index}
                    run={byProjectId.get(project.id)}
                    selected={selected?.has(project.id) ?? null}
                    atCap={(selected?.size ?? 0) >= MAX_SELECTED_PROJECTS}
                    toggle={() => toggle(project.id)}
                  />
                ))}
              </SidebarMenu>
            </DragDropProvider>
          )}
        </SidebarGroup>
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  )
}

function ProjectRow({
  project,
  index,
  run,
  selected,
  atCap,
  toggle,
}: {
  project: ProjectSummary
  index: number
  run: ProjectRun | undefined
  selected: boolean | null
  atCap: boolean
  toggle: () => void
}) {
  const matchRoute = useMatchRoute()
  const { dot, text, tone } = projectState(project, run)
  // Disabled in selection mode, not just handle-less: without a handle element the whole row
  // becomes the drag activator, and that gesture would fight the checkbox.
  const { ref, handleRef, isDragging } = useSortable({
    id: project.id,
    index,
    disabled: selected !== null,
  })

  const body = (
    <>
      {selected !== null && (
        <span
          className={cn(
            'flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input',
            selected && 'border-primary bg-primary text-primary-foreground',
          )}
        >
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
    <SidebarMenuItem ref={ref} className={cn(isDragging && 'opacity-50')}>
      {selected === null && (
        <button
          ref={handleRef}
          type="button"
          aria-label={`Reorder ${project.name}`}
          className="absolute top-1/2 left-0 flex size-6 -translate-y-1/2 cursor-grab items-center justify-center text-muted-foreground opacity-0 group-hover/menu-item:opacity-100 focus-visible:opacity-100"
        >
          <GripVertical className="size-3.5" />
        </button>
      )}
      {selected === null ? (
        <SidebarMenuButton
          asChild
          className="h-auto pl-6"
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
