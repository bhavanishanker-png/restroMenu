import { RevealGroup, RevealItem } from "@/components/motion/Reveal";
import { Section, SectionHeading } from "./Section";

const STEPS = [
  {
    n: "01",
    title: "Print your QR codes",
    body: "Add your tables and download a print-ready PDF. Each code carries its own token, generated with crypto.randomUUID — never a sequential number anyone could guess.",
  },
  {
    n: "02",
    title: "Guests order themselves",
    body: "They scan, browse the live menu, build a cart and pay. Several people at one table can join the same bill with a share code.",
  },
  {
    n: "03",
    title: "The kitchen just cooks",
    body: "Tickets arrive on a tablet built to be read from three feet away. One button per card advances the order; the guest's tracker updates itself.",
  },
];

export function HowItWorks() {
  return (
    <Section id="how-it-works" className="border-y border-outline-variant bg-surface-container-low/30">
      <SectionHeading
        eyebrow="How it works"
        title="Live by the end of one service"
        description="No hardware to buy, no POS to rip out, no training day."
      />

      <RevealGroup as="ol" className="mt-xl grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-6">
        {STEPS.map((step, i) => (
          <RevealItem as="li" key={step.n} className="relative">
            {/* Connector between steps, desktop only. Decorative, so it is
                hidden from assistive tech and dropped on small screens where
                the list is already vertical. */}
            {i < STEPS.length - 1 && (
              <span
                aria-hidden="true"
                className="absolute left-14 right-[-1.5rem] top-5 hidden h-px bg-gradient-to-r from-outline-variant to-transparent md:block"
              />
            )}

            <span className="tabular mb-4 grid h-10 w-10 place-items-center rounded-xl border border-brand-border bg-brand-subtle font-mono text-sm font-bold text-brand-text">
              {step.n}
            </span>
            <h3 className="font-display text-headline-sm text-on-surface">{step.title}</h3>
            <p className="mt-2 measure text-body-sm text-on-surface-variant">{step.body}</p>
          </RevealItem>
        ))}
      </RevealGroup>
    </Section>
  );
}
