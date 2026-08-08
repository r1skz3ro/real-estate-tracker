import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MAX_LINKS } from './constants'
import { useAddLink } from './useLinks'

export function AddLinkForm({
  projectId,
  atCap,
}: {
  projectId: number
  atCap: boolean
}) {
  // No resolver: every rule that matters (portal, https, cap, duplicate) is enforced server-side,
  // so the server's message is the one worth showing.
  const form = useForm<{ url: string }>({ defaultValues: { url: '' } })
  const add = useAddLink()

  if (atCap)
    return (
      <p className="text-sm text-muted-foreground">
        {MAX_LINKS} of {MAX_LINKS} links — remove one to add another.
      </p>
    )

  return (
    <>
      <form
        className="flex gap-2"
        onSubmit={form.handleSubmit(({ url }) =>
          add.mutate(
            { data: { projectId, url } },
            { onSuccess: () => form.reset() },
          ),
        )}
      >
        <Input
          {...form.register('url', {
            required: true,
            setValueAs: (v: string) => v.trim(),
          })}
          type="url"
          placeholder="Paste a search URL from OLX, Otodom, Gratka, Adresowo or Nieruchomosci-Online"
        />
        <Button type="submit" disabled={add.isPending}>
          Add
        </Button>
      </form>
      {add.error && (
        <p className="text-sm text-destructive">{add.error.message}</p>
      )}
    </>
  )
}
