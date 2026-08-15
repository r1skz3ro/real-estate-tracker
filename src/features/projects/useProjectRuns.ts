import { useEffect, useMemo, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { activeRunsFn, startRunsFn } from '@/server/controllers/runs'
import type { ProjectRun } from './types'

const POLL_MS = 1500
const IDLE_MS = 5000

// Not features/runs' useRun: that one holds a run id in component state, so it only follows the run
// it started. The sidebar has to show every project at once, including runs it did not start.
export function useProjectRuns() {
  const router = useRouter()
  const queryClient = useQueryClient()

  const active = useQuery({
    queryKey: ['project-runs'],
    queryFn: () => activeRunsFn(),
    // ponytail: keeps polling when idle so the sidebar lights up for a refresh started elsewhere
    // (a project page, a new link's baseline). One grouped count against a local SQLite file, and
    // React Query pauses it on a hidden tab. Gate it on an explicit flag only if it ever costs.
    refetchInterval: ({ state }) => (state.data?.length ? POLL_MS : IDLE_MS),
  })

  const start = useMutation({
    mutationFn: startRunsFn,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['project-runs'] }),
  })

  const runs = active.data
  const running = (runs?.length ?? 0) > 0

  // Only on the running → idle edge: a plain `!running` would invalidate on first paint. The runs
  // rewrote every touched link's status and lastRunAt (loader data) and dropped events into each
  // project's timeline (query data), so both planes need pulling back through.
  const wasRunning = useRef(false)
  useEffect(() => {
    if (running) {
      wasRunning.current = true
      return
    }
    if (!wasRunning.current) return
    wasRunning.current = false
    void router.invalidate()
    void queryClient.invalidateQueries({ queryKey: ['findings'] })
  }, [running, router, queryClient])

  return {
    running,
    starting: start.isPending,
    start: (projectIds: Array<number>) => start.mutate({ data: projectIds }),
    byProjectId: useMemo(
      () =>
        new Map<number, ProjectRun>(runs?.map((r) => [r.projectId, r]) ?? []),
      [runs],
    ),
  }
}
