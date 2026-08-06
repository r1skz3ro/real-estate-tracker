import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { useMutation } from '@tanstack/react-query'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import {
  deleteProjectFn,
  getProjectFn,
  updateProjectFn,
  updateProjectSchema,
} from '../server/projects'
import type { z } from 'zod'

export const Route = createFileRoute('/projects/$projectId')({
  loader: ({ params }) => getProjectFn({ data: Number(params.projectId) }),
  component: ProjectDetail,
})

// Mirrors the server's cross-field check so it surfaces inline instead of only after a round trip.
const formSchema = updateProjectSchema.refine((v) => v.runAt1 !== v.runAt2, {
  message: 'Refresh times must differ',
  path: ['runAt2'],
})

function ProjectDetail() {
  const project = Route.useLoaderData()
  const router = useRouter()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: standardSchemaResolver(formSchema),
    // `values` (not `defaultValues`) so switching project re-syncs the inputs — the route component
    // isn't remounted on a param change.
    values: {
      id: project.id,
      name: project.name,
      runAt1: project.runAt1,
      runAt2: project.runAt2,
    },
  })
  const { errors } = form.formState

  const save = useMutation({
    mutationFn: updateProjectFn,
    onSuccess: () => router.invalidate(),
  })

  const remove = useMutation({
    mutationFn: deleteProjectFn,
    onSuccess: async () => {
      await router.invalidate()
      await router.navigate({ to: '/' })
    },
  })

  return (
    <div className="max-w-lg">
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit((data) => save.mutate({ data }))}
      >
        <input
          {...form.register('name')}
          maxLength={80}
          aria-label="Project name"
          className="w-full rounded border border-slate-300 px-3 py-2 text-2xl font-semibold"
        />
        {errors.name && (
          <p className="text-sm text-red-600">{errors.name.message}</p>
        )}

        <div className="flex items-end gap-4">
          <label className="text-sm">
            <span className="block text-slate-600">Refresh at</span>
            <input
              type="time"
              {...form.register('runAt1')}
              className="mt-1 rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="block text-slate-600">and at</span>
            <input
              type="time"
              {...form.register('runAt2')}
              className="mt-1 rounded border border-slate-300 px-3 py-2"
            />
          </label>
        </div>
        {(errors.runAt1 ?? errors.runAt2) && (
          <p className="text-sm text-red-600">
            {errors.runAt1?.message ?? errors.runAt2?.message}
          </p>
        )}
        <p className="text-sm text-slate-500">Times are Europe/Warsaw.</p>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={save.isPending}
            className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
          >
            Save
          </button>
          {save.isSuccess && (
            <span className="text-sm text-green-700">Saved</span>
          )}
          {save.error && (
            <span className="text-sm text-red-600">{save.error.message}</span>
          )}
        </div>
      </form>

      <hr className="my-8 border-slate-200" />

      <button
        type="button"
        disabled={remove.isPending}
        onClick={() => {
          if (
            confirm(`Delete "${project.name}" and all its links and history?`)
          )
            remove.mutate({ data: project.id })
        }}
        className="rounded border border-red-300 px-4 py-2 text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        Delete project
      </button>
    </div>
  )
}
