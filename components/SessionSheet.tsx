"use client";

import * as React from "react";
import { CaretRight, Plus, StackSimple } from "@phosphor-icons/react";

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

export function SessionSheet({
  open,
  onOpenChange,
  sessions,
  attachedSession,
  onAttach,
  onCreate,
}: SessionSheetProps) {
  const { settings } = useSettings();
  const haptics = useHaptics();
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState(settings.default_session_name || "nomad");

  React.useEffect(() => {
    if (!open) {
      setCreating(false);
      setNewName(settings.default_session_name || "nomad");
    }
  }, [open, settings.default_session_name]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="px-0 pb-8 pt-4 sm:max-w-lg sm:rounded-3xl">
        <SheetHeader className="px-5 pb-2">
          <SheetTitle className="text-lg font-semibold">Sessions</SheetTitle>
        </SheetHeader>

        <ul className="flex max-h-[60vh] flex-col overflow-y-auto px-2 pb-3 pt-1">
          {sessions.map((s, idx) => {
            const attached = attachedSession === s.name;
            const recent = idx === 0;
            return (
              <li key={s.name}>
                <button
                  type="button"
                  onClick={() => {
                    haptics.tap();
                    onAttach(s.name);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-accent",
                    recent && "bg-accent/60",
                    attached && "border-l-4 border-primary"
                  )}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <StackSimple weight="fill" size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {s.name}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {relativeFromUnix(s.activity)}
                      {s.attached ? " · attached elsewhere" : ""}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-primary">
                    <StackSimple weight="fill" size={10} /> {s.windows}
                  </span>
                  <CaretRight weight="fill" size={14} className="text-muted-foreground" />
                </button>
              </li>
            );
          })}
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
                onChange={(e) => setNewName(e.target.value.replace(/[^A-Za-z0-9_.-]/g, ""))}
                className="h-11 flex-1 rounded-xl border-input bg-muted px-4 text-sm shadow-none"
                autoFocus
                placeholder={settings.default_session_name || "nomad"}
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
              <Button variant="ghost" className="h-11 rounded-full" onClick={() => setCreating(false)}>
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
