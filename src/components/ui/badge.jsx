import * as React from "react"
import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex min-h-6 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold leading-none transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        danger:
          "border-destructive/25 bg-destructive/10 text-destructive",
        success:
          "border-success/25 bg-success-muted text-success-muted-foreground",
        warning:
          "border-warning/30 bg-warning-muted text-warning-muted-foreground",
        info:
          "border-info/25 bg-info-muted text-info-muted-foreground",
        neutral:
          "border-border bg-muted text-muted-foreground",
        outline: "border-border bg-transparent text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({ className, variant, ...props }) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants };
