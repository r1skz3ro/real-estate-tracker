import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useDeleteProject } from './useProjects'
import type { Project } from './types'

export function DangerZone({
  project,
  linkCount,
}: {
  project: Project
  linkCount: number
}) {
  const remove = useDeleteProject()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Danger zone</CardTitle>
        <CardDescription>
          Deleting a project removes its links and all history.
        </CardDescription>
        <CardAction>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={remove.isPending}>
                Delete project
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete “{project.name}”?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes the project, its {linkCount} search{' '}
                  {linkCount === 1 ? 'link' : 'links'} and all recorded history.
                  This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() => remove.mutate({ data: project.id })}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardAction>
      </CardHeader>
    </Card>
  )
}
