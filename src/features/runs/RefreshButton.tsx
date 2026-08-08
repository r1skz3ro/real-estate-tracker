import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Run } from './useRun'

export function RefreshButton({
  run,
  disabled,
}: {
  run: Run
  disabled?: boolean
}) {
  return (
    <Button
      variant="secondary"
      disabled={run.running || run.starting || disabled}
      onClick={run.start}
    >
      <RefreshCw className={cn(run.running && 'animate-spin')} />
      {run.running ? 'Refreshing…' : 'Refresh'}
    </Button>
  )
}
