import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createProjectSchema } from './schema'
import { useCreateProject } from './useProjects'
import type { z } from 'zod'

const trim = { setValueAs: (v: string) => v.trim() }
const noop = () => {}

export function NewProjectDialog() {
  const [open, setOpen] = useState(false)
  const form = useForm<z.infer<typeof createProjectSchema>>({
    resolver: standardSchemaResolver(createProjectSchema),
    defaultValues: { name: '', description: '' },
  })
  const create = useCreateProject()
  const { errors } = form.formState

  function change(next: boolean) {
    setOpen(next)
    if (!next) {
      form.reset()
      create.reset()
    }
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="New project">
          <Plus />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          onSubmit={form.handleSubmit(async (data) => {
            // Rejection is swallowed on purpose — the message is rendered from `create.error`,
            // and letting it escape handleSubmit is an unhandled rejection.
            await create.mutateAsync({ data }).then(() => change(false), noop)
          })}
        >
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              A project is a set of saved search URLs refreshed together.
            </DialogDescription>
          </DialogHeader>

          <div className="my-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-project-name">Name</Label>
              <Input
                id="new-project-name"
                {...form.register('name', trim)}
                maxLength={80}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-project-description">
                Description{' '}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </Label>
              <Textarea
                id="new-project-description"
                {...form.register('description', trim)}
                maxLength={500}
                rows={3}
                placeholder="What is this project tracking?"
              />
            </div>
            {(errors.name ?? errors.description ?? create.error) && (
              <p className="text-sm text-destructive">
                {errors.name?.message ??
                  errors.description?.message ??
                  create.error?.message}
              </p>
            )}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={create.isPending}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
