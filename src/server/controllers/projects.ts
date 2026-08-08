import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  createProjectSchema,
  updateProjectSchema,
} from '@/features/projects/schema'
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProject,
} from '@/server/models/queries'

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

export const createProjectFn = createServerFn({ method: 'POST' })
  .validator(createProjectSchema)
  .handler(({ data }) => createProject(data))

export const updateProjectFn = createServerFn({ method: 'POST' })
  .validator(updateProjectSchema)
  .handler(({ data: { id, ...fields } }) => updateProject(id, fields))

export const deleteProjectFn = createServerFn({ method: 'POST' })
  .validator(z.number().int())
  .handler(({ data }) => deleteProject(data))
