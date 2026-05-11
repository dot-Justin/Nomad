import type { Transition } from "framer-motion";

export const springs: Record<string, Transition> = {
  quick: { type: "spring", stiffness: 400, damping: 28, mass: 0.8 },
  sheet: { type: "spring", stiffness: 320, damping: 32, mass: 1 },
  bar: { type: "spring", stiffness: 350, damping: 26, mass: 0.9 },
  page: { type: "spring", stiffness: 280, damping: 30, mass: 1 },
  micro: { type: "spring", stiffness: 500, damping: 35, mass: 0.6 },
  bouncy: { type: "spring", stiffness: 300, damping: 18, mass: 0.8 },
};

export const variants = {
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.15 },
  },
  slideUp: {
    initial: { y: 24, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    exit: { y: 24, opacity: 0 },
    transition: springs.sheet,
  },
  scaleIn: {
    initial: { scale: 0.94, opacity: 0 },
    animate: { scale: 1, opacity: 1 },
    exit: { scale: 0.94, opacity: 0 },
    transition: springs.quick,
  },
  listItem: {
    initial: { y: 12, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    transition: springs.quick,
  },
};
