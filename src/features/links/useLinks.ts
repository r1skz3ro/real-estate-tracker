import { useMutation } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import {
  addLinkFn,
  deleteLinkFn,
  renameLinkFn,
} from '@/server/controllers/links'

// Links come from the route loader, so a write invalidates the router rather than a query key.
export function useAddLink() {
  const router = useRouter()
  return useMutation({
    mutationFn: addLinkFn,
    onSuccess: () => router.invalidate(),
  })
}

export function useRenameLink() {
  const router = useRouter()
  return useMutation({
    mutationFn: renameLinkFn,
    onSuccess: () => router.invalidate(),
  })
}

export function useDeleteLink() {
  const router = useRouter()
  return useMutation({
    mutationFn: deleteLinkFn,
    onSuccess: () => router.invalidate(),
  })
}
