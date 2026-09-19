import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * `default` is the monochrome primary — white on black in dark, black on white
 * in light. `brand` is the violet accent and should appear at most once per
 * view: the single action you want taken. Existing variants are unchanged so
 * call sites keep working.
 */
const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg",
    "text-sm font-medium tracking-[-0.006em]",
    "transition-[background-color,border-color,color,box-shadow,transform] duration-fast ease-out-quart",
    "active:translate-y-px",
    // Ring is driven by --ring (violet) and offset against the real page colour
    // so it stays visible on cards, sheets and the kitchen display alike.
    "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-level-1 hover:bg-primary/90",
        brand:
          "bg-brand text-brand-foreground shadow-level-1 hover:bg-brand/90 hover:shadow-glow",
        destructive:
          "bg-destructive text-destructive-foreground shadow-level-1 hover:bg-destructive/90",
        outline:
          "border border-outline-variant bg-surface-container-lowest/60 text-on-surface hover:border-outline/60 hover:bg-surface-container-high",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface",
        link: "text-brand-text underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-lg px-3",
        lg: "h-11 rounded-lg px-6 text-[0.9375rem]",
        xl: "h-[52px] rounded-xl px-7 text-base",
        icon: "h-10 w-10",
        // Customer screens require a 44px minimum tap target; the kitchen
        // display requires 60px. These enforce it rather than relying on
        // each call site to remember.
        touch: "h-11 min-w-[44px] rounded-lg px-5",
        kds: "h-[60px] min-w-[60px] rounded-xl px-6 text-lg font-semibold",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
