"use client";

import * as React from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SearchAddon } from "@xterm/addon-search";

import "@xterm/xterm/css/xterm.css";

import { useSocket } from "@/hooks/useSocket";
import { useSettings } from "@/hooks/useSettings";
import { getTerminalTheme } from "@/lib/terminalThemes";
import { cn } from "@/lib/utils";

type TerminalProps = {
  className?: string;
  searchQuery?: string;
  onTermReady?: (api: {
    findNext: (q: string) => void;
    findPrevious: (q: string) => void;
    scrollToBottom: () => void;
    clearSelection: () => void;
  }) => void;
  scrollMode?: boolean;
};

export default function Terminal({
  className,
  onTermReady,
  scrollMode,
}: TerminalProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const termRef = React.useRef<XTerm | null>(null);
  const fitRef = React.useRef<FitAddon | null>(null);
  const searchRef = React.useRef<SearchAddon | null>(null);
  const resizeTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const { socket, emit, on } = useSocket();
  const { settings } = useSettings();

  React.useEffect(() => {
    if (!containerRef.current) return;
    if (typeof window === "undefined") return;

    const fontSize = Number(settings.terminal_font_size) || 13;
    const scrollback = Number(settings.terminal_scrollback) || 5000;
    const cursorBlink = settings.terminal_cursor_blink === "true";
    const cursorStyle =
      (settings.terminal_cursor_style as "block" | "underline" | "bar") || "block";

    const term = new XTerm({
      fontFamily: `${settings.terminal_font_family || "JetBrains Mono"}, Symbols Nerd Font Mono`,
      fontSize,
      cursorStyle,
      cursorBlink,
      scrollback,
      theme: getTerminalTheme(settings.terminal_theme || "nomad"),
      allowProposedApi: true,
      macOptionIsMeta: true,
      convertEol: false,
    });

    const fit = new FitAddon();
    const links = new WebLinksAddon();
    const search = new SearchAddon();

    term.loadAddon(fit);
    term.loadAddon(links);
    term.loadAddon(search);
    term.open(containerRef.current);

    termRef.current = term;
    fitRef.current = fit;
    searchRef.current = search;

    const safeFit = () => {
      try {
        fit.fit();
        const cols = term.cols;
        const rows = term.rows;
        emit("terminal:resize", { cols, rows });
      } catch {
        // ignore
      }
    };

    // Defer initial fit to next frame so renderer has laid out
    requestAnimationFrame(() => {
      safeFit();
      term.focus();
    });

    onTermReady?.({
      findNext: (q: string) => search.findNext(q),
      findPrevious: (q: string) => search.findPrevious(q),
      scrollToBottom: () => term.scrollToBottom(),
      clearSelection: () => term.clearSelection(),
    });

    const onData = term.onData((data) => {
      emit("terminal:input", { data });
    });

    const offOutput = on("terminal:output", ((payload: { data: string }) => {
      try {
        const binary = atob(payload.data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        term.write(bytes);
      } catch {
        // ignore decoding failure
      }
    }) as (...args: unknown[]) => void);

    const observer = new ResizeObserver(() => {
      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
      resizeTimeoutRef.current = setTimeout(safeFit, 100);
    });
    observer.observe(containerRef.current);

    const onViewport = () => {
      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
      resizeTimeoutRef.current = setTimeout(safeFit, 100);
    };
    window.visualViewport?.addEventListener("resize", onViewport);

    return () => {
      observer.disconnect();
      window.visualViewport?.removeEventListener("resize", onViewport);
      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
      onData.dispose();
      offOutput();
      try {
        term.dispose();
      } catch {
        // ignore
      }
      termRef.current = null;
      fitRef.current = null;
      searchRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    socket,
    settings.terminal_font_family,
    settings.terminal_font_size,
    settings.terminal_cursor_style,
    settings.terminal_cursor_blink,
    settings.terminal_scrollback,
    settings.terminal_theme,
  ]);

  return (
    <div
      className={cn(
        "h-full w-full overflow-hidden rounded-2xl p-3 transition-shadow",
        scrollMode ? "ring-2 ring-primary/70" : "",
        className
      )}
      style={{ background: "#1A1714" }}
    >
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
