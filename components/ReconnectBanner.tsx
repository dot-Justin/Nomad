"use client";

import { motion } from "framer-motion";
import { ArrowClockwise } from "@phosphor-icons/react";

export function ReconnectBanner({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <motion.div
      initial={{ y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -16, opacity: 0 }}
      className="sticky top-16 z-20 mx-auto mt-1 flex w-fit items-center gap-2 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-orange"
    >
      <motion.span
        animate={{ rotate: 360 }}
        transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
        className="inline-flex"
      >
        <ArrowClockwise weight="fill" size={12} />
      </motion.span>
      Reconnecting…
    </motion.div>
  );
}
