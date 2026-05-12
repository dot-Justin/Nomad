"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  MagnifyingGlass,
  Plus,
  SignOut,
  TextAlignLeft,
  X,
} from "@phosphor-icons/react";

import { cn } from "@/lib/utils";
import { springs } from "@/lib/animations";
import { useHaptics } from "@/hooks/useHaptics";

type IconType = React.ComponentType<{ weight?: "fill" | "bold"; size?: number }>;

type ActionButton = {
  key: string;
  icon: IconType;
  iconWeight?: "fill" | "bold";
  label: string;
  onPress: () => void;
  destructive?: boolean;
  accent?: boolean;
};

type ActionBarProps = {
  mode: "default" | "scroll";
  onNewWindow: () => void;
  onKillWindow: () => void;
  onPrevWindow: () => void;
  onNextWindow: () => void;
  onScrollMode: () => void;
  onDetach: () => void;
  onScrollUp: () => void;
  onScrollDown: () => void;
  onScrollFind: () => void;
  onScrollExit: () => void;
  bottomOffset?: number;
};

export function ActionBar({
  mode,
  onNewWindow,
  onKillWindow,
  onPrevWindow,
  onNextWindow,
  onScrollMode,
  onDetach,
  onScrollUp,
  onScrollDown,
  onScrollFind,
  onScrollExit,
  bottomOffset = 0,
}: ActionBarProps) {
  const haptics = useHaptics();

  const wrap = (fn: () => void) => () => {
    haptics.tap();
    fn();
  };

  const defaultButtons: ActionButton[] = [
    { key: "new", icon: Plus, label: "Window", onPress: wrap(onNewWindow) },
    {
      key: "kill",
      icon: X,
      iconWeight: "bold",
      label: "Kill Win",
      onPress: wrap(onKillWindow),
      destructive: true,
    },
    { key: "prev", icon: ArrowLeft, label: "Prev", onPress: wrap(onPrevWindow) },
    { key: "next", icon: ArrowRight, label: "Next", onPress: wrap(onNextWindow) },
    {
      key: "scroll",
      icon: TextAlignLeft,
      label: "Scroll",
      onPress: wrap(onScrollMode),
    },
    { key: "detach", icon: SignOut, label: "Detach", onPress: wrap(onDetach) },
  ];

  const scrollButtons: ActionButton[] = [
    { key: "up", icon: ArrowUp, label: "Up", onPress: wrap(onScrollUp) },
    { key: "down", icon: ArrowDown, label: "Down", onPress: wrap(onScrollDown) },
    {
      key: "find",
      icon: MagnifyingGlass,
      label: "Find",
      onPress: wrap(onScrollFind),
    },
    {
      key: "exit",
      icon: X,
      iconWeight: "bold",
      label: "Exit",
      onPress: wrap(onScrollExit),
    },
  ];

  const buttons = mode === "scroll" ? scrollButtons : defaultButtons;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-30 flex justify-center px-4"
      style={{ bottom: 16 + bottomOffset }}
    >
      <motion.div
        layout
        transition={springs.bar}
        className={cn(
          "pointer-events-auto flex h-14 items-center gap-1 rounded-full border border-border/70 bg-card px-2 shadow-bar"
        )}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {buttons.map((b) => {
            const Icon = b.icon;
            return (
              <motion.button
                key={b.key}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={springs.bar}
                whileTap={{ scale: 0.88 }}
                onClick={b.onPress}
                className={cn(
                  "flex h-12 w-12 flex-col items-center justify-center rounded-full text-muted-foreground touch-manipulation",
                  b.destructive && "text-destructive",
                  b.accent && "bg-primary text-primary-foreground"
                )}
                style={{ touchAction: "manipulation" }}
              >
                <Icon weight={b.iconWeight ?? "fill"} size={18} />
                <span className="mt-0.5 text-[10px] font-medium leading-none">
                  {b.label}
                </span>
              </motion.button>
            );
          })}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
