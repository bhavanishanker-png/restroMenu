import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/motion/Reveal";
import { Section, SectionHeading } from "./Section";

const INCLUDED = [
  "Unlimited tables and QR codes",
  "Unlimited menu items and add-ons",
  "Kitchen display with offline queue",
  "Realtime order tracking for guests",
  "Group ordering on one bill",
  "Sales, peak-hour and top-item reports",
  "Role-based staff accounts",
  "AI menu import",
];

export function Pricing() {
  return (
    <Section id="pricing">
      <SectionHeading
        eyebrow="Pricing"
        title="One rate. No tiers to outgrow."
        description="You pay when a guest pays. If nobody orders, you owe nothing."
      />

      <Reveal className="mx-auto mt-xl max-w-3xl">
        <div className="edge-light relative overflow-hidden rounded-3xl border border-outline-variant bg-surface-container-lowest shadow-level-3">
          {/* Accent bloom, clipped by the card. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-brand/20 blur-[100px]"
          />

          <div className="relative grid gap-8 p-8 md:grid-cols-[auto_1fr] md:gap-10 md:p-10">
            <div className="md:border-r md:border-outline-variant md:pr-10">
              <span className="font-label-bold text-label-bold uppercase text-brand-text">
                Pay as you go
              </span>
              <p className="mt-3 flex items-baseline gap-1">
                <span className="tabular font-display text-display-lg text-on-surface">1.5</span>
                <span className="font-display text-headline-md text-on-surface-variant">%</span>
              </p>
              <p className="text-body-sm text-on-surface-variant">per successful order</p>

              <Button asChild variant="brand" size="lg" className="mt-6 w-full">
                <Link href="/login">Start free trial</Link>
              </Button>
              <p className="mt-3 text-center text-body-sm text-on-surface-variant">
                No card required to set up
              </p>
            </div>

            <div>
              <p className="mb-4 font-display text-title text-on-surface">
                Everything is included
              </p>
              <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {INCLUDED.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-body-sm text-on-surface-variant">
                    <Check
                      className="mt-0.5 h-4 w-4 shrink-0 text-brand-text"
                      aria-hidden="true"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}
