"use client";

import { motion } from "framer-motion";

const RINGS = [0, 1, 2];
const BASE_DURATION = 1.6;

export function ConnectingRings({ size = 64 }: { size?: number }) {
  return (
    <span
      aria-label="Connecting"
      role="status"
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {RINGS.map((i) => (
        <motion.span
          key={i}
          aria-hidden
          className="absolute rounded-full border-2 border-primary"
          style={{ width: size, height: size }}
          initial={{ opacity: 0.6, scale: 0.4 }}
          animate={{ opacity: 0, scale: 1.1 }}
          transition={{
            duration: BASE_DURATION,
            delay: i * (BASE_DURATION / RINGS.length),
            repeat: Infinity,
            ease: "easeOut",
          }}
        />
      ))}
      <span className="relative z-10 inline-flex h-3 w-3 rounded-full bg-primary" />
    </span>
  );
}
