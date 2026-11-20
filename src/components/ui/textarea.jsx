import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef(({ className, placeholder = ' ', ...props }, ref) => {
  return (
    <textarea
      placeholder={placeholder}
      className={cn(
        "flex min-h-[96px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-soft ring-offset-background transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/20 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea };
