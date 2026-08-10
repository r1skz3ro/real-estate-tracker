import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { getRunStatusFn, startRunFn } from '@/server/controllers/runs'
import type { RunLink } from './types'

const POLL_MS = 1500

// A run has no push channel — startRunFn returns immediately with an id and the work continues
// behind the global fetch mutex, so the only way to follow it is to poll until it stops.
export function useRun(projectId: number) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [runId, setRunId] = useState<number | null>(null)

  const start = useMutation({
    mutationFn: startRunFn,
    onSuccess: ({ runId: id }) => setRunId(id),
  })

  const run = useQuery({
    queryKey: ['run', runId],
    queryFn: () => getRunStatusFn({ data: runId ?? 0 }),
    enabled: runId !== null,
    refetchInterval: ({ state }) =>
      state.data?.run.status === 'running' ? POLL_MS : false,
  })

  const running = run.data?.run.status === 'running'

  // The run rewrote every link's status, fetchMode and lastError — pull the loader back through,
  // and drop the run's new section into the timeline without a reload.
  useEffect(() => {
    if (!run.data || running) return
    void router.invalidate()
    void queryClient.invalidateQueries({ queryKey: ['findings', projectId] })
  }, [run.data, running, router, queryClient, projectId])

  const links = run.data?.links
  const byLinkId = useMemo(
    () => new Map<number, RunLink>(links?.map((rl) => [rl.linkId, rl]) ?? []),
    [links],
  )

  return {
    running,
    byLinkId,
    startedAt: run.data?.run.startedAt,
    start: () => start.mutate({ data: { projectId } }),
    starting: start.isPending,
  }
}

export type Run = ReturnType<typeof useRun>
