import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Link as RouterLink,
  createFileRoute,
  useRouter,
} from '@tanstack/react-router'
import { RefreshCw, X } from 'lucide-react'
import {
  MAX_LINKS,
  addLinkFn,
  deleteLinkFn,
  listLinksFn,
  renameLinkFn,
} from '../server/links'
import { getRunStatusFn, startRunFn } from '../server/runs'
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
import { Findings } from '@/components/findings'
import { fmtWhen, linkError } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { ErrorComponentProps } from '@tanstack/react-router'
import type { z } from 'zod'

export const Route = createFileRoute('/projects/$projectId')({
  loader: async ({ params }) => {
    const id = Number(params.projectId)
    return {
      project: await getProjectFn({ data: id }),
      links: await listLinksFn({ data: id }),
    }
  },
  errorComponent: ProjectError,
  component: ProjectDetail,
})

const STATUS_DOT: Record<string, string> = {
  pending: 'bg-muted-foreground/40',
  running: 'bg-amber-400 animate-pulse',
  ok: 'bg-emerald-500',
  error: 'bg-red-500',
}

type RunStatus = NonNullable<Awaited<ReturnType<typeof getRunStatusFn>>>
type Link = ReturnType<typeof Route.useLoaderData>['links'][number]

// What the row says and how loud it says it. The raw reason stays as the tooltip — the friendly
// wording is for reading, the category detail is for debugging.
function linkState(
  link: Link,
  runLink: RunStatus['links'][number] | undefined,
  startedAt: RunStatus['run']['startedAt'] | undefined,
) {
  const status = runLink?.status ?? link.status
  const reason = runLink ? runLink.error : link.lastError
  const error = status === 'error' ? linkError(reason) : null

  const dot = error
    ? error.tone === 'amber'
      ? 'bg-amber-500'
      : 'bg-red-500'
    : (STATUS_DOT[status] ?? STATUS_DOT.pending)

  if (error)
    return { status, dot, text: error.text, title: reason, tone: error.tone }

  const text =
    runLink && startedAt
      ? runSummary(runLink, startedAt)
      : status === 'ok' && link.lastRunAt
        ? `last checked ${fmtWhen(link.lastRunAt)}`
        : null

  return { status, dot, text, title: text, tone: null }
}

function runSummary(
  runLink: RunStatus['links'][number],
  startedAt: RunStatus['run']['startedAt'],
) {
  if (runLink.status === 'pending') return 'waiting'
  if (runLink.status === 'running') return 'fetching…'
  // Baselined during this run — a first run reports what it seeded, not zero news.
  if (
    runLink.baselinedAt &&
    new Date(runLink.baselinedAt) >= new Date(startedAt)
  )
    return `baseline: ${runLink.parsedCount}`
  return `${runLink.newCount} new · ${runLink.priceCount} price · ${runLink.removedCount} removed`
}

function ProjectError({ error, reset }: ErrorComponentProps) {
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Could not load this project</CardTitle>
        <CardDescription>{error.message}</CardDescription>
      </CardHeader>
      <CardFooter className="gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button variant="secondary" asChild>
          <RouterLink to="/">All projects</RouterLink>
        </Button>
      </CardFooter>
    </Card>
  )
}

function ProjectDetail() {
  const { project, links } = Route.useLoaderData()
  const router = useRouter()
  const queryClient = useQueryClient()

  const form = useForm<z.infer<typeof updateProjectSchema>>({
    resolver: standardSchemaResolver(updateProjectSchema),
    // `values` (not `defaultValues`) so switching project re-syncs the inputs — the route component
    // isn't remounted on a param change.
    values: { id: project.id, name: project.name },
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

  const [runId, setRunId] = useState<number | null>(null)
  const startRun = useMutation({
    mutationFn: startRunFn,
    onSuccess: ({ runId: id }) => setRunId(id),
  })
  const run = useQuery({
    queryKey: ['run', runId],
    queryFn: () => getRunStatusFn({ data: runId ?? 0 }),
    enabled: runId !== null,
    refetchInterval: ({ state }) =>
      state.data?.run.status === 'running' ? 1500 : false,
  })
  const running = run.data?.run.status === 'running'
  const runLinks = new Map(run.data?.links.map((rl) => [rl.linkId, rl]) ?? [])

  // The run rewrote every link's status, fetchMode and lastError — pull the loader back through,
  // and drop the run's new section into the timeline without a reload.
  useEffect(() => {
    if (!run.data || running) return
    void router.invalidate()
    void queryClient.invalidateQueries({ queryKey: ['findings', project.id] })
  }, [run.data, running, router, queryClient, project.id])

  const remove = useMutation({
    mutationFn: deleteProjectFn,
    onSuccess: async () => {
      await router.invalidate()
      await router.navigate({ to: '/' })
    },
  })

  return (
    <div className="max-w-4xl space-y-6">
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

      <Card>
        <CardHeader>
          <CardTitle>Search links</CardTitle>
          <CardDescription>
            {running
              ? 'Refreshing — 3–8s between requests, so a full project takes a minute or two.'
              : `${links.length} of ${MAX_LINKS} saved searches.`}
          </CardDescription>
          <CardAction>
            <Button
              variant="secondary"
              disabled={running || startRun.isPending || links.length === 0}
              onClick={() => startRun.mutate({ data: project.id })}
            >
              <RefreshCw className={cn(running && 'animate-spin')} />
              {running ? 'Refreshing…' : 'Refresh'}
            </Button>
          </CardAction>
        </CardHeader>

        {links.length > 0 && (
          <ul className="divide-y divide-border border-y border-border">
            {links.map((link) => {
              const runLink = runLinks.get(link.id)
              const { status, dot, text, title, tone } = linkState(
                link,
                runLink,
                run.data?.run.startedAt,
              )
              return (
                <li
                  key={link.id}
                  className="flex items-center gap-2 px-4 py-2 transition-colors hover:bg-accent/30"
                >
                  <span
                    title={status}
                    className={cn('size-2 shrink-0 rounded-full', dot)}
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
                  {text && (
                    <span
                      title={title ?? undefined}
                      className={cn(
                        'max-w-80 shrink truncate text-xs tabular-nums',
                        tone === 'red' && 'text-destructive',
                        tone === 'amber' && 'text-amber-400',
                        !tone && 'text-muted-foreground',
                      )}
                    >
                      {text}
                    </span>
                  )}
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
                  {(link.fetchMode === 'browser' || runLink?.escalated) && (
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
              )
            })}
          </ul>
        )}

        <CardContent className="space-y-2">
          {links.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No search links yet — add a search URL below, sorted newest-first.
            </p>
          )}
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

      <Findings projectId={project.id} />

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
