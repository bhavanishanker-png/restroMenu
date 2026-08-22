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

  // Scroll-spy via IntersectionObserver
  useEffect(() => {
    if (categories.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (manualScrollRef.current) return;
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          const id = visible[0].target.id.replace("cat-", "");
          setActiveId(id);
        }
      },
      {
        // trigger when section header enters the top quarter of the viewport
        rootMargin: "-10% 0px -75% 0px",
        threshold: 0,
      }
    );

    categories.forEach((cat) => {
      const el = document.getElementById(`cat-${cat.id}`);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [categories]);

  // Auto-centre the active tab pill
  useEffect(() => {
    const activeTab = tabsRef.current?.querySelector<HTMLElement>(
      `[data-catid="${activeId}"]`
    );
    activeTab?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
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
      className="flex gap-2 overflow-x-auto px-4 py-2 scrollbar-none"
    >
      {categories.map((cat) => (
        <button
          key={cat.id}
          role="tab"
          aria-selected={activeId === cat.id}
          data-catid={cat.id}
          onClick={() => handleTabClick(cat.id)}
          className={cn(
            "shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C]",
            activeId === cat.id
              ? "bg-[#C2410C] text-white"
              : "bg-stone-100 text-stone-600 hover:bg-stone-200"
          )}
        >
          {cat.name}
        </button>
      ))}
    </div>
  );
}
