import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { useMutation } from '@tanstack/react-query'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import {
  MAX_LINKS,
  addLinkFn,
  deleteLinkFn,
  listLinksFn,
  renameLinkFn,
} from '../server/links'
import {
  deleteProjectFn,
  getProjectFn,
  updateProjectFn,
  updateProjectSchema,
} from '../server/projects'
import type { z } from 'zod'

export const Route = createFileRoute('/projects/$projectId')({
  loader: async ({ params }) => {
    const id = Number(params.projectId)
    return {
      project: await getProjectFn({ data: id }),
      links: await listLinksFn({ data: id }),
    }
  },
  component: ProjectDetail,
})

// Grey until phases 07/10 give the dot real meaning.
const STATUS_DOT: Record<string, string> = {
  pending: 'bg-slate-300',
  ok: 'bg-green-500',
  error: 'bg-red-500',
}

// Mirrors the server's cross-field check so it surfaces inline instead of only after a round trip.
const formSchema = updateProjectSchema.refine((v) => v.runAt1 !== v.runAt2, {
  message: 'Refresh times must differ',
  path: ['runAt2'],
})

function ProjectDetail() {
  const { project, links } = Route.useLoaderData()
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

  // No resolver: every rule that matters (portal, https, cap, duplicate) is enforced server-side,
  // so the server's message is the one worth showing.
  const linkForm = useForm<{ url: string }>({ defaultValues: { url: '' } })
  const invalidate = { onSuccess: () => router.invalidate() }
  const addLink = useMutation({ mutationFn: addLinkFn, ...invalidate })
  const renameLink = useMutation({ mutationFn: renameLinkFn, ...invalidate })
  const removeLink = useMutation({ mutationFn: deleteLinkFn, ...invalidate })
  const atCap = links.length >= MAX_LINKS

  const remove = useMutation({
    mutationFn: deleteProjectFn,
    onSuccess: async () => {
      await router.invalidate()
      await router.navigate({ to: '/' })
    },
  })

  return (
    <div className="max-w-2xl">
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

      <h2 className="font-semibold">Search links</h2>

      {links.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-200 rounded border border-slate-200">
          {links.map((link) => (
            <li key={link.id} className="flex items-center gap-2 px-3 py-2">
              <span
                title={link.status}
                className={`size-2 shrink-0 rounded-full ${STATUS_DOT[link.status] ?? 'bg-slate-300'}`}
              />
              <input
                defaultValue={link.label}
                aria-label="Link label"
                maxLength={80}
                onBlur={(e) => {
                  const label = e.target.value.trim()
                  if (label && label !== link.label)
                    renameLink.mutate({ data: { id: link.id, label } })
                  else e.target.value = link.label
                }}
                className="min-w-0 flex-1 rounded border border-transparent px-1 py-0.5 hover:border-slate-300 focus:border-slate-400 focus:outline-none"
              />
              <a
                href={link.url}
                target="_blank"
                rel="noreferrer"
                title={link.url}
                className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-200"
              >
                {link.portal}
              </a>
              {link.fetchMode === 'browser' && (
                <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                  browser
                </span>
              )}
              <button
                type="button"
                aria-label={`Remove ${link.label}`}
                disabled={removeLink.isPending}
                onClick={() => removeLink.mutate({ data: link.id })}
                className="px-1 text-slate-400 hover:text-red-600 disabled:opacity-50"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {atCap ? (
        <p className="mt-3 text-sm text-slate-600">
          {MAX_LINKS} of {MAX_LINKS} links — remove one to add another.
        </p>
      ) : (
        <form
          className="mt-3 flex gap-2"
          onSubmit={linkForm.handleSubmit(({ url }) =>
            addLink.mutate(
              { data: { projectId: project.id, url } },
              { onSuccess: () => linkForm.reset() },
            ),
          )}
        >
          <input
            {...linkForm.register('url', {
              required: true,
              setValueAs: (v: string) => v.trim(),
            })}
            type="url"
            placeholder="Paste a search URL from OLX, Otodom, Gratka, Adresowo or Nieruchomosci-Online"
            className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-2"
          />
          <button
            type="submit"
            disabled={addLink.isPending}
            className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
          >
            Add
          </button>
        </form>
      )}
      {addLink.error && (
        <p className="mt-2 text-sm text-red-600">{addLink.error.message}</p>
      )}

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
