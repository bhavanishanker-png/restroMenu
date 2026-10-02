import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InteractiveGrid } from "@/components/aceternity/InteractiveGrid";
import { Reveal } from "@/components/motion/Reveal";
import { Section } from "./Section";

/** The three things the copy promises can be done today, in order. */
const SETUP_STEPS = [
  { icon: "table_restaurant", title: "Add your tables", body: "Name them how your staff do" },
  { icon: "auto_awesome", title: "Import your menu", body: "From a photo or a PDF" },
  { icon: "qr_code_2", title: "Print your codes", body: "One per table, ready to stand" },
];

export function CtaBand() {
  return (
    <Section>
      <Reveal>
        <div className="grain edge-light relative overflow-hidden rounded-3xl border border-outline-variant bg-surface-container-low px-6 py-xl text-center shadow-level-3 md:px-xl">
          <InteractiveGrid scope="parent" />

          <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center gap-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-outline-variant bg-surface-container-lowest/80 px-3 py-1 font-label-bold text-label-bold uppercase text-on-surface-variant backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" />
              Live by tonight
            </span>
            <h2 className="font-display text-display text-on-surface">
              Put your next service on QBite
            </h2>
            <p className="measure text-body-lg text-on-surface-variant">
              Set up your tables, import your menu and print your codes today.
              Free for 14 days, no card and no hardware to buy.
            </p>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Button asChild variant="brand" size="xl" className="group w-full sm:w-auto">
                <Link href="/login">
                  Start free trial
                  <ArrowRight className="transition-transform duration-fast ease-out-quart group-hover:translate-x-0.5" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="xl" className="w-full sm:w-auto">
                <Link href="#pricing">See pricing</Link>
              </Button>
            </div>

            <ol className="mt-4 grid w-full grid-cols-1 gap-3 text-left sm:grid-cols-3">
              {SETUP_STEPS.map((step, i) => (
                <li
                  key={step.title}
                  className="flex items-center gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest/80 p-4 shadow-level-1 backdrop-blur"
                >
                  <span
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-brand-border bg-brand-subtle text-brand-text"
                    aria-hidden="true"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
                      {step.icon}
                    </span>
                  </span>
                  <span>
                    <span className="block font-mono text-[11px] font-bold text-brand-text">
                      STEP {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="block text-body-md font-semibold text-on-surface">
                      {step.title}
                    </span>
                    <span className="block text-body-sm text-on-surface-variant">{step.body}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}
