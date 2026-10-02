import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { LoginForm } from "@/components/auth/LoginForm";
import { AuthShell } from "@/components/auth/AuthShell";

type Props = { searchParams: { slug?: string; next?: string } };

export const metadata: Metadata = {
  title: "Staff sign in",
  robots: { index: false, follow: false },
};

const POINTS = [
  {
    icon: "display_settings",
    title: "Every ticket, live",
    body: "Orders reach the kitchen display the moment a guest checks out.",
  },
  {
    icon: "badge",
    title: "The right screen for each role",
    body: "Owners and managers sign in by email. Kitchen and floor staff use a 4-digit PIN.",
  },
  {
    icon: "wifi_off",
    title: "Keeps going offline",
    body: "Status changes queue on the device and sync when the connection is back.",
  },
];

function ReassurancePanel() {
  return (
    <div className="max-w-md">
      <span className="inline-flex items-center gap-2 rounded-full border border-brand-border bg-brand-subtle px-3 py-1 font-label-bold text-label-bold uppercase text-brand-text">
        <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden="true">
          restaurant_menu
        </span>
        QBite for staff
      </span>
      <h2 className="mt-5 font-display text-[40px] font-bold leading-[1.05] tracking-[-0.02em] text-on-surface">
        Run the whole service from one place.
      </h2>
      <p className="mt-3 text-body-md text-on-surface-variant">
        Menu, tables, kitchen and orders, all in your restaurant workspace.
      </p>
      <ul className="mt-8 flex flex-col gap-5">
        {POINTS.map((p) => (
          <li key={p.title} className="flex items-start gap-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-outline-variant bg-surface-container-lowest text-brand-text shadow-level-1">
              <span className="material-symbols-outlined" style={{ fontSize: 22 }} aria-hidden="true">
                {p.icon}
              </span>
            </span>
            <span>
              <span className="block font-semibold text-on-surface">{p.title}</span>
              <span className="mt-0.5 block text-body-sm text-on-surface-variant">{p.body}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Only same-origin paths are honoured. `?next=https://evil.example` or
 * `?next=//evil.example` used to be passed straight to `redirect()` and
 * `router.push()` — an open redirect off the sign-in page.
 */
function safeNextPath(next: string | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return "/dashboard";
  }
  return next;
}

export default async function LoginPage({ searchParams }: Props) {
  const nextPath = safeNextPath(searchParams.next);
  const session = await getStaffSession();
  if (session) redirect(nextPath);

  return (
    <AuthShell aside={<ReassurancePanel />}>
      <LoginForm
        defaultSlug={searchParams.slug}
        nextPath={nextPath}
      />
    </AuthShell>
  );
}
