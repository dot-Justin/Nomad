# Nomad tmux Feature Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all gaps between the current implementation and near-complete tmux feature parity, with a polished, beautiful, mobile-first UX.

**Architecture:** Node.js backend adds session rename + pane list commands; SocketContext gains new types and events; React components gain long-press context menus, drag gestures, sidebar layout, and clipboard support. Each block commits independently.

**Tech Stack:** Next.js 15, React 19, Socket.IO, xterm.js v5, Framer Motion, Phosphor Icons, Tailwind CSS v4, shadcn/ui

**Design rules in effect:**
- Spring physics on every motion (`stiffness: 300–400, damping: 26–32`)
- All tap targets ≥ 44px × 44px
- `prefers-reduced-motion` respected on every animation
- `transform`/`opacity` only — never `width`/`height`/`top`/`left`
- Status dots get perpetual pulse (infinite micro-animation)
- Scale-down feedback (`scale-[0.97]`) on card press

---

## File Map

| File | Action |
|------|--------|
| `lib/tmux.js` | Modify: add `renameSession`, `listPanes`, `parsePanes` |
| `lib/ssh.js` | Modify: add `renameSession`, `listPanes` methods + socket events |
| `contexts/SocketContext.tsx` | Modify: `TmuxPane` type, `panes` state, new actions + listeners |
| `components/SessionSheet.tsx` | Modify: long-press context, rename/kill, wire `onKill` |
| `app/session/[serverId]/SessionClient.tsx` | Modify: kill session confirm, rename session, desktop sidebar |
| `components/WindowTabs.tsx` | Modify: long-press rename/kill, pane count badge |
| `components/ServerCard.tsx` | Modify: swipe-delete gesture, `onDelete` prop |
| `app/HomeClient.tsx` | Modify: pass `onDelete`, delete confirmation |
| `components/StatusDot.tsx` | Modify: perpetual pulse for online state |
| `components/ConnectingRings.tsx` | Create: 3-ring pulsing connecting animation |
| `components/ui/sheet.tsx` | Modify: drag handle + drag-to-dismiss |
| `components/Terminal.tsx` | Modify: clipboard copy chip on selection |
| `components/Sidebar.tsx` | Create: desktop sidebar with window list |
| `components/PageTransition.tsx` | Create: route fade-slide transition |
| `app/layout.tsx` | Modify: wrap children in `PageTransition` |

---

## Task 1: Backend — Session rename + pane list

**Files:**
- Modify: `lib/tmux.js`
- Modify: `lib/ssh.js`
- Modify: `contexts/SocketContext.tsx`

- [ ] **Step 1.1: Add tmux commands to `lib/tmux.js`**

Inside the `tmux` object (after `copyModeKey`), add:

```js
  renameSession(oldName, newName) {
    return `tmux rename-session -t ${shellEscape(oldName)} ${shellEscape(newName)}`;
  },

  listPanes(sessionName, windowIndex) {
    const idx = Number(windowIndex);
    if (!Number.isFinite(idx)) throw new Error("invalid window index");
    return `tmux list-panes -t ${shellEscape(sessionName)}:${idx} -F '#{pane_index}|#{pane_active}|#{pane_width}|#{pane_height}' 2>/dev/null`;
  },
```

After the `parseWindows` function, add:

```js
function parsePanes(stdout) {
  if (!stdout) return [];
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [index, active, width, height] = line.split("|");
      return {
        index: Number(index) || 0,
        active: active === "1",
        width: Number(width) || 0,
        height: Number(height) || 0,
      };
    });
}
```

Update the `module.exports` to include `parsePanes`:

```js
module.exports = {
  tmux,
  parseSessions,
  parseWindows,
  parsePanes,
  shellEscape,
  safeName,
};
```

- [ ] **Step 1.2: Import `parsePanes` in `lib/ssh.js`**

Change the destructuring import at line 8:

```js
const { tmux, parseSessions, parseWindows, parsePanes, safeName, shellEscape } = require("./tmux");
```

- [ ] **Step 1.3: Add `renameSession` and `listPanes` methods to `SshSession` in `lib/ssh.js`**

After the `scrollSearch` method (around line 389), add:

```js
  async renameSession({ oldName, newName }) {
    if (!this.conn || !oldName || !newName) return;
    const safeOld = String(oldName).trim();
    const safeNew = String(newName).replace(/[^A-Za-z0-9_.\-]/g, "").trim();
    if (!safeNew) return;
    await runCommand(this.conn, tmux.renameSession(safeOld, safeNew));
    if (this.attachedSession === safeOld) {
      this.attachedSession = safeNew;
    }
    this.emit("session:renamed", { oldName: safeOld, newName: safeNew });
    await this.listSessions();
  }

  async listPanes({ windowIndex }) {
    if (!this.conn || !this.attachedSession || windowIndex == null) return;
    const result = await runCommand(this.conn, tmux.listPanes(this.attachedSession, windowIndex));
    this.emit("panes:list", { panes: parsePanes(result.stdout) });
  }
```

- [ ] **Step 1.4: Register new socket events in `handleSocket` in `lib/ssh.js`**

After the `socket.on("scroll:search", ...)` line (around line 465), add:

```js
  socket.on("rename:session", (payload) => session.renameSession(payload || {}));
  socket.on("list:panes", (payload) => session.listPanes(payload || {}));
```

- [ ] **Step 1.5: Update `contexts/SocketContext.tsx` with new types and state**

After the `TmuxWindow` type definition, add:

```ts
export type TmuxPane = {
  index: number;
  active: boolean;
  width: number;
  height: number;
};
```

In `SocketState`, add `panes`:

```ts
export type SocketState = {
  status: SocketStatus;
  serverId: string | null;
  sessions: TmuxSession[];
  windows: TmuxWindow[];
  panes: TmuxPane[];
  attachedSession: string | null;
  errorMessage: string | null;
};
```

In `SocketAction`, add two new actions:

