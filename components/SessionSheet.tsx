"use client";

import * as React from "react";
import { CaretRight, PencilSimple, Plus, StackSimple, Trash } from "@phosphor-icons/react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { TmuxSession } from "@/contexts/SocketContext";
import { useSettings } from "@/hooks/useSettings";
import { useHaptics } from "@/hooks/useHaptics";

type SessionSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessions: TmuxSession[];
  attachedSession: string | null;
  onAttach: (name: string) => void;
  onCreate: (name: string) => void;
  onKill?: (name: string) => void;
  onRename?: (oldName: string, newName: string) => void;
};

function relativeFromUnix(seconds: number) {
  if (!seconds) return "";
  const ms = seconds * 1000;
  const diff = Date.now() - ms;
  if (diff < 0) return "just now";
  const m = Math.floor(diff / 60000);
  if (m < 1) return "moments ago";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ms).toLocaleString();
}

function useLongPress(callback: () => void, delay = 500) {
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const start = React.useCallback(() => {
    timerRef.current = setTimeout(() => {
      callback();
    }, delay);
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

type SessionRowProps = {
  session: TmuxSession;
  idx: number;
  attachedSession: string | null;
  contextSession: string | null;
  renamingSession: string | null;
  renameValue: string;
  onTap: () => void;
  onLongPress: () => void;
  onStartRename: () => void;
  onCommitRename: () => void;
  onRenameChange: (v: string) => void;
  onCancelRename: () => void;
  onKillRequest: () => void;
};

function SessionRow({
  session: s,
  idx,
  attachedSession,
  contextSession,
  renamingSession,
  renameValue,
  onTap,
  onLongPress,
  onStartRename,
  onCommitRename,
  onRenameChange,
  onCancelRename,
  onKillRequest,
}: SessionRowProps) {
  const attached = attachedSession === s.name;
  const recent = idx === 0;
  const isContext = contextSession === s.name;
  const isRenaming = renamingSession === s.name;

  const longPressProps = useLongPress(onLongPress);

  return (
    <li>
      <button
        type="button"
        onClick={() => {
          if (isContext) {
            onTap();
            return;
          }
          onTap();
        }}
        {...longPressProps}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-accent",
          recent && !isContext && "bg-accent/60",
          attached && "border-l-4 border-primary pl-2",
          isContext && "bg-accent"
        )}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <StackSimple weight="fill" size={18} />
        </span>
        {isRenaming ? (
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
            onClick={(e) => e.stopPropagation()}
            autoFocus
            className="h-8 flex-1 rounded-lg border-input bg-muted px-3 text-sm shadow-none"
          />
        ) : (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{s.name}</span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {relativeFromUnix(s.activity)}
              {s.attached ? " · attached elsewhere" : ""}
            </span>
          </span>
        )}
        {!isRenaming && (
          <>
            <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-primary">
              <StackSimple weight="fill" size={10} /> {s.windows}
            </span>
            <CaretRight weight="fill" size={14} className="text-muted-foreground" />
          </>
        )}
      </button>

      {isContext && !isRenaming && (
        <div className="mx-3 mb-2 flex gap-2 rounded-xl bg-accent/80 px-3 py-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onStartRename();
            }}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium text-foreground hover:bg-background/60"
          >
            <PencilSimple weight="fill" size={15} />
            Rename
          </button>
          <div className="w-px bg-border/60" />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onKillRequest();
            }}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium text-destructive hover:bg-background/60"
          >
            <Trash weight="fill" size={15} />
            Kill
          </button>
        </div>
      )}
    </li>
  );
}

export function SessionSheet({
  open,
  onOpenChange,
  sessions,
  attachedSession,
  onAttach,
  onCreate,
  onKill,
  onRename,
}: SessionSheetProps) {
  const { settings } = useSettings();
  const haptics = useHaptics();
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState(settings.default_session_name || "nomad");
  const [contextSession, setContextSession] = React.useState<string | null>(null);
  const [renamingSession, setRenamingSession] = React.useState<string | null>(null);
  const [renameValue, setRenameValue] = React.useState("");

  React.useEffect(() => {
    if (!open) {
      setCreating(false);
      setContextSession(null);
      setRenamingSession(null);
      setNewName(settings.default_session_name || "nomad");
    }
  }, [open, settings.default_session_name]);

  const openContext = React.useCallback(
    (name: string) => {
      haptics.warning();
      setContextSession((prev) => (prev === name ? null : name));
    },
    [haptics]
  );

  const startRename = React.useCallback((name: string) => {
    setContextSession(null);
    setRenamingSession(name);
    setRenameValue(name);
  }, []);

  const commitRename = React.useCallback(
    (oldName: string) => {
      const trimmed = renameValue.replace(/[^A-Za-z0-9_.\-]/g, "").trim();
      if (trimmed && trimmed !== oldName) {
        onRename?.(oldName, trimmed);
      }
      setRenamingSession(null);
    },
    [renameValue, onRename]
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="px-0 pb-8 pt-0 sm:max-w-lg sm:rounded-3xl"
        aria-describedby={undefined}
        onDismiss={() => onOpenChange(false)}
      >
        <SheetHeader className="px-5 pb-2">
          <SheetTitle className="text-lg font-semibold">Sessions</SheetTitle>
        </SheetHeader>

        <ul className="flex max-h-[60vh] flex-col overflow-y-auto px-2 pb-3 pt-1">
          {sessions.map((s, idx) => (
            <SessionRow
              key={s.name}
              session={s}
              idx={idx}
              attachedSession={attachedSession}
              contextSession={contextSession}
              renamingSession={renamingSession}
              renameValue={renameValue}
              onTap={() => {
                if (contextSession === s.name) {
                  setContextSession(null);
                  return;
                }
                haptics.tap();
                onAttach(s.name);
              }}
              onLongPress={() => openContext(s.name)}
              onStartRename={() => startRename(s.name)}
              onCommitRename={() => commitRename(s.name)}
              onRenameChange={setRenameValue}
              onCancelRename={() => setRenamingSession(null)}
              onKillRequest={() => {
                setContextSession(null);
                onKill?.(s.name);
              }}
            />
          ))}
          {sessions.length === 0 ? (
            <li className="px-3 py-4 text-center text-sm text-muted-foreground">
              No tmux sessions yet.
            </li>
          ) : null}
        </ul>

        <div className="border-t border-border/60 px-4 pt-4">
          {creating ? (
            <div className="flex items-center gap-2">
              <Input
                value={newName}
                onChange={(e) =>
                  setNewName(e.target.value.replace(/[^A-Za-z0-9_.\-]/g, ""))
                }
                className="h-11 flex-1 rounded-xl border-input bg-muted px-4 text-sm shadow-none"
                autoFocus
                placeholder={settings.default_session_name || "nomad"}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newName) {
                    haptics.confirm();
                    onCreate(newName);
                  }
                  if (e.key === "Escape") setCreating(false);
                }}
              />
              <Button
                onClick={() => {
                  if (!newName) return;
                  haptics.confirm();
                  onCreate(newName);
                }}
                className="h-11 rounded-full px-4"
              >
                Create
              </Button>
              <Button
                variant="ghost"
                className="h-11 rounded-full"
                onClick={() => setCreating(false)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium hover:bg-accent"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Plus weight="fill" size={16} />
              </span>
              New Session
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
