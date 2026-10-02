"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { StaffRole } from "@/types";

type NavItem = {
  href: string;
  label: string;
  icon: string;
  exact?: boolean;
  /** Who can open it. Omitted = every staff role. */
  roles?: readonly StaffRole[];
  /** Leaves the dashboard shell for a full-screen view. */
  fullScreen?: boolean;
};

const MANAGERS: readonly StaffRole[] = ["owner", "manager"];
const OWNER: readonly StaffRole[] = ["owner"];

/**
 * Grouped by job rather than one long list: running service, setting up the
 * restaurant, and looking back at the numbers.
 */
const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "Service",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "dashboard", exact: true },
      { href: "/dashboard/kitchen", label: "Kitchen display", icon: "display_settings", fullScreen: true },
      { href: "/dashboard/orders", label: "Orders", icon: "receipt_long" },
    ],
  },
  {
    title: "Manage",
    items: [
      { href: "/dashboard/menu", label: "Menu", icon: "restaurant_menu", roles: MANAGERS },
      { href: "/dashboard/tables", label: "Tables & QR", icon: "qr_code_scanner", roles: MANAGERS },
      { href: "/dashboard/staff", label: "Staff", icon: "group", roles: MANAGERS },
    ],
  },
  {
    title: "Insights",
    items: [{ href: "/dashboard/reports", label: "Sales reports", icon: "monitoring", roles: MANAGERS }],
  },
  {
    title: "Account",
    items: [{ href: "/dashboard/settings", label: "Settings", icon: "settings", roles: OWNER }],
  },
];

const ROLE_LABELS: Record<StaffRole, string> = {
  owner: "Owner",
  manager: "Manager",
  kitchen: "Kitchen",
  waiter: "Waiter",
};

type Props = {
  role: StaffRole;
  restaurantName: string;
  staffName: string | null;
};

function Icon({ name, size = 20, className }: { name: string; size?: number; className?: string }) {
  return (
    <span
      className={cn("material-symbols-outlined shrink-0", className)}
      style={{ fontSize: size }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}

function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function BrandMark({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative grid shrink-0 place-items-center rounded-lg bg-primary font-display font-bold text-primary-foreground",
        size === "md" ? "h-9 w-9 text-sm" : "h-7 w-7 text-xs"
      )}
    >
      Q
      <span
        className={cn(
          "absolute -right-0.5 -top-0.5 rounded-full bg-brand ring-2 ring-surface-container-low",
          size === "md" ? "h-2 w-2" : "h-1.5 w-1.5"
        )}
      />
    </span>
  );
}

function NavLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-body-sm font-medium",
        "transition-colors duration-fast ease-out-quart",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
        active
          ? "bg-brand-subtle text-on-surface"
          : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
      )}
    >
      {/* Accent rail on the active item — the selection is marked by position
          and shape as well as colour. */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute -left-3 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-brand transition-opacity duration-fast",
          active ? "opacity-100" : "opacity-0"
        )}
      />
      <span
        className={cn(
          "grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors duration-fast",
          active
            ? "bg-brand text-brand-foreground shadow-glow"
            : "text-on-surface-variant group-hover:text-on-surface"
        )}
      >
        <Icon name={item.icon} size={18} className={active ? "fill" : undefined} />
      </span>
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.fullScreen && (
        <span title="Opens full screen" className="text-on-surface-variant/70">
          <Icon name="open_in_full" size={16} />
          <span className="sr-only">(opens full screen)</span>
        </span>
      )}
    </Link>
  );
}

