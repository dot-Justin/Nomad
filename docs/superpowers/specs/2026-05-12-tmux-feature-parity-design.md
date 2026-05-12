# Nomad: tmux Feature Parity Design

**Date:** 2026-05-12  
**Scope:** Close all gaps between current implementation and near-complete tmux feature parity, with a polished mobile-first UX.

---

## 1. Backend Additions

### 1.1 `lib/tmux.js` new commands

```js
renameSession(oldName, newName)
// tmux rename-session -t <old> <new>

listPanes(sessionName, windowIndex)
// tmux list-panes -t <session>:<index> -F '#{pane_index}|#{pane_active}|#{pane_width}|#{pane_height}'

parsePanes(stdout)
// Returns [{ index, active, width, height }]
```

### 1.2 `lib/ssh.js` new socket events

**Client → server:**
```
rename:session   { oldName, newName }
list:panes       { windowIndex }
```

**Server → client:**
```
session:renamed  { oldName, newName }
panes:list       { panes: [{ index, active, width, height }] }
```

`SshSession` gains:
- `renameSession({ oldName, newName })` — runs `tmux rename-session`, updates `this.attachedSession` if renamed, re-emits sessions list
- `listPanes({ windowIndex })` — runs `tmux list-panes`, emits `panes:list`

### 1.3 SocketContext additions

`TmuxPane` type added. `SocketState` gains `panes: TmuxPane[]`. New reducer action `PANES_RECEIVED`.

---

## 2. Session Management

### 2.1 Session rename + kill from picker

`SessionSheet` changes:
- Long-press (500ms `touchstart` / `mousedown` timer) on session row opens an inline context row beneath the item
- Context row: **Rename** (pencil icon) and **Kill** (X icon)
- Rename: replaces session row with an inline input pre-filled with current name; pressing Enter emits `rename:session`; Escape cancels
- Kill: emits `kill:session` directly, or opens `ConfirmSheet` if `confirm_kill_session === "true"`

Wire `onKill` prop in `SessionClient.tsx`:
```tsx
onKill={(name) => {
  if (settings.confirm_kill_session === "true") {
    setKillSessionName(name);
    setConfirmKillSession(true);
  } else {
    haptics.kill();
    emit("kill:session", { sessionName: name });
  }
}}
```

### 2.2 SocketContext session rename handling

On `session:renamed`, update `attachedSession` in state if it matches `oldName`. Re-fetch sessions list.

---

## 3. Window Management

### 3.1 Window tab long-press context

`WindowTabs` changes:
- Long-press (500ms) on a window tab opens a small context popover/dropdown anchored to the tab
- Options: **Rename** and **Kill**
- Rename: replaces tab text with an inline `<input>` that auto-focuses; blur or Enter emits `rename:window`; Escape cancels
- Kill: emits `kill:window` (with confirmation in `SessionClient` per existing `confirm_kill_window` setting)

### 3.2 Pane count badge

When a window has `panes > 1`, show a small dot badge on the tab:
```tsx
{w.panes > 1 && (
  <span className="ml-1 text-[9px] text-muted-foreground opacity-70">·{w.panes}</span>
)}
```

Window list polling already returns `panes` count from tmux format string.

---

## 4. Server Card Swipe-Delete

`ServerCard` changes:
- Wrap card in a `motion.div` with `drag="x"` constrained to `dragConstraints={{ left: -100, right: 0 }}`
- At drag offset ≤ −70px, reveal a destructive red delete zone on the right via `z-index` layering
- On drag end: if `offset.x < -70`, snap to −90 and show delete zone; if snapping back, return to 0
- Delete zone button triggers `onDelete(server)` (new prop on `ServerCard`)
- `HomeClient` passes `onDelete` that calls ConfirmSheet if `confirm_delete_server === "true"`, otherwise calls DELETE API directly

The delete animation: on confirm, the card animates `height → 0` and `opacity → 0` before removing from list.

---

## 5. Connecting Animation

Replace the `<Spinner>` in the connecting state with a `<ConnectingRings>` component.

```tsx
// components/ConnectingRings.tsx
// 3 SVG circles, each animates:
//   scale: 0.8 → 1.4, opacity: 0.8 → 0
//   delay: 0s, 0.5s, 1.0s
//   duration: 1.5s per ring, repeat: Infinity
// Ring color: text-primary (currentColor stroke)
```

