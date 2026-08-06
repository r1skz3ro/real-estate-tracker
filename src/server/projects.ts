import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProject,
} from '#/db/queries'

// 'HH:MM', Europe/Warsaw. <input type="time"> already enforces this client-side; zod is the
// trust-boundary backstop.
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM')

export const listProjectsFn = createServerFn({ method: 'GET' }).handler(() =>
  listProjects(),
)

export const getProjectFn = createServerFn({ method: 'GET' })
  .validator(z.number().int())
  .handler(({ data }) => {
    const project = getProject(data)
    if (!project) throw new Error('Project not found')
    return project
  })

// Exported so the forms can drive react-hook-form off the same schema the server validates with.
export const createProjectSchema = z.object({
  name: z.string().min(1, 'Name is required').max(80),
})

export const updateProjectSchema = z.object({
  id: z.number().int(),
  name: z.string().min(1, 'Name is required').max(80),
  runAt1: time,
  runAt2: time,
})

export const createProjectFn = createServerFn({ method: 'POST' })
  .validator(createProjectSchema)
  .handler(({ data }) => createProject(data))

export const updateProjectFn = createServerFn({ method: 'POST' })
  .validator(updateProjectSchema)
  .handler(({ data: { id, ...fields } }) => {
    // ponytail: thrown here rather than as a zod .refine() — a ZodError serializes to the client as
    // a JSON blob, a plain Error keeps the message renderable in the form.
    if (fields.runAt1 === fields.runAt2)
      throw new Error('Refresh times must differ')
    return updateProject(id, fields)
  })

export const deleteProjectFn = createServerFn({ method: 'POST' })
  .validator(z.number().int())
  .handler(({ data }) => deleteProject(data))
