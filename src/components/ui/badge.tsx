import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider transition-colors',
  {
    variants: {
      variant: {
        default: 'border-border bg-secondary text-secondary-foreground',
        online: 'border-emerald-500/30 bg-emerald-950/30 text-emerald-400',
        offline: 'border-red-500/30 bg-red-950/30 text-red-400',
        warning: 'border-amber-500/30 bg-amber-950/30 text-amber-400',
        info: 'border-blue-500/30 bg-blue-950/30 text-blue-400',
        lcars: 'border-lcars-amber/30 bg-lcars-amber/10 text-lcars-amber',
        ghost: 'border-transparent bg-transparent text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant, className }))} {...props} />
}

export { Badge, badgeVariants }
