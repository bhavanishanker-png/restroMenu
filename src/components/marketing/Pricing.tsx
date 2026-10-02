"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Infinity as InfinityIcon } from "lucide-react";
import { SpotlightCard } from "@/components/aceternity/SpotlightCard";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/motion/Reveal";
import { Section, SectionHeading } from "./Section";
import { cn } from "@/lib/utils";

type Billing = "monthly" | "annual";

/** `"unlimited"` renders as an ∞ icon with a spoken label, so the strip stays narrow. */
type PlanLimit = { label: string; value: string | "unlimited" };

type Plan = {
  id: string;
  name: string;
  /** Material Symbols name. */
  icon: string;
  /** Who the plan is for — fills the slot the "Most popular" badge takes. */
  audience: string;
  blurb: string;
  /**
   * Both figures are stored, never derived. Deliberately no arithmetic here —
   * all pricing math in this codebase lives in `src/lib/pricing.ts`, and these
   * are published prices rather than a calculation.
   */
  price: { monthly: number; annual: number } | "custom";
  /** Shown under the price on the annual plan. */
  annualNote?: string;
  cta: string;
  href: string;
  featured?: boolean;
  featuresLabel: string;
  features: string[];
  /** Pinned to the card's foot so all three cards end on the same line. */
  limits: PlanLimit[];
};

const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    icon: "storefront",
    audience: "Cafés, kiosks and food trucks",
    blurb: "One room, one menu, up and running this week.",
    price: { monthly: 999, annual: 833 },
    annualNote: "₹9,990 billed yearly",
    cta: "Start free trial",
    href: "/login",
    featuresLabel: "Includes",
    features: [
      "1 outlet, up to 10 tables",
      "QR ordering and live menu",
      "UPI and card payments",
      "Realtime order tracking for guests",
      "Daily sales summary",
      "2 staff accounts",
    ],
    limits: [
      { label: "Outlets", value: "1" },
      { label: "Tables", value: "10" },
      { label: "Staff", value: "2" },
    ],
  },
  {
    id: "growth",
    name: "Growth",
    icon: "restaurant",
    audience: "Full-service restaurants",
    blurb: "The full system, for a restaurant running real service.",
    price: { monthly: 2499, annual: 2082 },
    annualNote: "₹24,990 billed yearly",
    cta: "Start free trial",
    href: "/login",
    featured: true,
    featuresLabel: "Everything in Starter, plus",
    features: [
      "Unlimited tables and QR codes",
      "Kitchen display with offline queue",
      "Group ordering on one bill",
      "AI menu import from a photo or PDF",
      "Peak-hour and top-item reports",
      "Unlimited staff with role controls",
      "Printable QR standee packs",
    ],
    limits: [
      { label: "Outlets", value: "1" },
      { label: "Tables", value: "unlimited" },
      { label: "Staff", value: "unlimited" },
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    icon: "domain",
    audience: "Chains and multi-outlet groups",
    blurb: "Several outlets, one set of numbers.",
    price: "custom",
    cta: "Talk to us",
    href: "mailto:sales@qbite.dev",
    featuresLabel: "Everything in Growth, plus",
    features: [
      "Multiple outlets on one dashboard",
      "Consolidated cross-outlet reporting",
      "Priority support with an SLA",
      "Guided onboarding and menu setup",
    ],
    limits: [
      { label: "Outlets", value: "unlimited" },
      { label: "Tables", value: "unlimited" },
      { label: "Staff", value: "unlimited" },
    ],
  },
];

const ASSURANCES = [
  {
    icon: "event_available",
    title: "14-day free trial",
    body: "Every feature on the plan, from the first service.",
  },
  {
    icon: "devices",
    title: "No hardware to buy",
    body: "Runs on the phones and tablets you already own.",
  },
  {
    icon: "sync_alt",
    title: "Switch or cancel anytime",
    body: "Upgrade, downgrade or leave — no lock-in contract.",
  },
];

