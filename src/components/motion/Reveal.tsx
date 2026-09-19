"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Scroll-triggered entrance. The house easing is `out-expo` at 150–450ms —
 * fast enough that content never feels withheld.
 *
 * `once` is on by default: re-animating on every scroll-back is distracting and
 * makes a page feel unstable. `amount: 0.25` fires when a quarter of the
 * element is visible, which avoids tall sections animating too late.
 *
 * Reduced motion is handled here rather than by a `<MotionConfig>` in the root
 * layout: that would drag framer-motion into the shared bundle for every
 * route, including the ones that never animate. When the preference is set the
 * movement is dropped and only the fade remains, so content still arrives —
 * it just doesn't travel.
 */

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Motion components are created once, at module scope. Calling `motion(tag)`
 * during render would return a new component type on every pass, which
 * unmounts and remounts the entire subtree — losing state and re-firing the
 * animation. The allowed tags are enumerated instead.
 */
const TAGS = {
  div: motion.div,
  section: motion.section,
  article: motion.article,
  header: motion.header,
  span: motion.span,
  p: motion.p,
  h1: motion.h1,
  h2: motion.h2,
  h3: motion.h3,
  ul: motion.ul,
  ol: motion.ol,
  li: motion.li,
} as const;

type Tag = keyof typeof TAGS;
type Direction = "up" | "down" | "left" | "right" | "none";

const OFFSET: Record<Direction, { x: number; y: number }> = {
  up: { x: 0, y: 16 },
  down: { x: 0, y: -16 },
  left: { x: 16, y: 0 },
  right: { x: -16, y: 0 },
  none: { x: 0, y: 0 },
};

type RevealProps = {
  children: ReactNode;
  className?: string;
  /** Seconds. Use sparingly — long chains make a page feel slow. */
  delay?: number;
  duration?: number;
  direction?: Direction;
  as?: Tag;
};

export function Reveal({
  children,
  className,
  delay = 0,
  duration = 0.5,
  direction = "up",
  as = "div",
}: RevealProps) {
  const MotionTag = TAGS[as];
  const reduce = useReducedMotion();
  const { x, y } = reduce ? OFFSET.none : OFFSET[direction];

  return (
    <MotionTag
      data-reveal=""
      className={className}
      initial={{ opacity: 0, x, y }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration, delay, ease: EASE }}
    >
      {children}
    </MotionTag>
  );
}

/**
 * Parent for a list of `<RevealItem>`s. Staggering is driven by the parent so
 * children don't each need their own delay prop (and can't drift out of sync).
 */
const containerVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
};

/** Same fade, no travel. */
const itemVariantsReduced: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.45, ease: EASE } },
};

export function RevealGroup({
  children,
  className,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: Tag;
}) {
  const MotionTag = TAGS[as];
  return (
    <MotionTag
      data-reveal=""
      className={className}
      variants={containerVariants}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.15 }}
    >
      {children}
    </MotionTag>
  );
}

export function RevealItem({
  children,
  className,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: Tag;
}) {
  const MotionTag = TAGS[as];
  const reduce = useReducedMotion();
  return (
    <MotionTag
      data-reveal=""
      className={className}
      variants={reduce ? itemVariantsReduced : itemVariants}
    >
      {children}
    </MotionTag>
  );
}
