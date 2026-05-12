"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type StatusDotProps = {
  online: boolean;
  className?: string;
  pulse?: boolean;
};

export function StatusDot({ online, className, pulse = true }: StatusDotProps) {
  return (
    <span
      aria-hidden
      className={cn("relative inline-flex items-center justify-center", className)}
    >
      {online && pulse ? (
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
          online ? "bg-primary shadow-[0_0_8px_rgba(255,95,0,0.6)]" : "bg-muted-foreground/40"
        )}
      />
    </span>
  );
}
