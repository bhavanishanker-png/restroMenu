import Link from "next/link";
import { ArrowRight, QrCode } from "lucide-react";
import { Aurora } from "@/components/aceternity/Aurora";
import { Spotlight } from "@/components/aceternity/Spotlight";
import { Button } from "@/components/ui/button";
import { ProductPreview } from "./ProductPreview";

/**
 * Server component. The only motion is CSS, and the headline is plain text
 * that paints on the first frame — a JS-driven entrance on the h1 would delay
 * the largest contentful paint to make the page feel *slower* in exchange for
 * a flourish nobody asked for. Supporting elements fade up underneath it via
 * staggered animation delays.
 */
export function Hero() {
  return (
    <section className="grain relative overflow-hidden pb-2xl pt-28 md:pb-3xl md:pt-36">
      {/* Backdrop */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-line-grid mask-radial opacity-60" />
        <Aurora />
        <Spotlight className="-top-40 left-0 md:-top-20 md:left-60" />
      </div>

      <div className="relative z-10 mx-auto grid w-full max-w-content grid-cols-1 items-center gap-2xl px-margin-mobile md:px-margin-desktop lg:grid-cols-[1.05fr_1fr] lg:gap-xl">
        {/* Copy */}
        <div className="flex flex-col items-start gap-6">
          <span
            className="animate-fade-up opacity-0 inline-flex items-center gap-2 rounded-full border border-outline-variant bg-surface-container-low/80 py-1 pl-1 pr-3 backdrop-blur"
            style={{ animationDelay: "40ms" }}
          >
            <span className="rounded-full bg-brand px-2 py-0.5 font-label-bold text-label-bold uppercase text-brand-foreground">
              New
            </span>
            <span className="text-body-sm text-on-surface-variant">
              AI menu import — photograph a menu, get a live one
            </span>
          </span>

          <h1 className="font-display text-display-xl text-on-surface">
            Your restaurant,{" "}
            <span className="text-gradient-brand">running itself</span>{" "}
            from the table up.
          </h1>

          <p
            className="animate-fade-up opacity-0 measure text-body-lg text-on-surface-variant"
            style={{ animationDelay: "90ms" }}
          >
            Guests scan the QR on their table, order and pay without waiting for
            anyone. Your kitchen sees every ticket the moment it lands. You see
            what sold, when, and what to cook more of.
          </p>

          <div
            className="animate-fade-up opacity-0 flex w-full flex-col gap-3 sm:w-auto sm:flex-row"
            style={{ animationDelay: "140ms" }}
          >
            <Button asChild variant="brand" size="xl" className="group w-full sm:w-auto">
              <Link href="/login">
                Start free trial
                <ArrowRight className="transition-transform duration-fast ease-out-quart group-hover:translate-x-0.5" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="xl" className="w-full sm:w-auto">
              <Link href="#how-it-works">
                <QrCode />
                See how it works
              </Link>
            </Button>
          </div>

          {/* Product facts, not invented social proof. */}
          <ul
            className="animate-fade-up opacity-0 flex flex-wrap items-center gap-x-5 gap-y-2 pt-2 text-body-sm text-on-surface-variant"
            style={{ animationDelay: "190ms" }}
          >
            {[
              "No app download",
              "No customer login",
              "Works offline in the kitchen",
            ].map((fact) => (
              <li key={fact} className="flex items-center gap-2">
                <span
                  className="material-symbols-outlined text-brand-text"
                  style={{ fontSize: 16, fontVariationSettings: "'FILL' 1" }}
                  aria-hidden="true"
                >
                  check_circle
                </span>
                {fact}
              </li>
            ))}
          </ul>
        </div>

        {/* Visual */}
        <div
          className="animate-fade-up opacity-0 pb-10 lg:pb-0"
          style={{ animationDelay: "240ms" }}
        >
          <ProductPreview />
        </div>
      </div>
    </section>
  );
}