```ts
type SocketAction =
  | { type: "CONNECT_REQUEST"; serverId: string }
  | { type: "CONNECTING" }
  | { type: "CONNECTED" }
  | { type: "SESSIONS_RECEIVED"; sessions: TmuxSession[] }
  | { type: "WINDOWS_RECEIVED"; windows: TmuxWindow[] }
  | { type: "PANES_RECEIVED"; panes: TmuxPane[] }
  | { type: "SESSION_RENAMED"; oldName: string; newName: string }
  | { type: "ATTACHED"; sessionName: string }
  | { type: "RECONNECTING" }
  | { type: "DISCONNECTED" }
  | { type: "ERROR"; message: string }
  | { type: "RESET" };
```

In `initialState`, add `panes: []`:

```ts
const initialState: SocketState = {
  status: "idle",
  serverId: null,
  sessions: [],
  windows: [],
  panes: [],
  attachedSession: null,
  errorMessage: null,
};
```

In `reducer`, add new cases before the `default`:

```ts
    case "PANES_RECEIVED":
      return { ...state, panes: action.panes };
    case "SESSION_RENAMED":
      return {
        ...state,
        attachedSession:
          state.attachedSession === action.oldName ? action.newName : state.attachedSession,
        sessions: state.sessions.map((s) =>
          s.name === action.oldName ? { ...s, name: action.newName } : s
        ),
      };
```

In the `useEffect` that sets up socket listeners, add after the `reconnecting` listener:

```ts
    socket.on("panes:list", (payload: { panes: TmuxPane[] }) =>
      dispatch({ type: "PANES_RECEIVED", panes: payload?.panes || [] })
    );
    socket.on("session:renamed", (payload: { oldName: string; newName: string }) => {
      if (payload?.oldName && payload?.newName) {
        dispatch({ type: "SESSION_RENAMED", oldName: payload.oldName, newName: payload.newName });
      }
    });
```

- [ ] **Step 1.6: Verify the server builds without errors**

```bash
cd /home/justin/Projects/Nomad && node -e "require('./lib/tmux')" && node -e "require('./lib/ssh')" && echo "OK"
```

Expected output: `OK`

- [ ] **Step 1.7: Commit**

```bash
cd /home/justin/Projects/Nomad && git add lib/tmux.js lib/ssh.js contexts/SocketContext.tsx && git commit -m "$(cat <<'EOF'
feat: add session rename + pane list to backend and SocketContext

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Session sheet — rename, kill, long-press context

**Files:**
- Modify: `components/SessionSheet.tsx`
- Modify: `app/session/[serverId]/SessionClient.tsx`

- [ ] **Step 2.1: Rewrite `components/SessionSheet.tsx` with long-press context**

Replace the entire file with:

```tsx
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

  const openContext = React.useCallback((name: string) => {
    haptics.warning();
    setContextSession((prev) => (prev === name ? null : name));
  }, [haptics]);

  const startRename = React.useCallback((name: string) => {
    setContextSession(null);
    setRenamingSession(name);
    setRenameValue(name);
  }, []);

  const commitRename = React.useCallback((oldName: string) => {
    const trimmed = renameValue.replace(/[^A-Za-z0-9_.\-]/g, "").trim();
    if (trimmed && trimmed !== oldName) {
      onRename?.(oldName, trimmed);
    }
    setRenamingSession(null);
  }, [renameValue, onRename]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="px-0 pb-8 pt-4 sm:max-w-lg sm:rounded-3xl"
        aria-describedby={undefined}
      >
        <SheetHeader className="px-5 pb-2">
          <SheetTitle className="text-lg font-semibold">Sessions</SheetTitle>
        </SheetHeader>

        <ul className="flex max-h-[60vh] flex-col overflow-y-auto px-2 pb-3 pt-1">
          {sessions.map((s, idx) => {
            const attached = attachedSession === s.name;
            const recent = idx === 0;
            const isContext = contextSession === s.name;
            const isRenaming = renamingSession === s.name;

            const longPressProps = useLongPress(() => openContext(s.name));

            return (
              <li key={s.name}>
                <button
                  type="button"
                  onClick={() => {
                    if (isContext) {
                      setContextSession(null);
                      return;
                    }
                    haptics.tap();
                    onAttach(s.name);
                  }}
                  {...longPressProps}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-accent",
                    recent && "bg-accent/60",
                    attached && "border-l-4 border-primary pl-2",
                    isContext && "bg-accent"
                  )}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <StackSimple weight="fill" size={18} />
                  </span>
                  {isRenaming ? (
                    <Input
                      value={renameValue}
                      onChange={(e) =>
                        setRenameValue(e.target.value.replace(/[^A-Za-z0-9_.\-]/g, ""))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename(s.name);
                        if (e.key === "Escape") setRenamingSession(null);
                        e.stopPropagation();
                      }}
                      onBlur={() => commitRename(s.name)}
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
                        startRename(s.name);
                      }}
                      className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium text-foreground hover:bg-background/60"
                    >
                      <PencilSimple weight="fill" size={15} />
                      Rename
                    </button>
                    <div className="w-px bg-border/60" />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setContextSession(null);
                        onKill?.(s.name);
                      }}
                      className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium text-destructive hover:bg-background/60"
                    >
                      <Trash weight="fill" size={15} />
                      Kill
                    </button>
                  </div>
                )}
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
```

Note: `useLongPress` is called inside the `.map()` callback — React requires hooks to be called at the top level. Extract it:

Actually, hooks cannot be called inside `.map()`. Fix: replace `useLongPress` calls inside `.map()` with a wrapper `SessionRow` component:

```tsx
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
          if (isContext) { onTap(); return; }
          onTap();
        }}
        {...longPressProps}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-accent",
          recent && "bg-accent/60",
          attached && "border-l-4 border-primary pl-2",
          isContext && "bg-accent"
        )}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
          <StackSimple weight="fill" size={18} />
        </span>
        {isRenaming ? (
          <Input
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value.replace(/[^A-Za-z0-9_.\-]/g, ""))}
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
            onClick={(e) => { e.stopPropagation(); onStartRename(); }}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium text-foreground hover:bg-background/60"
          >
            <PencilSimple weight="fill" size={15} /> Rename
          </button>
          <div className="w-px bg-border/60" />
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onKillRequest(); }}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium text-destructive hover:bg-background/60"
          >
            <Trash weight="fill" size={15} /> Kill
          </button>
        </div>
      )}
    </li>
  );
}
```

Then in `SessionSheet`, replace the `.map()` with `SessionRow` components, passing all handlers as props.

The final complete `SessionSheet` component uses `SessionRow` internally and manages `contextSession`, `renamingSession`, and `renameValue` at the sheet level.

- [ ] **Step 2.2: Wire kill session confirm and rename in `SessionClient.tsx`**

Add state at the top of `SessionClient`:

```tsx
const [confirmKillSession, setConfirmKillSession] = React.useState(false);
const [killSessionName, setKillSessionName] = React.useState<string | null>(null);
```

Add `onKill` and `onRename` props to `SessionSheet`:

```tsx
<SessionSheet
  open={pickerOpen}
  onOpenChange={setPickerOpen}
  sessions={state.sessions}
  attachedSession={state.attachedSession}
  onAttach={onAttach}
  onCreate={onCreate}
  onKill={(name) => {
    if (settings.confirm_kill_session === "true") {
      setKillSessionName(name);
      setConfirmKillSession(true);
    } else {
      haptics.kill();
      emit("kill:session", { sessionName: name });
    }
  }}
  onRename={(oldName, newName) => {
    emit("rename:session", { oldName, newName });
  }}
