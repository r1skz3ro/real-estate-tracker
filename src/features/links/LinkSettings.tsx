import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useDeleteLink, useUpdateLink } from './useLinks'
import type { Link, LinkStats } from './types'

type Form = { label: string; url: string; fetchMode: 'http' | 'browser' }

export function LinkSettings({
  link,
  stats,
}: {
  link: Link
  stats: LinkStats | undefined
}) {
  const navigate = useNavigate()
  const update = useUpdateLink()
  const remove = useDeleteLink()
  const [confirming, setConfirming] = useState<Form | null>(null)
  const [saved, setSaved] = useState(false)

  // `values`, not `defaultValues`: switching links reuses this component without remounting it.
  const form = useForm<Form>({
    values: {
      label: link.label,
      url: link.url,
      fetchMode: link.fetchMode === 'browser' ? 'browser' : 'http',
    },
  })
  const { formState, register, reset, setValue, watch } = form
  useEffect(() => setSaved(false), [link.id])

  const save = (data: Form) =>
    update.mutate(
      { data: { id: link.id, ...data } },
      {
        onSuccess: () => {
          setConfirming(null)
          setSaved(true)
        },
      },
    )

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Search</CardTitle>
          <CardDescription>
            The URL decides the portal, so changing it starts this link over.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form
            id="link-settings"
            className="space-y-4"
            // A changed URL throws the tracked listings away as a seen-set; it gets a confirmation,
            // a label or fetch-mode edit does not.
            onSubmit={form.handleSubmit((data) =>
              data.url === link.url ? save(data) : setConfirming(data),
            )}
          >
            <div className="space-y-2">
              <Label htmlFor="label">Label</Label>
              <Input
                id="label"
                maxLength={80}
                {...register('label', { required: true })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="url">Search URL</Label>
              <Input
                id="url"
                type="url"
                {...register('url', {
                  required: true,
                  setValueAs: (v: string) => v.trim(),
                })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fetchMode">Fetch mode</Label>
              <Select
                value={watch('fetchMode')}
                onValueChange={(v) =>
                  setValue('fetchMode', v as Form['fetchMode'], {
                    shouldDirty: true,
                  })
                }
              >
                <SelectTrigger id="fetchMode" className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="http">http — plain request</SelectItem>
                  <SelectItem value="browser">browser — Playwright</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Forcing http is undone automatically if the portal blocks the
                plain request again.
              </p>
            </div>

            {update.error && (
              <p className="text-sm text-destructive">{update.error.message}</p>
            )}
          </form>
        </CardContent>

        <CardFooter className="gap-3">
          <Button
            type="submit"
            form="link-settings"
            disabled={update.isPending || !formState.isDirty}
          >
            Save
          </Button>
          {formState.isDirty && (
            <Button type="button" variant="ghost" onClick={() => reset()}>
              Cancel
            </Button>
          )}
          {saved && !formState.isDirty && (
            <span className="text-sm text-muted-foreground">Saved</span>
          )}
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danger zone</CardTitle>
          <CardDescription>
            Removing this link deletes its {stats?.tracked ?? 0} recorded
            listing{stats?.tracked === 1 ? '' : 's'} and everything it ever
            reported. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <RemoveLink
            link={link}
            pending={remove.isPending}
            onConfirm={() =>
              remove.mutate(
                { data: link.id },
                {
                  onSuccess: () =>
                    navigate({
                      to: '/projects/$projectId',
                      params: { projectId: String(link.projectId) },
                    }),
                },
              )
            }
          />
        </CardFooter>
      </Card>

      <AlertDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change the search URL?</AlertDialogTitle>
            <AlertDialogDescription>
              A different search is a different set of results. The{' '}
              {stats?.live ?? 0} listing{stats?.live === 1 ? '' : 's'} currently
              tracked here will be archived — kept and still readable, but no
              longer watched — and the next refresh records a fresh baseline
              instead of reporting a whole search as new.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep the current URL</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirming && save(confirming)}
              disabled={update.isPending}
            >
              Change it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function RemoveLink({
  link,
  pending,
  onConfirm,
}: {
  link: Link
  pending: boolean
  onConfirm: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="destructive"
        disabled={pending}
        onClick={() => setOpen(true)}
      >
        Remove this link
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {link.label}?</AlertDialogTitle>
          <AlertDialogDescription>
            Its listings, its fetch history and its logs go with it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Remove</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
