"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { MenuCategoryWithItems } from "@/types";

type Props = {
  categories: MenuCategoryWithItems[];
};

export function CategoryTabs({ categories }: Props) {
  const [activeId, setActiveId] = useState(categories[0]?.id ?? "");
  const tabsRef = useRef<HTMLDivElement>(null);
  // Prevent the observer from fighting with a manual tab click
  const manualScrollRef = useRef(false);

  // When a filter removes the active category, fall back to the first one so
  // the bar never shows nothing selected.
  useEffect(() => {
    if (categories.length === 0) return;
    if (!categories.some((c) => c.id === activeId)) setActiveId(categories[0].id);
  }, [categories, activeId]);

  // Scroll-spy via IntersectionObserver
  useEffect(() => {
    if (categories.length === 0) return;

    // IntersectionObserver only reports sections whose state *changed*. The
    // old callback picked from that batch alone, so a section that was already
    // inside the band (e.g. Starters' tail, after a tab jump to Main Course)
    // never re-reported when the guest scrolled back up — the bar stayed stuck
    // on the wrong tab. Track the full in-band set and pick the first section
    // in menu order instead.
    const inBand = new Set<string>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = e.target.id.replace("cat-", "");
          if (e.isIntersecting) inBand.add(id);
          else inBand.delete(id);
        }
        if (manualScrollRef.current) return;
        const first = categories.find((c) => inBand.has(c.id));
        if (first) setActiveId(first.id);
      },
      {
        // The sticky chrome (header + search + chips + tabs) covers roughly
        // the top quarter of a phone screen, so the "reading line" is a thin
        // band just beneath it.
        rootMargin: "-26% 0px -66% 0px",
        threshold: 0,
      }
    );

    categories.forEach((cat) => {
      const el = document.getElementById(`cat-${cat.id}`);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [categories]);

  // Keep the active tab in view. Scrolls only the tab strip — scrollIntoView
  // would also nudge the page vertically on some mobile browsers.
  useEffect(() => {
    const strip = tabsRef.current;
    const tab = strip?.querySelector<HTMLElement>(`[data-catid="${activeId}"]`);
    if (!strip || !tab) return;
    const left = tab.offsetLeft - (strip.clientWidth - tab.offsetWidth) / 2;
    strip.scrollTo({ left, behavior: "smooth" });
  }, [activeId]);

  function handleTabClick(catId: string) {
    setActiveId(catId);
    manualScrollRef.current = true;
    document.getElementById(`cat-${catId}`)?.scrollIntoView({ behavior: "smooth" });
    // Re-enable observer after scroll settles
    setTimeout(() => {
      manualScrollRef.current = false;
    }, 800);
  }

  if (categories.length === 0) return null;

  return (
    <div
      ref={tabsRef}
      role="tablist"
      aria-label="Menu categories"
      className="relative flex overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {categories.map((cat) => {
        const active = activeId === cat.id;
        return (
          <button
            key={cat.id}
            type="button"
            role="tab"
            aria-selected={active}
            data-catid={cat.id}
            onClick={() => handleTabClick(cat.id)}
            // A sliding `layoutId` indicator was tempting here, but it was the
            // only thing pulling Framer Motion onto the customer menu — ~46kB
            // for one transition, on the screen with the strictest load budget
            // in the app. The underline is plain CSS.
            //
            // Active is signalled three ways: weight, colour and the underline
            // bar — never colour alone.
            className={cn(
              "relative flex min-h-[44px] shrink-0 items-center gap-1.5 px-2.5 text-[0.9375rem]",
              "transition-colors duration-base ease-out-quart",
              active
                ? "font-semibold text-on-surface"
                : "font-medium text-on-surface-variant hover:text-on-surface"
            )}
          >
            {cat.name}
            <span
              className={cn(
                "tabular rounded-full px-1.5 text-[0.6875rem] font-semibold leading-[1.125rem]",
                active ? "bg-brand text-brand-foreground" : "bg-surface-container-high text-on-surface-variant"
              )}
            >
              {cat.items.length}
            </span>
            <span
              aria-hidden="true"
              className={cn(
                "absolute inset-x-2.5 bottom-0 h-[3px] rounded-t-full bg-brand transition-transform duration-base ease-out-quart",
                active ? "scale-x-100" : "scale-x-0"
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
