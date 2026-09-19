"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: string;
  exact?: boolean;
};

const NAV_ALL: NavItem[] = [
  { href: "/dashboard",         label: "Dashboard",   icon: "dashboard",        exact: true },
  { href: "/dashboard/kitchen", label: "Kitchen",     icon: "display_settings" },
  { href: "/dashboard/orders",  label: "Orders",      icon: "receipt_long" },
  { href: "/dashboard/menu",    label: "Menu",        icon: "restaurant_menu" },
  { href: "/dashboard/tables",  label: "Tables & QR", icon: "qr_code_scanner" },
  { href: "/dashboard/reports", label: "Reports",     icon: "monitoring" },
  { href: "/dashboard/staff",   label: "Staff",       icon: "group" },
];

const NAV_OWNER_ONLY: NavItem[] = [
  { href: "/dashboard/settings", label: "Settings", icon: "settings" },
];

const MANAGER_ONLY_HREFS = [
  "/dashboard/menu",
  "/dashboard/tables",
  "/dashboard/reports",
  "/dashboard/staff",
];

type Props = {
  role: string;
  restaurantName: string;
};

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-body-sm font-medium",
        "transition-colors duration-fast ease-out-quart",
        active
          ? "bg-surface-container-high text-on-surface"
          : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
      )}
    >
      {/* Accent rail on the active item — the selection is marked by position
          and shape, not colour alone. */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand transition-opacity duration-fast",
          active ? "opacity-100" : "opacity-0"
        )}
      />
      <span
        className={cn(
          "material-symbols-outlined shrink-0 transition-colors",
          active ? "fill text-brand-text" : "text-on-surface-variant group-hover:text-on-surface"
        )}
        style={{ fontSize: 20 }}
        aria-hidden="true"
      >
        {item.icon}
      </span>
      {item.label}
    </Link>
  );
}

export function DashboardNav({ role, restaurantName }: Props) {
  const pathname = usePathname();

  const canManage = role === "owner" || role === "manager";
  const isOwner = role === "owner";

  const visibleItems = NAV_ALL.filter((item) =>
    MANAGER_ONLY_HREFS.includes(item.href) ? canManage : true
  );

  function isActive(item: NavItem) {
    if (item.exact) return pathname === item.href;
    return pathname.startsWith(item.href);
  }

  return (
    <nav
      aria-label="Dashboard"
      className="fixed left-0 top-0 z-40 hidden h-screen w-[280px] flex-col border-r border-outline-variant bg-surface-container-low md:flex"
    >
      {/* Brand */}
      <div className="flex items-center gap-3 border-b border-outline-variant px-5 py-4">
        <span
          aria-hidden="true"
          className="relative grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary font-display text-sm font-bold text-primary-foreground"
        >
          Q
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-brand ring-2 ring-surface-container-low" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[0.9375rem] font-bold tracking-[-0.02em] text-on-surface">
            QBite
          </p>
          <p className="truncate text-body-sm text-on-surface-variant">{restaurantName}</p>
        </div>
      </div>

      {/* Main nav */}
      <div className="flex-1 overflow-y-auto p-3">
        <p className="px-3 pb-2 pt-1 font-label-bold text-label-bold uppercase text-on-surface-variant">
          Operations
        </p>
        <ul className="flex flex-col gap-0.5">
          {visibleItems.map((item) => (
            <li key={item.href}>
              <NavLink item={item} active={isActive(item)} />
            </li>
          ))}
        </ul>

        {isOwner && (
          <>
            <p className="px-3 pb-2 pt-5 font-label-bold text-label-bold uppercase text-on-surface-variant">
              Account
            </p>
            <ul className="flex flex-col gap-0.5">
              {NAV_OWNER_ONLY.map((item) => (
                <li key={item.href}>
                  <NavLink item={item} active={isActive(item)} />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Footer: theme + sign out */}
      <div className="flex items-center gap-2 border-t border-outline-variant p-3">
        <form action="/api/auth/logout" method="POST" className="flex-1">
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-body-sm font-medium text-on-surface-variant transition-colors duration-fast hover:bg-surface-container hover:text-on-surface"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }} aria-hidden="true">
              logout
            </span>
            Sign out
          </button>
        </form>
        <ThemeToggle />
      </div>
    </nav>
  );
}
