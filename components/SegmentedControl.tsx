"use client";

import * as React from "react";
import { motion } from "framer-motion";

import { cn } from "@/lib/utils";
import { springs } from "@/lib/animations";

type Option<T extends string> = {
  value: T;
  label: React.ReactNode;
};

type SegmentedControlProps<T extends string> = {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  className?: string;
  layoutId?: string;
};

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  className,
  layoutId,
}: SegmentedControlProps<T>) {
  const id = React.useId();
  const indicatorId = layoutId ?? `segmented-${id}`;

  return (
    <div
      role="tablist"
      className={cn(
        "relative inline-flex w-full items-center rounded-xl bg-muted p-1",
        className
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "relative flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
              active ? "text-primary-foreground" : "text-muted-foreground"
            )}
          >
            {active && (
              <motion.span
                layoutId={indicatorId}
                transition={springs.quick}
                className="absolute inset-0 rounded-lg bg-primary"
                aria-hidden
              />
            )}
            <span className="relative z-10 inline-flex items-center justify-center gap-1.5">
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
