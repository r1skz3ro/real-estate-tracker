import { useMutation } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import {
  createProjectFn,
  deleteProjectFn,
  updateProjectFn,
} from '@/server/controllers/projects'

// Every project write changes the sidebar, which is fed by the root loader — so each one ends in
// router.invalidate(), not a query-cache update.
export function useCreateProject() {
  const router = useRouter()
  return useMutation({
    mutationFn: createProjectFn,
    onSuccess: async (project) => {
      await router.invalidate()
      await router.navigate({
        to: '/projects/$projectId',
        params: { projectId: String(project.id) },
      })
    },
  })
}

export function useUpdateProject() {
  const router = useRouter()
  return useMutation({
    mutationFn: updateProjectFn,
    onSuccess: () => router.invalidate(),
  })
}

export function useDeleteProject() {
  const router = useRouter()
  return useMutation({
    mutationFn: deleteProjectFn,
    onSuccess: async () => {
      await router.invalidate()
      await router.navigate({ to: '/' })
    },
  })
}
