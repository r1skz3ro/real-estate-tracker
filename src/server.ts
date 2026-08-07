import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'
import { startScheduler } from '#/server/scheduler'

// Overrides TanStack Start's packaged server entry purely to get this side effect: it is the one
// module that runs exactly once per server process, in both `pnpm dev` and a built server.
startScheduler()

export default { fetch: createStartHandler(defaultStreamHandler) }
