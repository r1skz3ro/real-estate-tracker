import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { Button } from '@/components/ui/button'
import { Card, CardFooter, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { updateProjectSchema } from './schema'
import { useUpdateProject } from './useProjects'
import type { Project } from './types'
import type { z } from 'zod'

export function ProjectHeader({ project }: { project: Project }) {
  const form = useForm<z.infer<typeof updateProjectSchema>>({
    resolver: standardSchemaResolver(updateProjectSchema),
    // `values` (not `defaultValues`) so switching project re-syncs the inputs — the route component
    // isn't remounted on a param change.
    values: { id: project.id, name: project.name },
  })
  const save = useUpdateProject()
  const { errors } = form.formState

  return (
    <Card>
      <form onSubmit={form.handleSubmit((data) => save.mutate({ data }))}>
        <CardHeader>
          <Input
            {...form.register('name')}
            maxLength={80}
            aria-label="Project name"
            className="h-auto border-transparent bg-transparent px-2 py-1 text-2xl font-semibold tracking-tight hover:border-input md:text-2xl dark:bg-transparent"
          />
          {errors.name && (
            <p className="px-2 text-sm text-destructive">
              {errors.name.message}
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
