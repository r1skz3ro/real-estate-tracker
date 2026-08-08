import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { Button } from '@/components/ui/button'
import { Card, CardFooter, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { updateProjectSchema } from './schema'
import { useUpdateProject } from './useProjects'
import type { Project } from './types'
import type { z } from 'zod'

export function ProjectHeader({ project }: { project: Project }) {
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
        </CardFooter>
      </form>
    </Card>
  )
}
