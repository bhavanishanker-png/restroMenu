import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // h-11 is the 44px minimum tap target; `text-base` on mobile also
          // stops iOS Safari zooming the viewport on focus.
          "flex h-11 w-full rounded-lg border border-outline-variant bg-surface-container-low/60 px-3.5 py-2",
          "text-base text-on-surface md:text-sm",
          "transition-[border-color,box-shadow,background-color] duration-fast ease-out-quart",
          "placeholder:text-on-surface-variant/70",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          "hover:border-outline/50",
          "focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "aria-[invalid=true]:border-error aria-[invalid=true]:focus-visible:ring-error/30",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
