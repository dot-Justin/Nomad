"use client";

import * as React from "react";

export type TerminalApi = {
  findNext: (q: string) => void;
  findPrevious: (q: string) => void;
  scrollToBottom: () => void;
  clearSelection: () => void;
};

export function useTerminalRef() {
  const ref = React.useRef<TerminalApi | null>(null);
  const setApi = React.useCallback((api: TerminalApi | null) => {
    ref.current = api;
  }, []);
  return { ref, setApi };
}
