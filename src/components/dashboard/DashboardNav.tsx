"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

type Props = {
  role: string;
  restaurantName: string;
};

export function DashboardNav({ role, restaurantName }: Props) {
  const pathname = usePathname();

  const canManage = role === "owner" || role === "manager";
  const isOwner = role === "owner";

  const visibleItems = NAV_ALL.filter((item) => {
    if (
      ["/dashboard/menu", "/dashboard/tables", "/dashboard/reports", "/dashboard/staff"].includes(
        item.href
      )
    ) {
      return canManage;
    }
    return true;
  });

  function isActive(item: NavItem) {
    if (item.exact) return pathname === item.href;
    return pathname.startsWith(item.href);
  }

  return (
    <nav className="hidden md:flex flex-col fixed left-0 top-0 h-screen w-[280px] z-40 bg-surface-container-low border-r border-outline-variant/30">
      {/* Brand */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-outline-variant/30">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-container font-bold text-on-primary-container text-base">
          Q
        </div>
        <div>
          <p className="font-headline-sm text-primary" style={{ fontSize: 16 }}>QBite Admin</p>
          <p className="font-body-sm text-on-surface-variant truncate max-w-[160px]">{restaurantName}</p>
        </div>
      </div>

      {/* Main nav */}
      <ul className="flex flex-col gap-xs p-3 flex-1">
        {visibleItems.map((item) => {
          const active = isActive(item);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "flex items-center gap-sm px-4 py-3 mx-0 rounded-lg font-label-bold text-label-bold transition-colors",
                  active
                    ? "bg-primary-container text-on-primary-container"
                    : "text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface"
                )}
              >
                <span
                  className={cn("material-symbols-outlined", active && "fill")}
                  style={{ fontSize: 22 }}
                >
                  {item.icon}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}

        {isOwner &&
          NAV_OWNER_ONLY.map((item) => {
            const active = isActive(item);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-sm px-4 py-3 rounded-lg font-label-bold text-label-bold transition-colors",
                    active
                      ? "bg-primary-container text-on-primary-container"
                      : "text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface"
                  )}
                >
                  <span
                    className={cn("material-symbols-outlined", active && "fill")}
                    style={{ fontSize: 22 }}
                  >
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              </li>
            );
          })}
      </ul>

      {/* Bottom: sign out */}
      <div className="border-t border-outline-variant/30 p-3">
        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            className="flex w-full items-center gap-sm px-4 py-3 rounded-lg font-label-bold text-label-bold text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>logout</span>
            Sign out
          </button>
        </form>
      </div>
    </nav>
  );
}
