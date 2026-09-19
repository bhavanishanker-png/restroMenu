import { SpotlightCard } from "@/components/aceternity/SpotlightCard";
import { RevealGroup, RevealItem } from "@/components/motion/Reveal";
import { Section, SectionHeading } from "./Section";

type Feature = {
  icon: string;
  title: string;
  body: string;
  /** Bento span. Only two features earn the wide slot. */
  span?: string;
};

const FEATURES: Feature[] = [
  {
    icon: "qr_code_scanner",
    title: "Order from the table",
    body: "A QR per table opens the live menu — no app, no sign-up, no waiting to catch someone's eye. Variants, add-ons and cooking notes all come through.",
    span: "md:col-span-2",
  },
  {
    icon: "bolt",
    title: "Tickets land instantly",
    body: "Orders appear on the kitchen display the moment they're placed, and status changes sync back to the guest in real time.",
  },
  {
    icon: "payments",
    title: "Paid before they stand up",
    body: "Razorpay handles UPI and cards; the webhook is signature-verified before any payment state moves.",
  },
  {
    icon: "auto_awesome",
    title: "Menu from a photograph",
    body: "Upload a photo or PDF of your existing menu and it comes back structured — categories, prices, veg markers — ready to edit.",
    span: "md:col-span-2",
  },
  {
    icon: "monitoring",
    title: "Know what actually sells",
    body: "Revenue by day, peak hours and top items, so you stock and staff against what happened rather than what you remember.",
    span: "md:col-span-3",
  },
];
// Spans per row must total 3, or the grid leaves a hole: 2+1, 1+2, 3.

export function FeatureGrid() {
  return (
    <Section id="features">
      <SectionHeading
        eyebrow="Features"
        title="Everything a service needs, in one system"
        description="Front of house, back of house and the books — built to work together instead of three tools you reconcile at midnight."
      />

      <RevealGroup className="mt-xl grid grid-cols-1 gap-4 md:grid-cols-3">
        {FEATURES.map((feature) => (
          <RevealItem key={feature.title} className={feature.span}>
            <SpotlightCard as="article" className="h-full p-6">
              <span
                className="mb-4 grid h-11 w-11 place-items-center rounded-xl border border-outline-variant bg-surface-container text-on-surface transition-colors duration-base group-hover/spot:border-brand/40 group-hover/spot:text-brand-text"
                aria-hidden="true"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
                  {feature.icon}
                </span>
              </span>
              <h3 className="font-display text-headline-sm text-on-surface">
                {feature.title}
              </h3>
              <p className="mt-2 measure text-body-sm text-on-surface-variant">
                {feature.body}
              </p>
            </SpotlightCard>
          </RevealItem>
        ))}
      </RevealGroup>
    </Section>
  );
}