function formatPrice(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

function LimitValue({ value }: { value: PlanLimit["value"] }) {
  if (value !== "unlimited") return <>{value}</>;
  return (
    <>
      <InfinityIcon className="h-[1em] w-[1.3em]" strokeWidth={2.25} aria-hidden="true" />
      <span className="sr-only">Unlimited</span>
    </>
  );
}

export function Pricing() {
  const [billing, setBilling] = useState<Billing>("monthly");
  const groupId = useId();

  return (
    <Section id="pricing">
      <SectionHeading
        eyebrow="Pricing"
        title="Pick a plan, not a percentage"
        description="A flat monthly fee, whatever you turn over. Every plan includes a 14-day trial and no setup cost."
      />

      {/* Billing toggle. A radiogroup rather than two aria-pressed buttons:
          the two options are mutually exclusive, and this gives arrow-key
          navigation and a single tab stop for free. */}
      <Reveal className="mt-8 flex justify-center">
        <div
          role="radiogroup"
          aria-label="Billing period"
          className="inline-flex items-center gap-1 rounded-full border border-outline-variant bg-surface-container-low p-1"
        >
          {(
            [
              { value: "monthly", label: "Monthly" },
              { value: "annual", label: "Annual" },
            ] as const
          ).map((option) => {
            const active = billing === option.value;
            return (
              <button
                key={option.value}
                role="radio"
                aria-checked={active}
                id={`${groupId}-${option.value}`}
                onClick={() => setBilling(option.value)}
                className={cn(
                  "flex min-h-[40px] items-center gap-2 rounded-full px-4 text-body-sm font-medium",
                  "transition-[background-color,color,box-shadow] duration-fast ease-out-quart",
                  active
                    ? "bg-brand text-brand-foreground shadow-glow"
                    : "text-on-surface-variant hover:text-on-surface"
                )}
              >
                {option.label}
                {option.value === "annual" && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
                      // Neutral rather than success-green: in this system
                      // green means "ready/veg", and a discount badge is not
                      // a status. The accent already marks the active option.
                      active
                        ? "bg-brand-foreground/20 text-brand-foreground"
                        : "bg-surface-container-high text-on-surface"
                    )}
                  >
                    2 months free
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Reveal>

      <div className="mt-xl grid grid-cols-1 gap-5 lg:grid-cols-3">
        {PLANS.map((plan, i) => (
          <Reveal key={plan.id} delay={i * 0.06} className="h-full">
            <SpotlightCard
              className={cn(
                "edge-light h-full",
                plan.featured && "border-brand-border shadow-level-3 hover:border-brand-border"
              )}
            >
              {plan.featured && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-brand/20 blur-[80px]"
                />
              )}

              <div className="relative flex h-full flex-col p-6">
                <div className="flex items-start justify-between gap-3">
                  <span
                    className={cn(
                      "grid h-11 w-11 place-items-center rounded-xl border transition-colors duration-base",
                      plan.featured
                        ? "border-brand-border bg-brand-subtle text-brand-text"
                        : "border-outline-variant bg-surface-container text-on-surface group-hover/spot:border-brand/40 group-hover/spot:text-brand-text"
                    )}
                    aria-hidden="true"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
                      {plan.icon}
                    </span>
                  </span>
                  {/* Emphasis is carried by the badge, the border and the
                      shadow — not colour alone. */}
                  {plan.featured && (
                    <span className="rounded-full bg-brand px-2.5 py-1 font-label-bold text-label-bold uppercase text-brand-foreground">
                      Most popular
                    </span>
                  )}
                </div>

                <h3 className="mt-4 font-display text-headline-sm text-on-surface">{plan.name}</h3>
                <p className="mt-0.5 font-label-bold text-label-bold uppercase text-brand-text">
                  {plan.audience}
                </p>
                <p className="mt-2 measure-sm text-body-sm text-on-surface-variant">
                  {plan.blurb}
                </p>

                <div className="mt-5 flex min-h-[72px] flex-col justify-center">
                  {plan.price === "custom" ? (
                    <>
                      <p className="font-display text-display text-on-surface">Custom</p>
                      <p className="text-body-sm text-on-surface-variant">
                        Priced on outlets and volume
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="flex items-baseline gap-1.5">
                        <span className="tabular font-display text-display text-on-surface">
                          {formatPrice(plan.price[billing])}
                        </span>
                        <span className="text-body-sm text-on-surface-variant">
                          /month + GST
                        </span>
                      </p>
                      <p className="text-body-sm text-on-surface-variant">
                        {billing === "annual" ? plan.annualNote : "Billed monthly, cancel anytime"}
                      </p>
                    </>
                  )}
                </div>

                <Button
                  asChild
                  size="lg"
                  variant={plan.featured ? "brand" : "outline"}
                  className="mt-5 w-full"
                >
                  <Link href={plan.href}>{plan.cta}</Link>
                </Button>

                <div className="mt-6 border-t border-outline-variant pt-5">
                  <p className="mb-3 font-label-bold text-label-bold uppercase text-on-surface-variant">
                    {plan.featuresLabel}
                  </p>
                  <ul className="space-y-2.5">
                    {plan.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-start gap-2.5 text-body-sm text-on-surface-variant"
                      >
                        <Check
                          className="mt-0.5 h-4 w-4 shrink-0 text-brand-text"
                          aria-hidden="true"
                        />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* The spacer pins the strip to the foot, absorbing the height
                    difference between short and long feature lists. */}
                <div aria-hidden="true" className="min-h-6 flex-1" />
                <dl className="grid grid-cols-3 divide-x divide-outline-variant rounded-xl border border-outline-variant bg-surface-container-low/60 text-center">
                  {plan.limits.map((limit) => (
                    <div key={limit.label} className="flex flex-col-reverse gap-0.5 px-2 py-3">
                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
                        {limit.label}
                      </dt>
                      <dd className="tabular flex h-8 items-center justify-center font-display text-headline-sm text-on-surface">
                        <LimitValue value={limit.value} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </SpotlightCard>
          </Reveal>
        ))}
      </div>

      <Reveal className="mt-xl">
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-outline-variant bg-outline-variant md:grid-cols-4">
          {ASSURANCES.map((item) => (
            <div key={item.title} className="flex items-start gap-3 bg-surface-container-lowest p-5">
              <span
                className="material-symbols-outlined mt-0.5 text-brand-text"
                style={{ fontSize: 22 }}
                aria-hidden="true"
              >
                {item.icon}
              </span>
              <div>
                <p className="text-body-md font-semibold text-on-surface">{item.title}</p>
                <p className="mt-0.5 text-body-sm text-on-surface-variant">{item.body}</p>
              </div>
            </div>
          ))}
          <Link
            href="mailto:sales@qbite.dev"
            className="group flex min-h-[44px] items-center justify-between gap-3 bg-brand-subtle p-5 transition-colors duration-base hover:bg-brand/15"
          >
            <span>
              <span className="block text-body-md font-semibold text-on-surface">
                Not sure which fits?
              </span>
              <span className="mt-0.5 block text-body-sm text-on-surface-variant">
                Tell us your covers and tables — we&apos;ll recommend one.
              </span>
            </span>
            <ArrowRight
              className="h-5 w-5 shrink-0 text-brand-text transition-transform duration-fast ease-out-quart group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
        </div>
      </Reveal>
    </Section>
  );
}
