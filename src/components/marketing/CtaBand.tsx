import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Aurora } from "@/components/aceternity/Aurora";
import { Reveal } from "@/components/motion/Reveal";
import { Section } from "./Section";

export function CtaBand() {
  return (
    <Section>
      <Reveal>
        <div className="grain edge-light relative overflow-hidden rounded-3xl border border-outline-variant bg-surface-container-low px-6 py-xl text-center shadow-level-3 md:px-xl">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="absolute inset-0 bg-dot-grid mask-radial opacity-70" />
            <Aurora />
          </div>

          <div className="relative z-10 mx-auto flex max-w-2xl flex-col items-center gap-6">
            <h2 className="font-display text-display text-on-surface">
              Put your next service on QBite
            </h2>
            <p className="measure text-body-lg text-on-surface-variant">
              Set up your tables, import your menu and print your codes today.
              You only pay once guests start ordering.
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
          </div>
        </div>
      </Reveal>
    </Section>
  );
}
