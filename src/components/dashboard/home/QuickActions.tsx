import Link from "next/link";
import { SpotlightCard } from "@/components/aceternity/SpotlightCard";

type Action = {
  href: string;
  title: string;
  body: string;
  icon: string;
  /** Mirrors `MANAGER_ONLY_HREFS` in DashboardNav — those routes refuse other roles. */
  managerOnly: boolean;
};

const ACTIONS: Action[] = [
  {
    href: "/dashboard/kitchen",
    title: "Kitchen display",
    body: "Live tickets for the pass",
    icon: "display_settings",
    managerOnly: false,
  },
  {
    href: "/dashboard/orders",
    title: "Orders",
    body: "Search, review and update",
    icon: "receipt_long",
    managerOnly: false,
  },
  {
    href: "/dashboard/menu",
    title: "Menu",
    body: "Dishes, prices, stock",
    icon: "restaurant_menu",
    managerOnly: true,
  },
  {
    href: "/dashboard/tables",
    title: "Tables & QR",
    body: "Print table QR codes",
    icon: "qr_code_scanner",
    managerOnly: true,
  },
];

export function QuickActions({ canManage }: { canManage: boolean }) {
  const actions = ACTIONS.filter((a) => canManage || !a.managerOnly);

  return (
    <section aria-labelledby="quick-actions-heading" className="flex flex-col gap-3">
      <h2
        id="quick-actions-heading"
        className="font-label-bold text-label-bold uppercase text-on-surface-variant"
      >
        Quick actions
      </h2>
      <ul className="grid grid-cols-2 gap-3">
        {actions.map((action) => (
          <li key={action.href} className="min-w-0">
            <SpotlightCard className="h-full">
              <Link
                href={action.href}
                className="flex h-full min-h-[112px] flex-col gap-3 rounded-2xl p-4 outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="grid h-11 w-11 place-items-center rounded-xl border border-brand-border bg-brand-subtle text-brand-text">
                    <span className="material-symbols-outlined" style={{ fontSize: 22 }} aria-hidden="true">
                      {action.icon}
                    </span>
                  </span>
                  <span
                    className="material-symbols-outlined text-on-surface-variant transition-transform duration-fast group-hover/spot:translate-x-0.5"
                    style={{ fontSize: 20 }}
                    aria-hidden="true"
                  >
                    arrow_forward
                  </span>
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-[15px] font-semibold text-on-surface">
                    {action.title}
                  </span>
                  <span className="mt-0.5 block text-body-sm text-on-surface-variant">
                    {action.body}
                  </span>
                </span>
              </Link>
            </SpotlightCard>
          </li>
        ))}
      </ul>
    </section>
  );
}
