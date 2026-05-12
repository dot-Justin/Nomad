"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  SignOut,
  StackSimple,
  TextAlignLeft,
  Trash,
  X,
} from "@phosphor-icons/react";

import { cn } from "@/lib/utils";
import { springs } from "@/lib/animations";
import { Input } from "@/components/ui/input";
import type { TmuxSession, TmuxWindow } from "@/contexts/SocketContext";
import { useHaptics } from "@/hooks/useHaptics";

type SessionSidebarProps = {
  sessions: TmuxSession[];
  windows: TmuxWindow[];
  attachedSession: string | null;
  status: string;
  mode: "default" | "scroll";
  onAttach: (name: string) => void;
  onCreate: (name: string) => void;
  onKillSession?: (name: string) => void;
  onRenameSession?: (oldName: string, newName: string) => void;
  onSelectWindow: (index: number) => void;
  onNewWindow: () => void;
  onKillWindow: (index: number) => void;
  onRenameWindow: (index: number, name: string) => void;
  onPrevWindow: () => void;
  onNextWindow: () => void;
  onDetach: () => void;
  onScrollMode: () => void;
  onScrollUp: () => void;
  onScrollDown: () => void;
  onScrollFind: () => void;
  onScrollExit: () => void;
};

function SidebarSessionRow({
  session,
  isAttached,
  onAttach,
  onKill,
  onRename,
}: {
  session: TmuxSession;
  isAttached: boolean;
  onAttach: () => void;
  onKill?: () => void;
  onRename?: (newName: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [renaming, setRenaming] = React.useState(false);
  const [renameVal, setRenameVal] = React.useState(session.name);

  const commitRename = React.useCallback(() => {
    const trimmed = renameVal.replace(/[^A-Za-z0-9_.\-]/g, "").trim();
    if (trimmed && trimmed !== session.name) onRename?.(trimmed);
    setRenaming(false);
  }, [renameVal, session.name, onRename]);

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (renaming) return;
          if (open) { setOpen(false); return; }
          if (!isAttached) { onAttach(); return; }
          setOpen(true);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs transition-colors hover:bg-accent",
          isAttached && "bg-primary/10 font-semibold text-primary"
        )}
      >
        <StackSimple weight="fill" size={14} />
        <span className="min-w-0 flex-1 truncate">{session.name}</span>
        <span className="shrink-0 text-[10px] text-muted-foreground">{session.windows}w</span>
      </button>

      <AnimatePresence>
        {open && !renaming && (
          <motion.div
            key="ctx"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={springs.quick}
            className="overflow-hidden"
          >
            <div className="mx-2 mb-1 flex gap-1 rounded-xl bg-accent/60 px-2 py-1.5">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setRenaming(true);
                  setRenameVal(session.name);
                }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium hover:bg-background/60"
              >
                <PencilSimple weight="fill" size={12} />
                Rename
              </button>
              <div className="w-px bg-border/60" />
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onKill?.();
                }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium text-destructive hover:bg-background/60"
              >
                <Trash weight="fill" size={12} />
                Kill
              </button>
            </div>
          </motion.div>
        )}
        {renaming && (
          <motion.div
            key="rename"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="px-2 pb-1.5"
          >
            <Input
              value={renameVal}
              onChange={(e) =>
                setRenameVal(e.target.value.replace(/[^A-Za-z0-9_.\-]/g, ""))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setRenaming(false);
                e.stopPropagation();
              }}
              onBlur={commitRename}
              autoFocus
              className="h-7 w-full rounded-lg border-input bg-muted px-2 text-xs shadow-none"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function humanStatus(status: string): string {
  switch (status) {
    case "idle": return "Ready";
    case "connecting": return "Connecting…";
    case "connected": return "Connected";
    case "session_picking": return "Pick a session";
    case "attached": return "Attached";
    case "reconnecting": return "Reconnecting…";
    case "disconnected": return "Disconnected";
    case "error": return "Error";
    default: return status;
  }
}

export function SessionSidebar({
  sessions,
  windows,
  attachedSession,
  status,
  mode,
  onAttach,
  onCreate,
  onKillSession,
  onRenameSession,
  onSelectWindow,
  onNewWindow,
  onKillWindow,
  onRenameWindow,
  onPrevWindow,
  onNextWindow,
  onDetach,
  onScrollMode,
  onScrollUp,
  onScrollDown,
  onScrollFind,
  onScrollExit,
}: SessionSidebarProps) {
  const haptics = useHaptics();
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState("nomad");
  const [renamingWindow, setRenamingWindow] = React.useState<number | null>(null);
  const [windowRenameVal, setWindowRenameVal] = React.useState("");

  const wrap = (fn: () => void) => () => {
    haptics.tap();
    fn();
  };

  const commitWindowRename = React.useCallback(
    (index: number) => {
      const trimmed = windowRenameVal.trim();
      if (trimmed) onRenameWindow(index, trimmed);
      setRenamingWindow(null);
    },
    [windowRenameVal, onRenameWindow]
  );

  const defaultActions = [
    { icon: ArrowLeft, label: "Prev", fn: onPrevWindow },
    { icon: ArrowRight, label: "Next", fn: onNextWindow },
    { icon: TextAlignLeft, label: "Scroll", fn: onScrollMode },
    { icon: SignOut, label: "Detach", fn: onDetach },
  ] as const;

  const scrollActions = [
    { icon: ArrowUp, label: "Up", fn: onScrollUp },
    { icon: ArrowDown, label: "Down", fn: onScrollDown },
    { icon: MagnifyingGlass, label: "Find", fn: onScrollFind },
    { icon: X, label: "Exit", fn: onScrollExit },
  ] as const;

  const actions = mode === "scroll" ? scrollActions : defaultActions;

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border/60 bg-card">
      {/* Status */}
      <div className="border-b border-border/60 px-4 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {humanStatus(status)}
        </div>
        <div className="truncate text-sm font-semibold text-foreground">
          {attachedSession || "—"}
        </div>
      </div>

      {/* Sessions */}
      <div className="border-b border-border/60 px-2 py-2">
        <div className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Sessions
        </div>
        <div className="flex flex-col gap-0.5">
          {sessions.map((s) => (
            <SidebarSessionRow
              key={s.name}
              session={s}
              isAttached={attachedSession === s.name}
              onAttach={() => {
                haptics.tap();
                onAttach(s.name);
              }}
              onKill={() => {
                haptics.kill();
                onKillSession?.(s.name);
              }}
              onRename={(newName) => {
                onRenameSession?.(s.name, newName);
              }}
            />
          ))}
        </div>
        {creating ? (
          <div className="mt-1 flex gap-1 px-1">
            <Input
              value={newName}
              onChange={(e) =>
                setNewName(e.target.value.replace(/[^A-Za-z0-9_.\-]/g, ""))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName) {
                  haptics.confirm();
                  onCreate(newName);
                  setCreating(false);
                }
                if (e.key === "Escape") setCreating(false);
              }}
              autoFocus
              placeholder="session name"
              className="h-7 flex-1 rounded-lg border-input bg-muted px-2 text-xs shadow-none"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-1 flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Plus weight="fill" size={12} />
            New Session
          </button>
        )}
      </div>

      {/* Windows */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-2 py-2">
        <div className="mb-1 flex items-center justify-between px-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Windows
          </span>
          <button
            type="button"
            onClick={wrap(onNewWindow)}
            aria-label="New window"
            className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground"
          >
            <Plus weight="fill" size={10} />
          </button>
        </div>
        <div className="flex flex-col gap-0.5 overflow-y-auto">
          {windows.map((w) => (
            <div key={w.index}>
              {renamingWindow === w.index ? (
                <div className="px-1">
                  <Input
                    value={windowRenameVal}
                    onChange={(e) =>
                      setWindowRenameVal(
                        e.target.value.replace(/[^A-Za-z0-9_.\-]/g, "")
                      )
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitWindowRename(w.index);
                      if (e.key === "Escape") setRenamingWindow(null);
                      e.stopPropagation();
                    }}
                    onBlur={() => commitWindowRename(w.index)}
                    autoFocus
                    className="h-7 w-full rounded-lg border-input bg-muted px-2 text-xs shadow-none"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    haptics.tap();
                    onSelectWindow(w.index);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setRenamingWindow(w.index);
                    setWindowRenameVal(w.name || "");
                  }}
                  className={cn(
                    "group flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs transition-colors hover:bg-accent",
                    w.active && "bg-primary/10 font-semibold text-primary"
                  )}
                >
                  <span className="tabular-nums text-muted-foreground">{w.index}</span>
                  <span className="min-w-0 flex-1 truncate">{w.name || "window"}</span>
                  {w.panes > 1 ? (
                    <span className="mr-1 text-[10px] text-muted-foreground">{w.panes}p</span>
                  ) : null}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      haptics.kill();
                      onKillWindow(w.index);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        haptics.kill();
                        onKillWindow(w.index);
                      }
                    }}
                    aria-label="Kill window"
                    className="invisible ml-auto inline-flex h-4 w-4 items-center justify-center rounded-full text-destructive group-hover:visible"
                  >
                    <X weight="bold" size={10} />
                  </div>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="border-t border-border/60 px-3 py-3">
        <AnimatePresence mode="wait">
          <motion.div
            key={mode}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={springs.quick}
            className="grid grid-cols-4 gap-1"
          >
            {actions.map(({ icon: Icon, label, fn }) => (
              <button
                key={label}
                type="button"
                onClick={wrap(fn)}
                className="flex flex-col items-center gap-0.5 rounded-xl py-2 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Icon weight="fill" size={15} />
                {label}
              </button>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
    </aside>
  );
}
