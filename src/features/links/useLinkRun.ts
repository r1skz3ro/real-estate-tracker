import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { linkRunsFn } from '@/server/controllers/links'
import { startRunFn } from '@/server/controllers/runs'
import type { Link, LinkRun } from './types'

const POLL_MS = 1500

const inFlight = (runs: Array<LinkRun> | undefined) =>
  runs?.[0]?.status === 'pending' || runs?.[0]?.status === 'running'

// Deliberately not `features/runs`' useRun. That one keeps the run id in component state, so it can
// only follow a run it started itself — and the two runs this page cares about most are ones it did
// not: the baseline a new link fires on itself, and a project-wide refresh that includes this link.
// Polling the link's own history instead needs no id, survives a reload, and makes the fetch history
// and the live progress the same data.
export function useLinkRun(link: Link) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const key = ['link', link.id, 'runs']

  const history = useQuery({
    queryKey: key,
    queryFn: () => linkRunsFn({ data: { linkId: link.id } }),
    refetchInterval: ({ state }) =>
      inFlight(state.data?.runs) ? POLL_MS : false,
  })

  const start = useMutation({
    mutationFn: startRunFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  })

  const running = inFlight(history.data?.runs)

  // The run rewrote this link's listings, status and counts. Only fire on the running → idle edge:
  // a plain `!running` would invalidate on first paint of a link that has never run.
  const wasRunning = useRef(false)
  useEffect(() => {
    if (running) {
      wasRunning.current = true
      return
    }
    if (!wasRunning.current) return
    wasRunning.current = false
    void queryClient.invalidateQueries({ queryKey: ['link', link.id] })
    void router.invalidate()
  }, [running, queryClient, router, link.id])

  return {
    running,
    starting: start.isPending,
    start: () =>
      start.mutate({ data: { projectId: link.projectId, linkId: link.id } }),
    runs: history.data?.runs ?? [],
    hasMore: history.data?.hasMore ?? false,
    isLoading: history.isLoading,
    error: history.error,
  }
}

export type LinkRunPlane = ReturnType<typeof useLinkRun>
