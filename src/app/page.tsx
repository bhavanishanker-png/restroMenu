import type { Metadata } from "next";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { Hero } from "@/components/marketing/Hero";
import { BuiltOnStrip } from "@/components/marketing/BuiltOnStrip";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { Pricing } from "@/components/marketing/Pricing";
import { Faq } from "@/components/marketing/Faq";
import { CtaBand } from "@/components/marketing/CtaBand";
import { SiteFooter } from "@/components/marketing/SiteFooter";

export const metadata: Metadata = {
  title: "QBite — QR ordering and kitchen display for restaurants",
  description:
    "Guests scan the QR on their table, order and pay without waiting. Your kitchen sees every ticket instantly, and you see what actually sold.",
};

export default function HomePage() {
  return (
    <>
      <SiteHeader />

      {/* A skip link is the one thing a fixed header makes mandatory: without
          it, keyboard users tab through the whole nav on every page. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-brand-foreground"
      >
        Skip to content
      </a>

      <main id="main">
        <Hero />
        <BuiltOnStrip />
        <FeatureGrid />
        <HowItWorks />
        <Pricing />
        <Faq />
        <CtaBand />
      </main>

      <SiteFooter />
    </>
  );
}