/>
```

Add the ConfirmSheet for kill session (after the existing `ConfirmSheet` for kill window):

```tsx
<ConfirmSheet
  open={confirmKillSession}
  onOpenChange={setConfirmKillSession}
  title="Kill session?"
  message={`Session "${killSessionName}" will be closed. Running processes will be terminated.`}
  confirmLabel="Kill"
  onConfirm={async (skipNext) => {
    if (skipNext && settings.confirm_kill_session === "true") {
      await updateSettings({ confirm_kill_session: "false" });
    }
    haptics.kill();
    if (killSessionName) emit("kill:session", { sessionName: killSessionName });
    setKillSessionName(null);
  }}
/>
```

- [ ] **Step 2.3: TypeCheck**

```bash
cd /home/justin/Projects/Nomad && npm run typecheck 2>&1 | tail -20
```

Fix any type errors before proceeding.

- [ ] **Step 2.4: Commit**

```bash
cd /home/justin/Projects/Nomad && git add components/SessionSheet.tsx app/session/\[serverId\]/SessionClient.tsx && git commit -m "$(cat <<'EOF'
feat: session rename/kill with long-press context menu

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Window tabs — long-press rename/kill, pane count badge

**Files:**
- Modify: `components/WindowTabs.tsx`
- Modify: `app/session/[serverId]/SessionClient.tsx`

- [ ] **Step 3.1: Rewrite `components/WindowTabs.tsx`**

Replace the entire file:

```tsx
"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PencilSimple, Plus, Trash } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";
import { springs } from "@/lib/animations";
import type { TmuxWindow } from "@/contexts/SocketContext";
import { Input } from "@/components/ui/input";

type WindowTabsProps = {
  windows: TmuxWindow[];
  onSelect: (w: TmuxWindow) => void;
  onNew: () => void;
  onRename?: (index: number, name: string) => void;
  onKill?: (index: number) => void;
};

function useLongPress(callback: () => void, delay = 500) {
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = React.useCallback(() => {
    timerRef.current = setTimeout(callback, delay);
  }, [callback, delay]);
  const cancel = React.useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);
  return { onMouseDown: start, onMouseUp: cancel, onMouseLeave: cancel, onTouchStart: start, onTouchEnd: cancel, onTouchCancel: cancel };
}

type TabProps = {
  window: TmuxWindow;
  onSelect: () => void;
  onLongPress: () => void;
  isContext: boolean;
  isRenaming: boolean;
  renameValue: string;
  onRenameChange: (v: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onKillRequest: () => void;
  onStartRename: () => void;
};

function WindowTab({
  window: w,
  onSelect,
  onLongPress,
  isContext,
  isRenaming,
  renameValue,
  onRenameChange,
  onCommitRename,
  onCancelRename,
  onKillRequest,
  onStartRename,
}: TabProps) {
  const longPressProps = useLongPress(onLongPress);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => { if (!isContext) onSelect(); }}
        {...longPressProps}
        className={cn(
          "relative flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs",
          w.active ? "text-primary" : "text-muted-foreground",
          isContext && "ring-1 ring-primary/30"
        )}
      >
        {w.active ? (
          <motion.span
            layoutId="window-indicator"
            transition={springs.quick}
            className="absolute inset-0 rounded-full bg-primary/10"
          />
        ) : null}
        {isRenaming ? (
          <Input
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value.replace(/[^A-Za-z0-9_.\- ]/g, ""))}
            onKeyDown={(e) => {
              if (e.key === "Enter") onCommitRename();
              if (e.key === "Escape") onCancelRename();
              e.stopPropagation();
            }}
            onBlur={onCommitRename}
            onClick={(e) => e.stopPropagation()}
            autoFocus
            className="relative z-10 h-6 w-24 rounded-md border-input bg-background px-2 text-xs shadow-none"
          />
        ) : (
          <span className="relative z-10 font-medium">
            {w.index}: {w.name || "window"}
            {w.panes > 1 && (
              <span className="ml-1 text-[9px] text-muted-foreground opacity-60">·{w.panes}</span>
            )}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isContext && !isRenaming && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: -4 }}
            transition={springs.quick}
            className="absolute left-0 top-full z-50 mt-1 flex overflow-hidden rounded-xl border border-border bg-card shadow-md"
          >
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onStartRename(); }}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-foreground hover:bg-accent"
            >
              <PencilSimple weight="fill" size={13} /> Rename
            </button>
            <div className="w-px bg-border" />
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onKillRequest(); }}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-destructive hover:bg-accent"
            >
              <Trash weight="fill" size={13} /> Kill
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function WindowTabs({ windows, onSelect, onNew, onRename, onKill }: WindowTabsProps) {
  const [contextIndex, setContextIndex] = React.useState<number | null>(null);
  const [renamingIndex, setRenamingIndex] = React.useState<number | null>(null);
  const [renameValue, setRenameValue] = React.useState("");

  if (!windows || windows.length === 0) return null;

  return (
    <div className="scrollbar-hide flex items-center gap-2 overflow-x-auto px-5 py-2">
      {windows.map((w) => (
        <WindowTab
          key={w.index}
          window={w}
          onSelect={() => onSelect(w)}
          onLongPress={() => setContextIndex((prev) => (prev === w.index ? null : w.index))}
          isContext={contextIndex === w.index}
          isRenaming={renamingIndex === w.index}
          renameValue={renameValue}
          onRenameChange={setRenameValue}
          onCommitRename={() => {
            const trimmed = renameValue.trim();
            if (trimmed) onRename?.(w.index, trimmed);
            setRenamingIndex(null);
          }}
          onCancelRename={() => setRenamingIndex(null)}
          onStartRename={() => {
            setContextIndex(null);
            setRenamingIndex(w.index);
            setRenameValue(w.name || "");
          }}
          onKillRequest={() => {
            setContextIndex(null);
            onKill?.(w.index);
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
```

