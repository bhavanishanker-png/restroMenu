import { Reveal } from "@/components/motion/Reveal";
import { Section, SectionHeading } from "./Section";

const FAQS = [
  {
    q: "Do guests have to download anything?",
    a: "No. The menu is a web page — scanning the QR opens it in whatever browser the phone already has. There is no app and no customer account to create.",
  },
  {
    q: "What happens if the kitchen tablet loses Wi-Fi?",
    a: "Status changes are applied immediately on screen and queued locally. A banner shows how many are pending, and everything syncs the moment the connection returns.",
  },
  {
    q: "Can several people at one table order together?",
    a: "Yes. One guest starts a group order and shares a short code; everyone else joins it, and all the items land on a single bill.",
  },
  {
    q: "How are prices calculated?",
    a: "Always on the server. The total is recomputed from the item IDs in the request, so variants, add-ons, per-item tax, service and packing charges are consistent — and a manipulated total sent from a browser is ignored.",
  },
  {
    q: "What if I already have a printed menu?",
    a: "Photograph it or upload the PDF. The AI import returns structured categories, items, prices and veg markers for you to review before anything goes live.",
  },
  {
    q: "Can I keep taking orders the old way too?",
    a: "Yes. Staff can place and manage orders from the dashboard, so QR ordering can run alongside table service rather than replacing it on day one.",
  },
  {
    q: "What happens at the end of the trial, or if I cancel?",
    a: "The trial is 14 days and needs no card, so nothing is charged unless you choose a plan. Cancelling stops the next renewal and keeps your account readable to the end of the period you've paid for — your menu, orders and reports stay exportable.",
  },
];

/**
 * Native `<details>` rather than a JS accordion: keyboard support, Find-in-page
 * expansion and screen-reader semantics all come for free, and it costs no
 * JavaScript. The chevron rotation is CSS on `[open]`.
 */
export function Faq() {
  return (
    <Section id="faq" className="border-t border-outline-variant">
      <div className="grid gap-xl lg:grid-cols-[0.8fr_1.2fr]">
        <SectionHeading
          align="left"
          eyebrow="FAQ"
          title="Questions worth asking"
          description="If yours isn't here, the team answers directly."
        />

        <Reveal className="divide-y divide-outline-variant border-y border-outline-variant">
          {FAQS.map((faq) => (
            <details key={faq.q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg text-left font-display text-title text-on-surface transition-colors hover:text-brand-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background [&::-webkit-details-marker]:hidden">
                {faq.q}
                <span
                  className="material-symbols-outlined shrink-0 text-on-surface-variant transition-transform duration-base ease-out-quart group-open:rotate-180"
                  style={{ fontSize: 20 }}
                  aria-hidden="true"
                >
                  expand_more
                </span>
              </summary>
              <p className="measure pr-8 pt-3 text-body-sm text-on-surface-variant">
                {faq.a}
              </p>
            </details>
          ))}
        </Reveal>
      </div>
    </Section>
  );
}
