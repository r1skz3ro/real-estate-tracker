import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { useMutation } from '@tanstack/react-query'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { X } from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
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
  pending: 'bg-muted-foreground/40',
  ok: 'bg-emerald-500',
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
    <div className="max-w-2xl space-y-6">
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

          <CardContent className="mt-2 space-y-2">
            <div className="flex items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="runAt1">Refresh at</Label>
                <Input
                  id="runAt1"
                  type="time"
                  {...form.register('runAt1')}
                  className="w-auto tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="runAt2">and at</Label>
                <Input
                  id="runAt2"
                  type="time"
                  {...form.register('runAt2')}
                  className="w-auto tabular-nums"
                />
              </div>
            </div>
            {(errors.runAt1 ?? errors.runAt2) && (
              <p className="text-sm text-destructive">
                {errors.runAt1?.message ?? errors.runAt2?.message}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              Times are Europe/Warsaw.
            </p>
          </CardContent>

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

      <Card>
        <CardHeader>
          <CardTitle>Search links</CardTitle>
          <CardDescription>
            {links.length} of {MAX_LINKS} saved searches.
          </CardDescription>
        </CardHeader>

        {links.length > 0 && (
          <ul className="divide-y divide-border border-y border-border">
            {links.map((link) => (
              <li
                key={link.id}
                className="flex items-center gap-2 px-4 py-2 transition-colors hover:bg-accent/30"
              >
                <span
                  title={link.status}
                  className={cn(
                    'size-2 shrink-0 rounded-full',
                    STATUS_DOT[link.status] ?? 'bg-muted-foreground/40',
                  )}
                />
                <Input
                  defaultValue={link.label}
                  aria-label="Link label"
                  maxLength={80}
                  onBlur={(e) => {
                    const label = e.target.value.trim()
                    if (label && label !== link.label)
                      renameLink.mutate({ data: { id: link.id, label } })
                    else e.target.value = link.label
                  }}
                  className="h-7 min-w-0 flex-1 border-transparent bg-transparent px-1.5 text-sm hover:border-input md:text-sm dark:bg-transparent"
                />
                <Badge asChild variant="secondary">
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    title={link.url}
                  >
                    {link.portal}
                  </a>
                </Badge>
                {link.fetchMode === 'browser' && (
                  <Badge variant="outline" className="text-amber-400">
                    browser
                  </Badge>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${link.label}`}
                  disabled={removeLink.isPending}
                  onClick={() => removeLink.mutate({ data: link.id })}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <CardContent className="space-y-2">
          {atCap ? (
            <p className="text-sm text-muted-foreground">
              {MAX_LINKS} of {MAX_LINKS} links — remove one to add another.
            </p>
          ) : (
            <form
              className="flex gap-2"
              onSubmit={linkForm.handleSubmit(({ url }) =>
                addLink.mutate(
                  { data: { projectId: project.id, url } },
                  { onSuccess: () => linkForm.reset() },
                ),
              )}
            >
              <Input
                {...linkForm.register('url', {
                  required: true,
                  setValueAs: (v: string) => v.trim(),
                })}
                type="url"
                placeholder="Paste a search URL from OLX, Otodom, Gratka, Adresowo or Nieruchomosci-Online"
              />
              <Button type="submit" disabled={addLink.isPending}>
                Add
              </Button>
            </form>
          )}
          {addLink.error && (
            <p className="text-sm text-destructive">{addLink.error.message}</p>
          )}
        </CardContent>
      </Card>

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
                    This removes the project, its {links.length} search{' '}
                    {links.length === 1 ? 'link' : 'links'} and all recorded
                    history. This cannot be undone.
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
    </div>
  )
}
