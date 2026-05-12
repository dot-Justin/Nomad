"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PencilSimple, Plus, Trash } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";
import { springs } from "@/lib/animations";
import { Input } from "@/components/ui/input";
import type { TmuxWindow } from "@/contexts/SocketContext";

type WindowTabsProps = {
  windows: TmuxWindow[];
  onSelect: (w: TmuxWindow) => void;
  onNew: () => void;
  onKillWindow?: (index: number) => void;
  onRenameWindow?: (index: number, name: string) => void;
};

function useLongPress(callback: () => void, delay = 500) {
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const start = React.useCallback(() => {
    timerRef.current = setTimeout(callback, delay);
  }, [callback, delay]);

  const cancel = React.useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return {
    onMouseDown: start,
    onMouseUp: cancel,
    onMouseLeave: cancel,
    onTouchStart: start,
    onTouchEnd: cancel,
    onTouchCancel: cancel,
  };
}

type WindowTabProps = {
  w: TmuxWindow;
  isContext: boolean;
  isRenaming: boolean;
  renameValue: string;
  onSelect: () => void;
  onLongPress: () => void;
  onStartRename: () => void;
  onCommitRename: () => void;
  onRenameChange: (v: string) => void;
  onCancelRename: () => void;
  onKill: () => void;
};

function WindowTab({
  w,
  isContext,
  isRenaming,
  renameValue,
  onSelect,
  onLongPress,
  onStartRename,
  onCommitRename,
  onRenameChange,
  onCancelRename,
  onKill,
}: WindowTabProps) {
  const longPressProps = useLongPress(onLongPress);

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
          type="button"
          onClick={() => {
            if (isContext) {
              onSelect();
            } else {
              onSelect();
            }
          }}
          {...longPressProps}
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

      <AnimatePresence>
        {isContext && !isRenaming ? (
          <motion.div
            key="ctx"
            initial={{ opacity: 0, y: -4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.95 }}
            transition={springs.quick}
            className="absolute left-0 top-full z-50 mt-1 flex min-w-[120px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onStartRename();
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
                onKill();
              }}
              className="flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-destructive hover:bg-accent"
            >
              <Trash weight="fill" size={13} />
              Kill
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
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

  if (!windows || windows.length === 0) {
    return null;
  }

  return (
    <div
      className="scrollbar-hide flex items-center gap-1 overflow-x-auto px-4 py-2"
      onClick={() => {
        setContextWindow(null);
        setRenamingWindow(null);
      }}
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
            if (!w.active) onSelect(w);
          }}
          onLongPress={() => {
            setContextWindow((prev) => (prev === w.index ? null : w.index));
          }}
          onStartRename={() => {
            setContextWindow(null);
            setRenamingWindow(w.index);
            setRenameValue(w.name || "");
          }}
          onCommitRename={() => commitRename(w.index)}
          onRenameChange={setRenameValue}
          onCancelRename={() => setRenamingWindow(null)}
          onKill={() => {
            setContextWindow(null);
            onKillWindow?.(w.index);
          }}
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
  );
}
