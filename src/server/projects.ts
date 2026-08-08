import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProject,
} from '#/db/queries'

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
})

export const createProjectFn = createServerFn({ method: 'POST' })
  .validator(createProjectSchema)
  .handler(({ data }) => createProject(data))

export const updateProjectFn = createServerFn({ method: 'POST' })
  .validator(updateProjectSchema)
  .handler(({ data: { id, ...fields } }) => updateProject(id, fields))

export const deleteProjectFn = createServerFn({ method: 'POST' })
  .validator(z.number().int())
  .handler(({ data }) => deleteProject(data))