/** Everything inside the sidebar; shared by the desktop rail and the phone drawer. */
function NavContent({ role, restaurantName, staffName, onNavigate }: Props & { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  function isActive(item: NavItem) {
    if (item.exact) return pathname === item.href;
    return pathname.startsWith(item.href);
  }

  // A handler rather than a <form> POST: the logout route answers with JSON,
  // so the form used to leave the browser on a bare {"ok":true} page.
  async function signOut() {
    setSigningOut(true);
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.replace("/login");
      router.refresh();
    } catch (err) {
      console.error("[nav] sign out failed", err);
      toast.error("Couldn't sign out. Check your connection and try again.");
      setSigningOut(false);
    }
  }

  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.roles || item.roles.includes(role)),
  })).filter((section) => section.items.length > 0);

  const displayName = staffName?.trim() || ROLE_LABELS[role];

  return (
    <div className="flex h-full flex-col">
      {/* Brand — links to the public home page. */}
      <Link
        href="/"
        onClick={onNavigate}
        aria-label={`QBite home page (${restaurantName})`}
        className="flex items-center gap-3 border-b border-outline-variant px-5 py-4 transition-colors duration-fast hover:bg-surface-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
      >
        <BrandMark />
        <div className="min-w-0 flex-1">
          <p className="font-display text-[0.9375rem] font-bold tracking-[-0.02em] text-on-surface">QBite</p>
          <p className="truncate text-body-sm text-on-surface-variant">{restaurantName}</p>
        </div>
      </Link>

      {/* Main nav */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {sections.map((section) => (
          <div key={section.title} className="pt-4">
            <p className="px-3 pb-1.5 font-label-bold text-label-bold uppercase text-on-surface-variant/80">
              {section.title}
            </p>
            <ul className="flex flex-col gap-0.5">
              {section.items.map((item) => (
                <li key={item.href}>
                  <NavLink item={item} active={isActive(item)} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Who is signed in, with sign out and theme. */}
      <div className="border-t border-outline-variant p-3">
        <div className="flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-2.5">
          <span
            aria-hidden="true"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-brand-border bg-brand-subtle font-display text-sm font-bold text-brand-text"
          >
            {initialsOf(displayName) || "?"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-on-surface">{displayName}</p>
            <p className="truncate text-body-xs text-on-surface-variant">{ROLE_LABELS[role]}</p>
          </div>
          <ThemeToggle className="h-11 w-11 shrink-0" />
        </div>
        <button
          type="button"
          onClick={signOut}
          disabled={signingOut}
          className="mt-2 flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-body-sm font-medium text-on-surface-variant transition-colors duration-fast hover:bg-error-container hover:text-on-error-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60"
        >
          <Icon name="logout" size={20} />
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </div>
  );
}

/**
 * Dashboard navigation: a fixed 280px rail from md up, and on phones a top bar
 * whose menu button opens the same navigation in a drawer. Phones previously
 * had no navigation at all — the rail was simply hidden below md.
 */
export function DashboardNav(props: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer once a link has navigated (covers back/forward too).
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  return (
    <>
      <nav
        aria-label="Dashboard"
        className="fixed left-0 top-0 z-40 hidden h-screen w-[280px] border-r border-outline-variant bg-surface-container-low md:block"
      >
        <NavContent {...props} />
      </nav>

      {/* Phone top bar */}
      <div className="glass fixed inset-x-0 top-0 z-30 flex h-[56px] items-center gap-2 border-x-0 border-t-0 px-2 md:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          aria-expanded={drawerOpen}
          className="grid h-11 w-11 place-items-center rounded-xl text-on-surface hover:bg-surface-container"
        >
          <Icon name="menu" size={24} />
        </button>
        <Link
          href="/"
          aria-label="QBite home page"
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <BrandMark size="sm" />
          <span className="truncate font-display text-[0.9375rem] font-bold tracking-[-0.02em] text-on-surface">
            QBite
          </span>
        </Link>
        <span className="rounded-full border border-outline-variant bg-surface-container px-2.5 py-0.5 font-label-bold text-label-bold uppercase text-on-surface-variant">
          {ROLE_LABELS[props.role]}
        </span>
      </div>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent
          side="left"
          className="w-[300px] max-w-[85vw] border-r border-outline-variant bg-surface-container-low p-0"
        >
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SheetDescription className="sr-only">Dashboard navigation</SheetDescription>
          <nav aria-label="Dashboard" className="h-full">
            <NavContent {...props} onNavigate={() => setDrawerOpen(false)} />
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}
