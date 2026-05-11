"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Plus } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";
import { springs } from "@/lib/animations";
import type { TmuxWindow } from "@/contexts/SocketContext";

type WindowTabsProps = {
  windows: TmuxWindow[];
  onSelect: (w: TmuxWindow) => void;
  onNew: () => void;
};

export function WindowTabs({ windows, onSelect, onNew }: WindowTabsProps) {
  if (!windows || windows.length === 0) {
    return null;
  }
  return (
    <div className="scrollbar-hide flex items-center gap-2 overflow-x-auto px-5 py-2">
      {windows.map((w) => (
        <button
          key={w.index}
          type="button"
          onClick={() => onSelect(w)}
          className={cn(
            "relative flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs",
            w.active ? "text-primary" : "text-muted-foreground"
          )}
        >
          {w.active ? (
            <motion.span
              layoutId="window-indicator"
              transition={springs.quick}
              className="absolute inset-0 rounded-full bg-primary/10"
            />
          ) : null}
          <span className="relative z-10 font-medium">
            {w.index}: {w.name || "window"}
          </span>
        </button>
      ))}
      <button
        type="button"
        onClick={onNew}
        aria-label="New window"
        className="ml-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground"
      >
        <Plus weight="fill" size={14} />
      </button>
    </div>
  );
}
