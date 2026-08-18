import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { Trash2 } from 'lucide-react'
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
import { Card, CardFooter, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { updateProjectSchema } from './schema'
import { useDeleteProject, useUpdateProject } from './useProjects'
import type { Project } from './types'
import type { z } from 'zod'

export function ProjectHeader({
  project,
  linkCount,
}: {
  project: Project
  linkCount: number
}) {
  const form = useForm<z.infer<typeof updateProjectSchema>>({
    resolver: standardSchemaResolver(updateProjectSchema),
    // `values` (not `defaultValues`) so switching project re-syncs the inputs — the route component
    // isn't remounted on a param change.
    values: {
      id: project.id,
      name: project.name,
      description: project.description ?? '',
    },
  })
  const save = useUpdateProject()
  const remove = useDeleteProject()
  const { errors } = form.formState

  // Same reason as `values` above: without a remount, the previous project's "Saved" flash and
  // error would still be on screen after switching.
  const { reset } = save
  useEffect(() => reset(), [project.id, reset])

  return (
    <Card>
      <form onSubmit={form.handleSubmit((data) => save.mutate({ data }))}>
        <CardHeader>
          <Input
            {...form.register('name')}
            maxLength={80}
            aria-label="Project name"
            className="h-auto border-transparent bg-transparent! px-2 py-1 text-2xl font-semibold tracking-tight hover:border-input md:text-2xl"
          />
          {errors.name && (
            <p className="px-2 text-sm text-destructive">
              {errors.name.message}
            </p>
          )}
          <Textarea
            {...form.register('description', {
              setValueAs: (v: string) => v.trim(),
            })}
            maxLength={500}
            rows={3}
            aria-label="Project description"
            placeholder="What is this project tracking?"
            className="min-h-0 border-transparent bg-transparent! px-2 py-1 text-muted-foreground hover:border-input"
          />
          {errors.description && (
            <p className="px-2 text-sm text-destructive">
              {errors.description.message}
            </p>
          )}
        </CardHeader>

        <CardFooter className="gap-3">
          <Button type="submit" disabled={save.isPending}>
            Save
          </Button>
          {save.isSuccess && (
            <span className="text-sm text-emerald-400">Saved</span>
          )}
          {save.error && (
            <span className="text-sm text-destructive">
              {save.error.message}
            </span>
          )}

          <AlertDialog>
            <AlertDialogTrigger asChild>
              {/* type="button": inside the form, a trigger without it submits the name field. */}
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="ml-auto"
                disabled={remove.isPending}
              >
                <Trash2 />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete “{project.name}”?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes the project and its {linkCount} search{' '}
                  {linkCount === 1 ? 'link' : 'links'} from the app. The
                  recorded listings and history stay in the database.
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
        </CardFooter>
      </form>
    </Card>
  )
}
