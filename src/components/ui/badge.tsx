import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        // statuses
        open: 'bg-blue-500/15 text-blue-400',
        assigned: 'bg-yellow-500/15 text-yellow-400',
        running: 'bg-purple-500/15 text-purple-400 animate-pulse',
        blocked: 'bg-red-500/15 text-red-400',
        done: 'bg-green-500/15 text-green-400',
        failed: 'bg-red-500/15 text-red-400',
        cancelled: 'bg-zinc-500/15 text-zinc-400',
        // schedule
        manual: 'bg-zinc-500/15 text-zinc-400',
        immediate: 'bg-blue-500/15 text-blue-400',
        scheduled: 'bg-yellow-500/15 text-yellow-400',
        recurring: 'bg-purple-500/15 text-purple-400',
        // adapter
        'claude-code': 'bg-orange-500/15 text-orange-400',
        'openclaw': 'bg-blue-500/15 text-blue-400',
        // agent status
        online: 'bg-green-500/15 text-green-400',
        busy: 'bg-yellow-500/15 text-yellow-400',
        offline: 'bg-zinc-500/15 text-zinc-400',
        // default
        default: 'bg-zinc-500/15 text-zinc-400',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />
}
