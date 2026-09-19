"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/motion/Reveal";
import { Section, SectionHeading } from "./Section";
import { cn } from "@/lib/utils";

type Billing = "monthly" | "annual";

type Plan = {
  id: string;
  name: string;
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
};

const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
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
  },
  {
    id: "growth",
    name: "Growth",
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
  },
  {
    id: "enterprise",
    name: "Enterprise",
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
  },
];

function formatPrice(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
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

      <div className="mt-xl grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
        {PLANS.map((plan, i) => (
          <Reveal key={plan.id} delay={i * 0.06} className="h-full">
            <div
              className={cn(
                "edge-light relative flex h-full flex-col overflow-hidden rounded-2xl border p-6",
                plan.featured
                  ? "border-brand-border bg-surface-container-lowest shadow-level-3 lg:-mt-3 lg:pb-8 lg:pt-8"
                  : "border-outline-variant bg-surface-container-lowest shadow-level-1"
              )}
            >
              {plan.featured && (
                <>
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-brand/20 blur-[80px]"
                  />
                  {/* Emphasis is carried by the badge, the border and the
                      raised position — not colour alone. */}
                  <span className="relative mb-3 w-fit rounded-full bg-brand px-2.5 py-1 font-label-bold text-label-bold uppercase text-brand-foreground">
                    Most popular
                  </span>
                </>
              )}

              {/* Reserves the badge's height in the other two cards so plan
                  names, prices and CTAs line up across the row. Only from lg,
                  where the cards actually sit side by side. */}
              {!plan.featured && (
                <span aria-hidden="true" className="mb-3 hidden h-[25px] lg:block" />
              )}

              <div className="relative">
                <h3 className="font-display text-headline-sm text-on-surface">{plan.name}</h3>
                <p className="mt-1 measure-sm text-body-sm text-on-surface-variant">
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
              </div>

              <div className="relative mt-6 border-t border-outline-variant pt-5">
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
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-body-sm text-on-surface-variant">
        {[
          "14-day free trial",
          "No setup or hardware cost",
          "Cancel or switch plans anytime",
        ].map((item) => (
          <span key={item} className="flex items-center gap-2">
            <Check className="h-4 w-4 text-brand-text" aria-hidden="true" />
            {item}
          </span>
        ))}
      </Reveal>
    </Section>
  );
}
