import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { useMutation } from '@tanstack/react-query'
import {
  Link,
  createFileRoute,
  useLoaderData,
  useRouter,
} from '@tanstack/react-router'
import { createProjectFn, createProjectSchema } from '../server/projects'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { z } from 'zod'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  const router = useRouter()
  // The root loader already fetched these for the sidebar — no second request.
  const projects = useLoaderData({ from: '__root__' })

  const form = useForm<z.infer<typeof createProjectSchema>>({
    resolver: standardSchemaResolver(createProjectSchema),
    defaultValues: { name: '' },
  })

  const create = useMutation({
    mutationFn: createProjectFn,
    onSuccess: async (project) => {
      form.reset()
      await router.invalidate()
      await router.navigate({
        to: '/projects/$projectId',
        params: { projectId: String(project.id) },
      })
    },
  })

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>

      {projects.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Create your first project below — a project is a set of saved search
          URLs refreshed together.
        </p>
      ) : (
        <Card className="mt-4 gap-0 py-0">
          <ul className="divide-y divide-border">
            {projects.map((project) => (
              <li key={project.id}>
                <Link
                  to="/projects/$projectId"
                  params={{ projectId: String(project.id) }}
                  className="block px-4 py-3 font-medium transition-colors hover:bg-accent/50"
                >
                  {project.name}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

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
    </div>
  )
}
