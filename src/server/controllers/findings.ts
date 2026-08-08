import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  listFindings,
  markProjectRead,
  markRunRead,
} from '@/server/models/queries'

export const listFindingsFn = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      projectId: z.number().int(),
      limit: z.number().int().min(1).max(200).default(20),
    }),
  )
  .handler(({ data }) => listFindings(data.projectId, data.limit))

export const markReadFn = createServerFn({ method: 'POST' })
  .validator(z.number().int())
  .handler(({ data }) => markRunRead(data))

export const markAllReadFn = createServerFn({ method: 'POST' })
  .validator(z.number().int())
  .handler(({ data }) => markProjectRead(data))
