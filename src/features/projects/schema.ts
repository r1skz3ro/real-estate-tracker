import { z } from 'zod'

// One schema per operation, validated by the server fn and driving react-hook-form on the client —
// so the rules can't drift apart. Client-safe: zod and nothing else.
const name = z.string().min(1, 'Name is required').max(80)
// No .transform() to fold '' into null: it would make the resolver's output type diverge from the
// form's input type, which react-hook-form then fights. Readers use `?? ''`.
const description = z.string().max(500).optional()

export const createProjectSchema = z.object({ name, description })

export const updateProjectSchema = z.object({
  id: z.number().int(),
  name,
  description,
})
