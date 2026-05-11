"use client";

import { useSettings } from "@/hooks/useSettings";

export const hapticPatterns = {
  tap: 8,
  confirm: 12,
  success: [10, 50, 20],
  error: [30, 50, 30],
  warning: [20, 30, 20],
  kill: [15, 40, 15, 40, 15],
  detach: [10, 30, 10],
} as const;

type Pattern = number | number[];

function vibrate(pattern: Pattern) {
  if (typeof navigator === "undefined") return;
  if (typeof navigator.vibrate === "function") {
    navigator.vibrate(pattern);
  }
}

export function useHaptics() {
  const { settings } = useSettings();
  const enabled = settings?.haptics_enabled === "true";

  const run = (pattern: Pattern) => {
    if (!enabled) return;
    vibrate(pattern);
  };

  return {
    tap: () => run(hapticPatterns.tap),
    confirm: () => run(hapticPatterns.confirm),
    success: () => run([...hapticPatterns.success]),
    error: () => run([...hapticPatterns.error]),
    warning: () => run([...hapticPatterns.warning]),
    kill: () => run([...hapticPatterns.kill]),
    detach: () => run([...hapticPatterns.detach]),
  };
}
