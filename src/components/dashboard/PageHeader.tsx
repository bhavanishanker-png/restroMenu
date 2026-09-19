import type { ReactNode } from "react";

/**
 * One header for every dashboard page. Reports and Orders each rolled their
 * own with different padding, type sizes and borders — and Reports ended up
 * rendering its title twice, once here and once inside the report body.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col justify-between gap-3 border-b border-outline-variant bg-surface-container-low px-margin-mobile py-4 md:flex-row md:items-center md:px-margin-desktop">
      <div className="min-w-0">
        <h1 className="font-display text-headline-md text-on-surface">{title}</h1>
        {description && (
          <p className="mt-0.5 measure text-body-sm text-on-surface-variant">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