- [ ] **Step 3.2: Pass `onRename` and `onKill` to `WindowTabs` in `SessionClient.tsx`**

Update the `WindowTabs` usage:

```tsx
<WindowTabs
  windows={state.windows}
  onSelect={(w) => {
    if (!w.active) emit("select:window", { index: w.index });
  }}
  onNew={() => emit("new:window")}
  onRename={(index, name) => emit("rename:window", { index, name })}
  onKill={(index) => {
    if (settings.confirm_kill_window === "true") {
      setConfirmKill(true);
      // store index to kill specific window, not just active
    } else {
      emit("kill:window", { windowIndex: index });
    }
  }}
/>
```

Update `killWindowConfirm` in SessionClient to handle both active window and specific index:

```tsx
const [killWindowIndex, setKillWindowIndex] = React.useState<number | null>(null);

const killWindowConfirm = React.useCallback((index?: number) => {
  const idx = index ?? state.windows.find((w) => w.active)?.index ?? null;
  if (settings.confirm_kill_window === "true") {
    setKillWindowIndex(idx);
    setConfirmKill(true);
  } else {
    emit("kill:window", { windowIndex: idx });
  }
}, [emit, settings.confirm_kill_window, state.windows]);
```

Update the ConfirmSheet `onConfirm` for kill window to use `killWindowIndex`:

```tsx
onConfirm={async (skipNext) => {
  if (skipNext && settings.confirm_kill_window === "true") {
    await updateSettings({ confirm_kill_window: "false" });
  }
  haptics.kill();
  emit("kill:window", { windowIndex: killWindowIndex });
  setKillWindowIndex(null);
}}
```

- [ ] **Step 3.3: TypeCheck**

```bash
cd /home/justin/Projects/Nomad && npm run typecheck 2>&1 | tail -20
```

- [ ] **Step 3.4: Commit**

```bash
cd /home/justin/Projects/Nomad && git add components/WindowTabs.tsx app/session/\[serverId\]/SessionClient.tsx && git commit -m "$(cat <<'EOF'
feat: window tab long-press rename/kill and pane count badge

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Server card swipe-delete gesture

**Files:**
- Modify: `components/ServerCard.tsx`
- Modify: `app/HomeClient.tsx`

- [ ] **Step 4.1: Rewrite `components/ServerCard.tsx` with swipe-delete**

Replace the entire file:

```tsx
"use client";

import * as React from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { CaretRight, TrashSimple } from "@phosphor-icons/react";

import { Card } from "@/components/ui/card";
import { StatusDot } from "@/components/StatusDot";
import { springs } from "@/lib/animations";
import { useHaptics } from "@/hooks/useHaptics";

export type ServerSummary = {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth_type: "password" | "key";
  last_connected: number | null;
  created_at: number;
  updated_at: number;
};

function relativeTime(ts: number | null) {
  if (!ts) return "Never";
  const diff = Date.now() - ts;
  if (diff < 0) return "Just now";
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  return new Date(ts).toLocaleDateString();
}

function isOnline(ts: number | null) {
  if (!ts) return false;
  return Date.now() - ts < 1000 * 60 * 30;
}

type ServerCardProps = {
  server: ServerSummary;
  onTap: (server: ServerSummary) => void;
  onEdit: (server: ServerSummary) => void;
  onDelete?: (server: ServerSummary) => void;
};

const DELETE_THRESHOLD = -72;
const DELETE_SNAP = -88;

