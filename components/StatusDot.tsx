"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

type StatusDotProps = {
  online: boolean;
  className?: string;
  pulse?: boolean;
};

export function StatusDot({ online, className, pulse = true }: StatusDotProps) {
  const reduced = useReducedMotion();

  return (
    <span
      aria-hidden
      className={cn("relative inline-flex items-center justify-center", className)}
    >
      {online && pulse && !reduced ? (
        <motion.span
          className="absolute inline-block rounded-full bg-primary"
          style={{ width: 10, height: 10 }}
          initial={{ opacity: 0.5, scale: 1 }}
          animate={{ opacity: 0, scale: 2.2 }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
        />
      ) : null}
      <span
        className={cn(
          "relative inline-block h-2.5 w-2.5 rounded-full",
          online ? "bg-primary" : "bg-muted-foreground/40"
        )}
      />
    </span>
  );
}
