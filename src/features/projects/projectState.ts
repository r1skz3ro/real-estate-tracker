import { fmtWhen } from '@/lib/format'
import type { ProjectRun, ProjectSummary } from './types'

export type ProjectState = {
  dot: string
  text: string
  tone: 'amber' | null
}

// The sidebar's one-line answer to "what is this project doing". The live run wins over the stored
// counts: a refresh in flight has already made `failing` and `lastRunAt` stale.
export function projectState(
  project: ProjectSummary,
  run: ProjectRun | undefined,
): ProjectState {
  // Every run row is created up front, so a selected project sits at 'queued' until the global
  // fetch mutex reaches it — only a running link means this project is the one on the wire.
  if (run)
    return run.fetching > 0
      ? {
          dot: 'bg-amber-400 animate-pulse',
          text: `fetching ${run.done + 1}/${run.total}`,
          tone: null,
        }
      : { dot: 'bg-muted-foreground/40', text: 'queued', tone: null }

  // Amber, not red: which link broke and how badly is the project page's job — from the nav this
  // is only "something in here needs a look".
  if (project.failing > 0)
    return {
      dot: 'bg-amber-500',
      text: `${project.failing} ${project.failing === 1 ? 'link' : 'links'} failing`,
      tone: 'amber',
    }

  if (!project.lastRunAt)
    return { dot: 'bg-muted-foreground/40', text: 'never checked', tone: null }

  return {
    dot: 'bg-emerald-500',
    text: `checked ${fmtWhen(project.lastRunAt)}`,
    tone: null,
  }
}
