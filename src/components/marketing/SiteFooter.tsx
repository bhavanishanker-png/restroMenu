import Link from "next/link";
import { Wordmark } from "./Wordmark";

const COLUMNS = [
  {
    heading: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "How it works", href: "#how-it-works" },
      { label: "Pricing", href: "#pricing" },
      { label: "FAQ", href: "#faq" },
    ],
  },
  {
    heading: "For staff",
    links: [
      { label: "Staff sign in", href: "/login" },
      { label: "Kitchen display", href: "/dashboard/kitchen" },
      { label: "Dashboard", href: "/dashboard" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Terms of service", href: "/legal/terms" },
      { label: "Privacy policy", href: "/legal/privacy" },
      { label: "Contact support", href: "mailto:support@qbite.dev" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-outline-variant bg-surface-container-low/40">
      <div className="mx-auto w-full max-w-content px-margin-mobile py-xl md:px-margin-desktop">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="flex flex-col gap-4">
            <Wordmark />
            <p className="measure-sm text-body-sm text-on-surface-variant">
              QR ordering, a live kitchen display and honest numbers — for
              restaurants that would rather cook than chase tickets.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <h2 className="mb-3 font-label-bold text-label-bold uppercase text-on-surface">
                {column.heading}
              </h2>
              <ul className="space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="rounded text-body-sm text-on-surface-variant transition-colors duration-fast hover:text-on-surface"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-xl flex flex-col items-center justify-between gap-3 border-t border-outline-variant pt-6 sm:flex-row">
          <p className="text-body-sm text-on-surface-variant">
            © {new Date().getFullYear()} QBite. All rights reserved.
          </p>
          <p className="flex items-center gap-2 text-body-sm text-on-surface-variant">
            <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
            All systems operational
          </p>
        </div>
      </div>
    </footer>
  );
}
