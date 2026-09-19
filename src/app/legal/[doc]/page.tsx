import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { Button } from "@/components/ui/button";

/**
 * The footer links to Terms and Privacy, so these routes have to exist — a
 * dead link in a footer is worse than no link at all.
 *
 * The content is deliberately a placeholder: writing binding legal text is not
 * something to improvise. The page states plainly that it is unpublished and
 * points at a real contact address, rather than presenting invented terms as
 * if they were in force.
 */

const DOCS = {
  terms: {
    title: "Terms of Service",
    summary:
      "The agreement between QBite and the restaurants using it — covering accounts, payments, acceptable use and liability.",
  },
  privacy: {
    title: "Privacy Policy",
    summary:
      "What we collect from restaurants and their guests, why we collect it, how long we keep it, and who it is shared with.",
  },
} as const;

type Doc = keyof typeof DOCS;

function isDoc(value: string): value is Doc {
  return value in DOCS;
}

export function generateStaticParams() {
  return Object.keys(DOCS).map((doc) => ({ doc }));
}

export function generateMetadata({ params }: { params: { doc: string } }): Metadata {
  if (!isDoc(params.doc)) return { title: "Not found" };
  return { title: DOCS[params.doc].title, robots: { index: false } };
}

export default function LegalPage({ params }: { params: { doc: string } }) {
  if (!isDoc(params.doc)) notFound();
  const doc = DOCS[params.doc];

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-content px-margin-mobile pb-2xl pt-36 md:px-margin-desktop">
        <p className="font-label-bold text-label-bold uppercase text-brand-text">Legal</p>
        <h1 className="mt-3 font-display text-display text-on-surface">{doc.title}</h1>
        <p className="mt-4 measure text-body-lg text-on-surface-variant">{doc.summary}</p>

        <div className="mt-lg rounded-xl border border-warning/25 bg-warning-container p-6">
          <h2 className="font-display text-title text-on-warning-container">
            Not yet published
          </h2>
          <p className="mt-2 measure text-body-sm text-on-warning-container">
            This document has not been finalised. Nothing on this page is in
            force, and it should not be relied on as the agreement between you
            and QBite. Ask us for the current terms before signing up.
          </p>
        </div>

        <div className="mt-lg flex flex-wrap gap-3">
          <Button asChild variant="brand">
            <a href="mailto:support@qbite.dev">Request the current document</a>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Back to home</Link>
          </Button>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
