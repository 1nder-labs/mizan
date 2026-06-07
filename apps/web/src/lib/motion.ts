/**
 * Shared motion tokens. Single source for the app's animation rhythm so every
 * surface (tabs, lists, copilot, cards) shares one feel. Durations are seconds
 * (framer-motion convention). Reduced-motion is honoured globally by the
 * `<MotionConfig reducedMotion="user">` at the root + a CSS guard in globals.css.
 */
import type { Transition, Variants } from "framer-motion";

/** Spring for the sliding tab pill — quick settle, faint overshoot. */
export const SPRING_PILL: Transition = { type: "spring", stiffness: 400, damping: 34, mass: 0.8 };

/** Calm ease-out curve shared by every tween. */
export const EASE_OUT: [number, number, number, number] = [0.2, 0.7, 0.3, 1];

export const DUR_BASE = 0.22;
export const DUR_SLOW = 0.32;

/** Subtle rise-and-fade — the default reveal for sections and list items. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 7 },
  show: { opacity: 1, y: 0, transition: { duration: DUR_SLOW, ease: EASE_OUT } },
};

/** Gentle scale-and-fade for message bubbles, tool cards, badge bumps. */
export const popItem: Variants = {
  hidden: { opacity: 0, scale: 0.98, y: 4 },
  show: { opacity: 1, scale: 1, y: 0, transition: { duration: DUR_BASE, ease: EASE_OUT } },
};

/** Parent that cascades its children's reveals 40ms apart. */
export const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

/** Spread onto a motion element for a one-shot fade-up reveal on mount. */
export const reveal = {
  initial: { opacity: 0, y: 7 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: DUR_SLOW, ease: EASE_OUT },
} as const;
