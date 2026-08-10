import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Takes the three things it actually needs rather than a whole run, so the project page's `useRun`
// and the link page's `useLinkRun` — which follow a run in different ways — share one button.
export function RefreshButton({
  running,
  starting,
  start,
  disabled,
  label = 'Refresh',
  size,
}: {
  running: boolean
  starting: boolean
  start: () => void
  disabled?: boolean
  label?: string
  size?: 'sm'
}) {
  return (
    <Button
      variant="secondary"
      size={size}
      disabled={running || starting || disabled}
      onClick={start}
    >
      <RefreshCw className={cn(running && 'animate-spin')} />
      {running ? 'Refreshing…' : label}
    </Button>
  )
}
