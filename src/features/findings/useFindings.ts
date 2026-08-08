import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import {
  listFindingsFn,
  markAllReadFn,
  markReadFn,
} from '@/server/controllers/findings'

const PAGE = 20

export function useFindings(projectId: number) {
  const [limit, setLimit] = useState(PAGE)

  const query = useQuery({
    queryKey: ['findings', projectId, limit],
    queryFn: () => listFindingsFn({ data: { projectId, limit } }),
  })

  return { query, loadMore: () => setLimit((l) => l + PAGE) }
}

// The sidebar badge comes from the root loader, not this query — both have to be refreshed.
function useMarkRead(projectId: number) {
  const router = useRouter()
  const queryClient = useQueryClient()
  return {
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['findings', projectId] })
      await router.invalidate()
    },
  }
}

export function useMarkRunRead(projectId: number) {
  return useMutation({ mutationFn: markReadFn, ...useMarkRead(projectId) })
}

export function useMarkProjectRead(projectId: number) {
  return useMutation({ mutationFn: markAllReadFn, ...useMarkRead(projectId) })
}
