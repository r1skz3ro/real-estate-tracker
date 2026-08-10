import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import {
  addLinkFn,
  deleteLinkFn,
  updateLinkFn,
} from '@/server/controllers/links'

// Links come from the route loader, so a write invalidates the router rather than a query key.
export function useAddLink() {
  const router = useRouter()
  return useMutation({
    mutationFn: addLinkFn,
    onSuccess: () => router.invalidate(),
  })
}

// Also drops the link page's own queries: a changed URL archives the listings and clears the
// baseline, so the cached listings and counts are stale the moment this returns.
export function useUpdateLink() {
  const router = useRouter()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: updateLinkFn,
    onSuccess: async (link) => {
      await queryClient.invalidateQueries({ queryKey: ['link', link.id] })
      await router.invalidate()
    },
  })
}

export function useDeleteLink() {
  const router = useRouter()
  return useMutation({
    mutationFn: deleteLinkFn,
    onSuccess: () => router.invalidate(),
  })
}
