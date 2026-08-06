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
      <h1 className="text-2xl font-semibold">Projects</h1>

      {projects.length === 0 ? (
        <p className="mt-2 text-slate-600">No projects yet</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-200 rounded border border-slate-200">
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                to="/projects/$projectId"
                params={{ projectId: String(project.id) }}
                className="flex items-center justify-between px-4 py-3 hover:bg-slate-50"
              >
                <span className="font-medium">{project.name}</span>
                <span className="text-sm text-slate-500">
                  {project.runAt1} · {project.runAt2}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <form
        className="mt-6 flex gap-2"
        onSubmit={form.handleSubmit((data) => create.mutate({ data }))}
      >
        <input
          {...form.register('name', { setValueAs: (v: string) => v.trim() })}
          placeholder="New project name"
          maxLength={80}
          className="flex-1 rounded border border-slate-300 px-3 py-2"
        />
        <button
          type="submit"
          disabled={create.isPending}
          className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
        >
          Create
        </button>
      </form>
      {(form.formState.errors.name ?? create.error) && (
        <p className="mt-2 text-sm text-red-600">
          {form.formState.errors.name?.message ?? create.error?.message}
        </p>
      )}
    </div>
  )
}
