import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { MAX_SELECTED_PROJECTS } from '@/features/projects/constants'
import { activeRuns, getRunStatus } from '@/server/models/queries'
import { startRun } from '@/server/services/runs'

// Returns immediately with the run id; the work continues in the background. A second click while
// a run is in flight gets that run's id back rather than starting another. `linkId` narrows the run
// to one link — the link page's own refresh.
export const startRunFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      projectId: z.number().int(),
      linkId: z.number().int().optional(),
    }),
  )
  .handler(({ data: { projectId, linkId } }) => ({
    runId: startRun(projectId, linkId).runId,
  }))

export const getRunStatusFn = createServerFn({ method: 'GET' })
  .validator(z.number().int())
  .handler(({ data }) => getRunStatus(data))

// No batching layer on purpose: every run's work goes through the process-global fetch mutex, so
// starting several here queues them — projects run one after another, links inside one already do.
export const startRunsFn = createServerFn({ method: 'POST' })
  .validator(z.array(z.number().int()).min(1).max(MAX_SELECTED_PROJECTS))
  .handler(({ data }) => data.map((projectId) => startRun(projectId).runId))

export const activeRunsFn = createServerFn({ method: 'GET' }).handler(() =>
  activeRuns(),
)