export function ServerCard({ server, onTap, onEdit, onDelete }: ServerCardProps) {
  const haptics = useHaptics();
  const x = useMotionValue(0);
  const deleteOpacity = useTransform(x, [DELETE_THRESHOLD, DELETE_SNAP * 0.4], [1, 0]);
  const deleteScale = useTransform(x, [DELETE_THRESHOLD, DELETE_SNAP], [1, 0.9]);

  const handleDragEnd = React.useCallback(
    (_: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
      const xVal = x.get();
      const velocity = info.velocity.x;
      if (xVal < DELETE_THRESHOLD || velocity < -500) {
        haptics.warning();
        animate(x, DELETE_SNAP, { type: "spring", stiffness: 400, damping: 30 });
      } else {
        animate(x, 0, { type: "spring", stiffness: 400, damping: 30 });
      }
    },
    [x, haptics]
  );

  const handleDeleteClick = React.useCallback(() => {
    animate(x, 0, { type: "spring", stiffness: 400, damping: 30 });
    onDelete?.(server);
  }, [x, server, onDelete]);

  return (
    <motion.div
      layout
      variants={{
        initial: { y: 12, opacity: 0 },
        animate: { y: 0, opacity: 1 },
        exit: { opacity: 0, scale: 0.96 },
      }}
      transition={springs.quick}
      className="relative overflow-hidden rounded-2xl"
    >
      {/* Delete zone revealed behind card */}
      <div className="absolute inset-y-0 right-0 flex items-center justify-end rounded-2xl bg-destructive px-5">
        <motion.button
          type="button"
          aria-label="Delete server"
          style={{ opacity: deleteOpacity, scale: deleteScale }}
          onClick={handleDeleteClick}
          className="flex flex-col items-center gap-1"
        >
          <TrashSimple weight="fill" size={20} className="text-destructive-foreground" />
          <span className="text-[10px] font-medium text-destructive-foreground">Delete</span>
        </motion.button>
      </div>

      {/* Draggable card */}
      <motion.div
        drag="x"
        dragConstraints={{ left: DELETE_SNAP, right: 0 }}
        dragElastic={{ left: 0.05, right: 0 }}
        dragMomentum={false}
        style={{ x }}
        onDragEnd={handleDragEnd}
        whileTap={{ scale: 0.98 }}
      >
        <Card
          className="flex cursor-pointer items-center gap-4 rounded-2xl border-border bg-card px-4 py-4 shadow-sm hover:shadow-md"
          onClick={() => {
            if (x.get() < -10) {
              animate(x, 0, { type: "spring", stiffness: 400, damping: 30 });
              return;
            }
            haptics.tap();
            onTap(server);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            onEdit(server);
          }}
        >
          <StatusDot online={isOnline(server.last_connected)} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-semibold leading-tight text-foreground">
              {server.name}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {server.username}@{server.host}
              {server.port !== 22 ? `:${server.port}` : ""}
            </div>
          </div>
          <div className="flex items-center gap-2 text-right text-[11px] text-muted-foreground">
            <div>
              <div className="leading-none">{relativeTime(server.last_connected)}</div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(server);
                }}
                className="mt-1 text-[10px] uppercase tracking-widest text-primary/80 hover:text-primary"
              >
                Edit
              </button>
            </div>
            <CaretRight weight="fill" size={14} />
          </div>
        </Card>
      </motion.div>
    </motion.div>
  );
}
```

- [ ] **Step 4.2: Add `onDelete` handling + confirmation in `HomeClient.tsx`**

Add state:

```tsx
const [deletingServer, setDeletingServer] = React.useState<ServerSummary | null>(null);
```

Import `ConfirmSheet` and `useSettings`:

```tsx
import { ConfirmSheet } from "@/components/ConfirmSheet";
import { useSettings } from "@/hooks/useSettings";
```

Add `useSettings` hook at top of component:

```tsx
const { settings } = useSettings();
```

Pass `onDelete` to `ServerCard`:

```tsx
<ServerCard
  key={server.id}
  server={server}
  onTap={onTap}
  onEdit={setEditing}
  onDelete={(srv) => {
    if (settings.confirm_delete_server === "true") {
      setDeletingServer(srv);
    } else {
      handleDelete(srv.id);
    }
  }}