Used in:
- `SessionClient` connecting state (replacing spinner)
- Optionally: server card tap animation before navigation

---

## 6. Bottom Sheet Drag-Dismiss

Augment `BottomSheet.tsx` (and by extension `SessionSheet`, `AddServerSheet`, etc.) with:

- A drag handle bar at the top of every bottom sheet
- The `SheetContent` inner div wrapped in a `motion.div` with `drag="y"` on the handle area
- `dragConstraints={{ top: 0 }}` (only allows downward drag)
- `onDragEnd`: check `offset.y > sheetHeight * 0.35` OR `velocity.y > 600` → call `onOpenChange(false)`
- Backdrop tap already closes (Radix default)

Implementation: add a `useDragDismiss` hook that returns `dragProps` and `handleRef`. Apply to SheetContent's inner wrapper.

---

## 7. Clipboard Copy

In `Terminal.tsx`:
- Add `React.useState<boolean>(false)` for `hasSelection`
- In `useEffect`, call `term.onSelectionChange(() => setHasSelection(term.getSelection().length > 0))`
- Render a floating `Copy` chip above the terminal when `hasSelection`:
  ```tsx
  {hasSelection && (
    <motion.button
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-orange"
      onClick={copySelection}
    >
      <Copy weight="fill" size={12} /> Copy
    </motion.button>
  )}
  ```
- `copySelection`: `navigator.clipboard.writeText(term.getSelection())` + haptic `confirm` + toast "Copied"

Terminal container gets `position: relative`.

---

## 8. Desktop Sidebar Layout

Breakpoint: `md` (768px+).

### 8.1 Layout change

`app/session/[serverId]/SessionClient.tsx`:
- On `md+`, render a two-column layout: `w-64 shrink-0` sidebar + `flex-1` main
- Sidebar contains: server name, window list (replacing `WindowTabs` on desktop), settings link at bottom
- `WindowTabs` renders inside sidebar on desktop, above terminal on mobile

`app/page.tsx` / `HomeClient.tsx`:
- On `md+`, add a persistent `aside` with server list; mobile retains current full-screen layout
- But since server list is its own route on mobile, the desktop sidebar just provides a persistent navigation context. For v1, keeping current routing but making the session page sidebar-aware is sufficient.

### 8.2 Session page desktop layout

```
┌────────────────┬─────────────────────────────────────┐
│ 260px sidebar  │ header (session name + disconnect)  │
│                ├─────────────────────────────────────┤
│ Server name    │ terminal area                       │
│ ─────────────  │                                     │
│ Window list    │                                     │
│ (clickable)    │                                     │
│                │                                     │
│ ─────────────  │                                     │
│ Settings →     │                                     │
└────────────────┴─────────────────────────────────────┘
```

- Action bar: on desktop, becomes a horizontal toolbar row above the terminal (not floating)
- Sheets: on desktop, sheets become centered `Dialog` components (`sm:max-w-lg sm:rounded-3xl` already handles this)

---

## 9. Page Transitions

`app/layout.tsx`: wrap `{children}` in a client boundary `PageTransition` component.

```tsx
// components/PageTransition.tsx
"use client";
import { motion, AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";

export function PageTransition({ children }) {
  const pathname = usePathname();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
```

Used in `app/layout.tsx` to wrap the main content.

---

## 10. Implementation Order (commit blocks)

1. **Backend** — `tmux.js` + `ssh.js` additions + `SocketContext` types
2. **Session sheet** — rename/kill UI, long-press, wire confirmations
3. **Window tabs** — long-press rename/kill, pane count badge
4. **Server card** — swipe-delete gesture + HomeClient wiring
5. **Connecting animation** — `ConnectingRings` component
6. **Drag-dismiss** — bottom sheet drag handle + gesture
7. **Clipboard** — terminal copy chip
8. **Desktop sidebar** — session page layout adaptation
9. **Page transitions** — `PageTransition` component

---

## Non-goals

- Pane creation (split-window) — deferred; mobile screens too small
- tmux command prompt (`:` mode) — deferred
- Scrollback buffer clipboard (tmux copy-mode buffer sync) — deferred
- Service worker updates — deferred
