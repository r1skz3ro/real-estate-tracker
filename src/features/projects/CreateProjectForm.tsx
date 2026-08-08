import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createProjectSchema } from './schema'
import { useCreateProject } from './useProjects'
import type { z } from 'zod'

export function CreateProjectForm() {
  const form = useForm<z.infer<typeof createProjectSchema>>({
    resolver: standardSchemaResolver(createProjectSchema),
    defaultValues: { name: '' },
  })
  const create = useCreateProject()

  return (
    <>
      <form
        className="mt-6 flex gap-2"
        onSubmit={form.handleSubmit((data) => create.mutate({ data }))}
      >
        <Input
          {...form.register('name', { setValueAs: (v: string) => v.trim() })}
          placeholder="New project name"
          maxLength={80}
        />
        <Button type="submit" disabled={create.isPending}>
          Create
        </Button>
      </form>
      {(form.formState.errors.name ?? create.error) && (
        <p className="mt-2 text-sm text-destructive">
          {form.formState.errors.name?.message ?? create.error?.message}
        </p>
      )}
    </>
  )
}
