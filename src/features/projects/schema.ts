import { z } from 'zod'

// One schema per operation, validated by the server fn and driving react-hook-form on the client —
// so the rules can't drift apart. Client-safe: zod and nothing else.
export const createProjectSchema = z.object({
  name: z.string().min(1, 'Name is required').max(80),
})

export const updateProjectSchema = z.object({
  id: z.number().int(),
  name: z.string().min(1, 'Name is required').max(80),
})