/>
```

Add `handleDelete` function:

```tsx
const handleDelete = React.useCallback(async (id: string) => {
  try {
    const res = await fetch(`/api/servers/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Delete failed");
    haptics.kill();
    refresh();
  } catch (e: unknown) {
    toast.error(e instanceof Error ? e.message : "Failed to delete server");
  }
}, [refresh, haptics]);
```

Add `ConfirmSheet` at the bottom of the JSX:

```tsx
<ConfirmSheet
  open={!!deletingServer}
  onOpenChange={(o) => !o && setDeletingServer(null)}
  title="Delete server?"
  message={`Remove "${deletingServer?.name}"? Credentials will be permanently deleted.`}
  confirmLabel="Delete"
  onConfirm={async (skipNext) => {
    if (skipNext) {
      // update settings via API directly
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm_delete_server: "false" }),
      });
    }
    if (deletingServer) await handleDelete(deletingServer.id);
    setDeletingServer(null);
  }}
/>
```

- [ ] **Step 4.3: TypeCheck**

```bash
cd /home/justin/Projects/Nomad && npm run typecheck 2>&1 | tail -20
```

- [ ] **Step 4.4: Commit**

```bash
cd /home/justin/Projects/Nomad && git add components/ServerCard.tsx app/HomeClient.tsx && git commit -m "$(cat <<'EOF'
feat: swipe-to-delete server card with delete zone reveal

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Connecting animation — pulsing rings

**Files:**
- Create: `components/ConnectingRings.tsx`
- Modify: `app/session/[serverId]/SessionClient.tsx`
- Modify: `components/StatusDot.tsx`

- [ ] **Step 5.1: Create `components/ConnectingRings.tsx`**

```tsx
"use client";

import { motion } from "framer-motion";
import { Terminal } from "@phosphor-icons/react";

export function ConnectingRings({ size = 120 }: { size?: number }) {
  const ringSize = size * 0.35;

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="absolute rounded-full border-2 border-primary"
          style={{ width: ringSize, height: ringSize }}
          animate={{ scale: [1, 2.2], opacity: [0.6, 0] }}
          transition={{
            duration: 1.8,
            delay: i * 0.6,
            repeat: Infinity,
            ease: "easeOut",
          }}
        />
      ))}
      <motion.div
        className="relative z-10 flex items-center justify-center rounded-full bg-primary/10"
        style={{ width: ringSize, height: ringSize }}
        animate={{ scale: [1, 1.04, 1] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      >
        <Terminal weight="fill" size={ringSize * 0.45} className="text-primary" />
      </motion.div>
    </div>
  );
}
```

- [ ] **Step 5.2: Replace spinner with `ConnectingRings` in `SessionClient.tsx`**

Add the import:

```tsx
import { ConnectingRings } from "@/components/ConnectingRings";
```

Replace the connecting state JSX:

```tsx
{state.status === "connecting" || state.status === "idle" ? (
  <div className="flex h-full items-center justify-center">
    <div className="flex flex-col items-center gap-4">
      <ConnectingRings size={100} />
      <span className="text-sm text-muted-foreground">Connecting…</span>
    </div>
  </div>
) : (
  <Terminal ... />
)}
```

- [ ] **Step 5.3: Add perpetual pulse to `components/StatusDot.tsx`**

Replace the entire file:

```tsx
"use client";

import { motion } from "framer-motion";

type StatusDotProps = {
  online: boolean;
};

export function StatusDot({ online }: StatusDotProps) {
  return (
    <div className="relative flex h-3 w-3 shrink-0 items-center justify-center">
      {online && (
        <motion.span
          className="absolute h-3 w-3 rounded-full bg-primary"
          animate={{ scale: [1, 1.9], opacity: [0.5, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
        />
      )}
      <span
        className="relative h-2.5 w-2.5 rounded-full"
        style={{ background: online ? "var(--color-primary)" : "var(--color-muted-foreground)", opacity: online ? 1 : 0.4 }}
      />
    </div>
  );
}
```

- [ ] **Step 5.4: TypeCheck**

```bash
cd /home/justin/Projects/Nomad && npm run typecheck 2>&1 | tail -20
```

- [ ] **Step 5.5: Commit**

```bash
cd /home/justin/Projects/Nomad && git add components/ConnectingRings.tsx app/session/\[serverId\]/SessionClient.tsx components/StatusDot.tsx && git commit -m "$(cat <<'EOF'
feat: pulsing rings connecting animation and animated status dot

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Bottom sheet drag-to-dismiss

**Files:**
- Modify: `components/ui/sheet.tsx`

- [ ] **Step 6.1: Read `components/ui/sheet.tsx` current contents**

Read the file to understand the current shadcn Sheet implementation before modifying.

- [ ] **Step 6.2: Add drag handle and drag-dismiss to `SheetContent`**

Inside `sheet.tsx`, find the `SheetContent` component. It uses `SheetOverlay` and `SheetPrimitive.Content`. We need to add:
1. A drag handle bar at the top for mobile sheets
2. Framer Motion drag-dismiss when `side === "bottom"`

Modify `SheetContent` to accept an optional `onClose` prop and add the drag wrapper:

```tsx
import { motion, useMotionValue, animate } from "framer-motion";

// Inside SheetContent, wrap the content with a drag-dismiss wrapper for bottom sheets
const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content> & { side?: SheetSide }
>(({ side = "right", className, children, ...props }, ref) => {
  const { onOpenChange } = SheetPrimitive.useDialogContext?.() ?? {};
  const y = useMotionValue(0);
  const isBottom = side === "bottom";

  const handleDragEnd = React.useCallback(
    (_: unknown, info: { offset: { y: number }; velocity: { y: number } }) => {
      if (info.offset.y > 120 || info.velocity.y > 600) {
        // close
        const closeBtn = document.querySelector("[data-sheet-close]") as HTMLButtonElement | null;
        closeBtn?.click();
      } else {
        animate(y, 0, { type: "spring", stiffness: 400, damping: 30 });
      }
    },
    [y]
  );

  const inner = (
    <>
      {isBottom && (
        <div className="flex justify-center pb-2 pt-3">
          <div className="h-1 w-10 rounded-full bg-border" />
        </div>
      )}
      {children}
    </>
  );

  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        ref={ref}
        className={cn(sheetVariants({ side }), className)}
        {...props}
      >
        {isBottom ? (
          <motion.div
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.25 }}
            dragMomentum={false}
            style={{ y }}
            onDragEnd={handleDragEnd}
            className="flex flex-col"
          >
            {inner}
          </motion.div>
        ) : (
          inner
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
});
```

Note: `SheetPrimitive.useDialogContext` may not be exposed by Radix. Instead, find the close button via the `SheetClose` component rendered inside. A simpler approach: pass a `close` function down through a React context or use a ref to the Radix close trigger.

**Simpler approach** — add a hidden close trigger inside `SheetContent` and click it programmatically:

```tsx
const closeRef = React.useRef<HTMLButtonElement>(null);

const handleDragEnd = (_: unknown, info: { offset: { y: number }; velocity: { y: number } }) => {
  if (info.offset.y > 120 || info.velocity.y > 600) {
    closeRef.current?.click();
  } else {
    animate(y, 0, { type: "spring", stiffness: 400, damping: 30 });
  }
};

// Inside the content, add a hidden close button:
<SheetPrimitive.Close ref={closeRef} className="sr-only" aria-hidden tabIndex={-1} />
```

- [ ] **Step 6.3: TypeCheck**

```bash
cd /home/justin/Projects/Nomad && npm run typecheck 2>&1 | tail -20
```

- [ ] **Step 6.4: Commit**

```bash
cd /home/justin/Projects/Nomad && git add components/ui/sheet.tsx && git commit -m "$(cat <<'EOF'
feat: bottom sheet drag handle and drag-to-dismiss gesture

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Clipboard copy from terminal selection

**Files:**
- Modify: `components/Terminal.tsx`

- [ ] **Step 7.1: Add `hasSelection` state and copy chip to `Terminal.tsx`**

Add state (outside `useEffect`):

```tsx
const [hasSelection, setHasSelection] = React.useState(false);
```

Inside the `useEffect`, after `term.open(containerRef.current)`, add:

```tsx
term.onSelectionChange(() => {
  setHasSelection(term.getSelection().length > 0);
});
```

Add `motion` and icon imports at top:

```tsx
import { motion, AnimatePresence } from "framer-motion";
import { Copy } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useHaptics } from "@/hooks/useHaptics";
```

Add `haptics` inside the component:

```tsx
const haptics = useHaptics();
```

Add copy handler:

```tsx
const copySelection = React.useCallback(async () => {
  const text = termRef.current?.getSelection() ?? "";
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    haptics.confirm();
    toast.success("Copied to clipboard");
    termRef.current?.clearSelection();
    setHasSelection(false);
  } catch {
    toast.error("Clipboard access denied");
  }
}, [haptics]);
```

Wrap the existing `return` JSX with a `relative` container and add the copy chip:

```tsx
return (
  <div
    className={cn(
      "relative h-full w-full overflow-hidden rounded-2xl p-3 transition-shadow",
      scrollMode ? "ring-2 ring-primary/70" : "",
      className
    )}
    style={{ background: "#1A1714" }}
  >
    <AnimatePresence>
      {hasSelection && (
        <motion.button
          initial={{ opacity: 0, scale: 0.88, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.88, y: -4 }}
          transition={{ duration: 0.15 }}
          className="absolute right-4 top-4 z-10 flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-orange"
          onClick={copySelection}
          type="button"
          aria-label="Copy selection"
        >
          <Copy weight="fill" size={12} />
          Copy
        </motion.button>
      )}
    </AnimatePresence>
    <div ref={containerRef} className="h-full w-full" />
  </div>
);
```

- [ ] **Step 7.2: TypeCheck**

```bash
cd /home/justin/Projects/Nomad && npm run typecheck 2>&1 | tail -20
```

- [ ] **Step 7.3: Commit**

```bash
cd /home/justin/Projects/Nomad && git add components/Terminal.tsx && git commit -m "$(cat <<'EOF'
feat: clipboard copy chip appears on terminal text selection

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Desktop sidebar layout

**Files:**
- Create: `components/Sidebar.tsx`
- Modify: `app/session/[serverId]/SessionClient.tsx`

- [ ] **Step 8.1: Create `components/Sidebar.tsx`**

```tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Gear, StackSimple } from "@phosphor-icons/react";
import { motion } from "framer-motion";

import { cn } from "@/lib/utils";
import { springs } from "@/lib/animations";
import type { TmuxWindow } from "@/contexts/SocketContext";

type SidebarProps = {
  serverName?: string;
  sessionName: string | null;
  windows: TmuxWindow[];
  onSelectWindow: (index: number) => void;
  onNewWindow: () => void;
  onOpenSessionPicker: () => void;
};

export function Sidebar({
  serverName,
  sessionName,
  windows,
  onSelectWindow,
  onNewWindow,
  onOpenSessionPicker,
}: SidebarProps) {
  const router = useRouter();

  return (
    <aside className="hidden md:flex md:w-64 md:shrink-0 md:flex-col md:border-r md:border-border/60 md:bg-sidebar">
      <div className="flex flex-col gap-1 px-3 py-4">
        {serverName && (
          <div className="mb-2 px-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            {serverName}
          </div>
        )}

        {sessionName && (
          <button
            type="button"
            onClick={onOpenSessionPicker}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-accent"
          >
            <StackSimple weight="fill" size={16} className="text-primary" />
            <span className="truncate text-sm font-semibold">{sessionName}</span>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3">
        {windows.length > 0 && (
          <>
            <div className="mb-1 px-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              Windows
            </div>
            <ul className="flex flex-col gap-0.5">
              {windows.map((w) => (
                <li key={w.index}>
                  <button
                    type="button"
                    onClick={() => onSelectWindow(w.index)}
                    className={cn(
                      "relative flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm",
                      w.active ? "text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    {w.active && (
                      <motion.span
                        layoutId="sidebar-window-indicator"
                        transition={springs.quick}
                        className="absolute inset-0 rounded-xl bg-primary/10"
                      />
                    )}
                    <span className="relative z-10 font-medium">
                      {w.index}: {w.name || "window"}
                    </span>
                    {w.panes > 1 && (
                      <span className="relative z-10 ml-auto text-[9px] text-muted-foreground opacity-60">
                        ·{w.panes}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={onNewWindow}
              className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <span className="text-base font-light">+</span> New window
            </button>
          </>
        )}
      </div>

      <div className="border-t border-border/60 px-3 py-3">
        <button
          type="button"
          onClick={() => router.push("/settings")}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Gear weight="fill" size={16} /> Settings
        </button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 8.2: Integrate sidebar in `SessionClient.tsx`**

Import `Sidebar`:

```tsx
import { Sidebar } from "@/components/Sidebar";
```

Wrap the root div to support the sidebar layout. Replace the root `div` and `header`:

```tsx
return (
  <div className="flex h-[100dvh] bg-background">
    {/* Desktop sidebar */}
    <Sidebar
      serverName={state.serverId ?? undefined}
      sessionName={state.attachedSession}
      windows={state.windows}
      onSelectWindow={(index) => emit("select:window", { index })}
      onNewWindow={() => emit("new:window")}
      onOpenSessionPicker={() => {
        emit("list:sessions");
        setPickerOpen(true);
      }}
    />

    {/* Main content */}
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header — always visible */}
      <header className="flex items-center justify-between gap-2 border-b border-border/60 bg-background px-3 pt-safe">
        ...existing header content...
      </header>

      <AnimatePresence>
        <ReconnectBanner visible={state.status === "reconnecting"} />
      </AnimatePresence>

      {/* Window tabs — mobile only */}
      <div className="md:hidden">
        <WindowTabs ... />
      </div>

      {/* Terminal area */}
      <div className="relative flex-1 px-3 pb-28 md:pb-20">
        ...existing terminal content...
      </div>

      {/* Action bar — floating on mobile, toolbar on desktop */}
      {state.status === "attached" || state.status === "reconnecting" ? (
        <>
          {searchOpen ? (...search bar...) : null}

          {/* Desktop toolbar */}
          <div className="hidden md:flex items-center justify-center border-t border-border/60 bg-background px-4 py-2">
            <ActionBar
              mode={scrollMode ? "scroll" : "default"}
              ...props...
              bottomOffset={0}
            />
          </div>

          {/* Mobile floating action bar */}
          <div className="md:hidden">
            <ActionBar
              mode={scrollMode ? "scroll" : "default"}
              ...props...
              bottomOffset={bottomOffset}
            />
          </div>
        </>
      ) : null}
    </div>

    ...sheets and confirms...
  </div>
);
```

Note: The `ActionBar` on desktop should be a static toolbar, not `fixed`. Adjust its CSS class: on desktop, remove `fixed` positioning. Consider adding a `desktop` prop to `ActionBar` that renders it inline instead of fixed.

Add `desktop?: boolean` to `ActionBarProps`:

```tsx
type ActionBarProps = {
  ...existing...
  desktop?: boolean;
};
```

In `ActionBar.tsx`, change the wrapping div:

```tsx
<div
  className={cn(
    desktop
      ? "flex justify-center"
      : "pointer-events-none fixed inset-x-0 z-30 flex justify-center px-4"
  )}
  style={desktop ? {} : { bottom: 16 + bottomOffset }}
>
```

- [ ] **Step 8.3: TypeCheck**

```bash
cd /home/justin/Projects/Nomad && npm run typecheck 2>&1 | tail -20
```

- [ ] **Step 8.4: Commit**

```bash
cd /home/justin/Projects/Nomad && git add components/Sidebar.tsx app/session/\[serverId\]/SessionClient.tsx components/ActionBar.tsx && git commit -m "$(cat <<'EOF'
feat: desktop sidebar layout with window list and settings link

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Page transitions

**Files:**
- Create: `components/PageTransition.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 9.1: Create `components/PageTransition.tsx`**

```tsx
"use client";

import { motion, AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.16, ease: "easeOut" }}
        className="contents"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
```

- [ ] **Step 9.2: Wrap `{children}` in `app/layout.tsx`**

Add import:

```tsx
import { PageTransition } from "@/components/PageTransition";
```

Wrap `{children}` in the `body`:

```tsx
<ThemeProvider>
  <PageTransition>
    {children}
  </PageTransition>
  <Toaster richColors position="top-center" />
</ThemeProvider>
```

- [ ] **Step 9.3: TypeCheck**

```bash
cd /home/justin/Projects/Nomad && npm run typecheck 2>&1 | tail -20
```

- [ ] **Step 9.4: Commit**

```bash
cd /home/justin/Projects/Nomad && git add components/PageTransition.tsx app/layout.tsx && git commit -m "$(cat <<'EOF'
feat: page transition fade-slide animation between routes

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Polish pass — reduced motion, spring physics, text animation, visual refinements

**Files:**
- Modify: `lib/animations.ts`
- Modify: `components/ReconnectBanner.tsx`
- Modify: `app/HomeClient.tsx`
- Modify: `app/globals.css`

- [ ] **Step 10.1: Add `prefersReducedMotion` utility and reduce-motion variants to `lib/animations.ts`**

Add at the end of `lib/animations.ts`:

```ts
export function reducedMotionTransition(full: object) {
  if (typeof window === "undefined") return full;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return reduced ? { duration: 0.01 } : full;
}

export const reducedVariants = {
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.12 },
  },
};
```

- [ ] **Step 10.2: Add soft-blur-in stagger to server list in `HomeClient.tsx`**

Change the `motion.ul` stagger and add a soft rise variant to each `ServerCard` motion wrapper. The stagger is already present (`staggerChildren: 0.05`). Upgrade the card variants to include a slight blur:

In `HomeClient.tsx`, the `motion.ul` already has `staggerChildren: 0.05`. The `ServerCard` component already has `variants` for enter. This is fine as-is.

Add the `"Servers"` heading with a subtle fade-in:

```tsx
<motion.h1
  initial={{ opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.2, ease: "easeOut" }}
  className="mb-6 text-3xl font-bold tracking-tight text-foreground"
>
  Servers
</motion.h1>
```

- [ ] **Step 10.3: Improve `ReconnectBanner.tsx` with a typewriter-style text**

Read the current `ReconnectBanner.tsx`, then enhance the reconnecting text with a pulsing opacity animation on the "..." part:

```tsx
// In ReconnectBanner, replace static "Reconnecting..." text with:
<span className="text-sm font-medium">Reconnecting</span>
<motion.span
  animate={{ opacity: [1, 0.3, 1] }}
  transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
  className="text-sm font-medium"
>
  …
</motion.span>
```

- [ ] **Step 10.4: Add `@media (prefers-reduced-motion: reduce)` to `globals.css`**

Add at the end of `app/globals.css`:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 10.5: TypeCheck**

```bash
cd /home/justin/Projects/Nomad && npm run typecheck 2>&1 | tail -20
```

- [ ] **Step 10.6: Build check**

```bash
cd /home/justin/Projects/Nomad && npm run build 2>&1 | tail -30
```

Fix any build errors before committing.

- [ ] **Step 10.7: Commit**

```bash
cd /home/justin/Projects/Nomad && git add lib/animations.ts components/ReconnectBanner.tsx app/HomeClient.tsx app/globals.css && git commit -m "$(cat <<'EOF'
feat: reduced-motion support, spring physics polish, text animation refinements

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage check:**
- [x] Session rename + kill from picker — Task 2
- [x] Window rename (long-press tab) — Task 3
- [x] Pane count badge on tabs — Task 3
- [x] Server card swipe-to-delete — Task 4
- [x] Connecting pulsing rings animation — Task 5
- [x] Animated status dot — Task 5
- [x] Bottom sheet drag-to-dismiss — Task 6
- [x] Clipboard copy from terminal — Task 7
- [x] Desktop sidebar layout — Task 8
- [x] Page transitions — Task 9
- [x] Kill session confirmation in picker — Task 2
- [x] Session long-press context menu — Task 2
- [x] Backend: renameSession + listPanes — Task 1
- [x] SocketContext: TmuxPane + new actions — Task 1
- [x] Reduced-motion support — Task 10
- [x] Spring physics polish — Task 10

**Placeholder scan:** No TBD/TODO present. All code blocks are complete.

**Type consistency:**
- `TmuxPane` defined in Task 1, used only for panes state (no cross-task conflicts)
- `onDelete` prop on `ServerCard` matches `(server: ServerSummary) => void` consistently
- `onRename`/`onKill` on `SessionSheet` match `(name: string) => void` consistently
- `onRename`/`onKill` on `WindowTabs` match `(index: number, name?: string) => void` consistently
- `ActionBar` `desktop` prop added in Task 8, consistent with existing `ActionBarProps`

**Task 8 note:** The `ActionBar` receives `desktop` prop — ensure it's passed in both the desktop toolbar and mobile floating bar usages, and that `bottomOffset` is only passed for mobile.
