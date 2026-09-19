import type { ReactNode } from "react";
import { Reveal } from "@/components/motion/Reveal";
import { cn } from "@/lib/utils";

/**
 * One rhythm for the whole marketing page: a single max width, a single
 * horizontal gutter, and a single vertical step. Sections stop inventing their
 * own spacing, which is what makes a long page feel composed rather than
 * stacked.
 */
export function Section({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={cn("relative px-margin-mobile py-section md:px-margin-desktop", className)}
    >
      <div className="mx-auto w-full max-w-content">{children}</div>
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: string;
  align?: "center" | "left";
}) {
  const centered = align === "center";

  return (
    <Reveal
      className={cn(
        "flex flex-col gap-4",
        centered ? "items-center text-center" : "items-start text-left"
      )}
    >
      {eyebrow && (
        <span className="inline-flex items-center gap-2 rounded-full border border-outline-variant bg-surface-container-low px-3 py-1 font-label-bold text-label-bold uppercase text-on-surface-variant">
          <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" />
          {eyebrow}
        </span>
      )}
      <h2 className="font-display text-display text-on-surface">{title}</h2>
      {description && (
        <p className={cn("measure text-body-lg text-on-surface-variant", centered && "mx-auto")}>
          {description}
        </p>
      )}
    </Reveal>
  );
}
