"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PencilSimple, Plus, Trash } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";
import { springs } from "@/lib/animations";
import { Input } from "@/components/ui/input";
import type { TmuxWindow } from "@/contexts/SocketContext";
import { useLongPress } from "@/hooks/useLongPress";

type WindowTabsProps = {
  windows: TmuxWindow[];
  onSelect: (w: TmuxWindow) => void;
  onNew: () => void;
  onKillWindow?: (index: number) => void;
  onRenameWindow?: (index: number, name: string) => void;
};

type WindowTabProps = {
  w: TmuxWindow;
  isContext: boolean;
  isRenaming: boolean;
  renameValue: string;
  onSelect: () => void;
  onLongPress: (rect: DOMRect) => void;
  onCommitRename: () => void;
  onRenameChange: (v: string) => void;
  onCancelRename: () => void;
};

function WindowTab({
  w,
  isContext,
  isRenaming,
  renameValue,
  onSelect,
  onLongPress,
  onCommitRename,
  onRenameChange,
  onCancelRename,
}: WindowTabProps) {
  const buttonRef = React.useRef<HTMLButtonElement>(null);

  const longPressCallback = React.useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) onLongPress(rect);
  }, [onLongPress]);

  const { handlers: longPressHandlers, consumeLongPress } = useLongPress(longPressCallback);

  return (
    <div className="relative shrink-0">
      {isRenaming ? (
        <div className="flex items-center gap-1 px-1">
          <Input
            value={renameValue}
            onChange={(e) =>
              onRenameChange(e.target.value.replace(/[^A-Za-z0-9_.\-]/g, ""))
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") onCommitRename();
              if (e.key === "Escape") onCancelRename();
              e.stopPropagation();
            }}
            onBlur={onCommitRename}
            autoFocus
            className="h-7 w-24 rounded-lg border-input bg-muted px-2 text-xs shadow-none"
          />
        </div>
      ) : (
        <button
          ref={buttonRef}
          type="button"
          onClick={(e) => {
            if (consumeLongPress()) { e.stopPropagation(); return; }
            onSelect();
          }}
          {...longPressHandlers}
          className={cn(
            "relative flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors",
            w.active ? "text-primary" : "text-muted-foreground hover:text-foreground",
            isContext && "text-foreground"
          )}
        >
          {w.active ? (
            <motion.span
              layoutId="window-indicator"
              transition={springs.quick}
              className="absolute inset-0 rounded-full bg-primary/10"
            />
          ) : null}
          {isContext && !w.active ? (
            <motion.span
              layoutId="window-context-bg"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 rounded-full bg-accent"
            />
          ) : null}
          <span className="relative z-10 font-medium">
            {w.index}: {w.name || "window"}
          </span>
          {w.panes > 1 ? (
            <span className="relative z-10 flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1 text-[9px] font-semibold tabular-nums text-muted-foreground">
              {w.panes}
            </span>
          ) : null}
        </button>
      )}
    </div>
  );
}

export function WindowTabs({
  windows,
  onSelect,
  onNew,
  onKillWindow,
  onRenameWindow,
}: WindowTabsProps) {
  const [contextWindow, setContextWindow] = React.useState<number | null>(null);
  const [contextPos, setContextPos] = React.useState<{ x: number; y: number } | null>(null);
  const [renamingWindow, setRenamingWindow] = React.useState<number | null>(null);
  const [renameValue, setRenameValue] = React.useState("");

  const commitRename = React.useCallback(
    (index: number) => {
      const trimmed = renameValue.replace(/[^A-Za-z0-9_.\-]/g, "").trim();
      if (trimmed) {
        onRenameWindow?.(index, trimmed);
      }
      setRenamingWindow(null);
    },
    [renameValue, onRenameWindow]
  );

  const dismissContext = React.useCallback(() => {
    setContextWindow(null);
    setContextPos(null);
    setRenamingWindow(null);
  }, []);

  if (!windows || windows.length === 0) {
    return null;
  }

  const contextWin = windows.find((w) => w.index === contextWindow);

  return (
    <>
      <div
        className="scrollbar-hide flex items-center gap-1 overflow-x-auto border-b border-border/60 px-4 py-2"
        onClick={dismissContext}
      >
        {windows.map((w) => (
          <WindowTab
            key={w.index}
            w={w}
            isContext={contextWindow === w.index}
            isRenaming={renamingWindow === w.index}
            renameValue={renameValue}
            onSelect={() => {
              setContextWindow(null);
              setContextPos(null);
              if (!w.active) onSelect(w);
            }}
            onLongPress={(rect) => {
              if (contextWindow === w.index) {
                setContextWindow(null);
                setContextPos(null);
              } else {
                setContextWindow(w.index);
                setContextPos({ x: rect.left, y: rect.bottom + 4 });
              }
            }}
            onCommitRename={() => commitRename(w.index)}
            onRenameChange={setRenameValue}
            onCancelRename={() => setRenamingWindow(null)}
          />
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

      {/* Context menu rendered outside overflow container via fixed positioning */}
      <AnimatePresence>
        {contextWindow !== null && contextPos && contextWin && renamingWindow !== contextWindow ? (
          <motion.div
            key="ctx"
            initial={{ opacity: 0, y: -4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.95 }}
            transition={springs.quick}
            style={{ position: "fixed", left: contextPos.x, top: contextPos.y }}
            className="z-50 flex min-w-[120px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setContextWindow(null);
                setContextPos(null);
                setRenamingWindow(contextWindow);
                setRenameValue(contextWin.name || "");
              }}
              className="flex items-center gap-2 px-3 py-2.5 text-xs font-medium hover:bg-accent"
            >
              <PencilSimple weight="fill" size={13} />
              Rename
            </button>
            <div className="h-px bg-border/60" />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setContextWindow(null);
                setContextPos(null);
                onKillWindow?.(contextWindow);
              }}
              className="flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-destructive hover:bg-accent"
            >
              <Trash weight="fill" size={13} />
              Kill
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
