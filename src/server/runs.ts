import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getRunStatus } from '#/db/queries'
import { startRun } from './run'

// Returns immediately with the run id; the work continues in the background. A second click while
// a run is in flight gets that run's id back rather than starting another.
export const startRunFn = createServerFn({ method: 'POST' })
  .validator(z.number().int())
  .handler(({ data }) => ({ runId: startRun(data).runId }))

export const getRunStatusFn = createServerFn({ method: 'GET' })
  .validator(z.number().int())
  .handler(({ data }) => getRunStatus(data))
