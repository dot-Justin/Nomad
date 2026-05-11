# Nomad: Complete Implementation Spec

> Mobile-first tmux web UI. Build this entirely from this document.

---

## 1. What this is

Nomad is a self-hosted web application that lets you manage tmux sessions on remote servers via SSH, entirely from a browser. It is mobile-first but fully functional on desktop. No SSH client app needed. Install it once on a server or homelab machine, then access it over Tailscale, a local network, or another private ingress setup.

Core user flow:

1. Open Nomad in browser, or as an installed PWA.
2. See a list of saved servers.
3. Tap a server.
4. Nomad connects over SSH.
5. A tmux session picker appears.
6. Select or auto-attach to a session.
7. Use a full terminal in the browser.
8. Use a floating action bar for common tmux controls.
9. No keyboard shortcuts are needed for common actions.

---

## 2. Architecture

```txt
┌─────────────────────────────────────────┐
│  Next.js App Router frontend             │
│  Tailwind CSS v4                         │
│  shadcn/ui components                    │
│  tweakcn-generated theme                 │
│  Phosphor Icons                          │
│  Framer Motion                           │
│  xterm.js terminal emulator              │
│  Socket.IO client                        │
└────────────────┬────────────────────────┘
                 │ HTTP + WebSocket
┌────────────────▼────────────────────────┐
│  Custom Node.js server                   │
│  Express handles Next.js requests        │
│  Socket.IO handles WebSocket             │
│  ssh2 manages SSH connections            │
│  better-sqlite3-multiple-ciphers DB      │
└─────────────────────────────────────────┘
```

Why a custom server:

Next.js API routes do not support persistent WebSocket connections in the way this app needs. A custom `server.js` wraps Next.js with Express and Socket.IO in the same Node.js process, sharing port `3000`.

Single repo structure:

```txt
nomad/
├── server.js
├── lib/
│   ├── db.js
│   ├── ssh.js
│   └── tmux.js
├── app/
│   ├── globals.css
│   ├── layout.tsx
│   ├── manifest.ts
│   ├── page.tsx
│   ├── settings/page.tsx
│   └── session/[serverId]/page.tsx
├── components/
│   ├── ServerCard.tsx
│   ├── AddServerSheet.tsx
│   ├── EditServerSheet.tsx
│   ├── SessionSheet.tsx
│   ├── NewSessionInput.tsx
│   ├── Terminal.tsx
│   ├── ActionBar.tsx
│   ├── WindowTabs.tsx
│   ├── BottomSheet.tsx
│   ├── ConfirmSheet.tsx
│   ├── NavBar.tsx
│   ├── EmptyState.tsx
│   ├── StatusDot.tsx
│   ├── SegmentedControl.tsx
│   ├── Spinner.tsx
│   └── ReconnectBanner.tsx
├── contexts/
│   ├── SocketContext.tsx
│   ├── SettingsContext.tsx
│   └── ThemeProvider.tsx
├── hooks/
│   ├── useSocket.ts
│   ├── useSettings.ts
│   ├── useHaptics.ts
│   └── useTerminal.ts
├── public/
│   ├── topo-pattern.svg
│   └── icons/
├── tailwind.config.ts
├── next.config.ts
├── tsconfig.json
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 3. Dependencies

### 3.1 shadcn/ui, tweakcn theme, and icon setup

Nomad should be built on shadcn/ui as the component foundation. Use shadcn because it gives fast project startup, accessible primitives, and full source-level customization. The visual system should come from the tweakcn-generated theme in section 7.1.

Use tweakcn as the theme source:

```txt
https://tweakcn.com/
```

Bootstrap shadcn first:

```bash
npx shadcn@latest init
```

When prompted:

* Style: Default
* Base color: any, because the custom tweakcn theme overrides it
* CSS variables: Yes

Install the components used in Nomad:

```bash
npx shadcn@latest add button input label switch select separator card sheet dialog sonner textarea checkbox
```

shadcn components used and where:

| Component   | Usage                                             |
| ----------- | ------------------------------------------------- |
| `Button`    | All buttons throughout the app                    |
| `Input`     | Server form fields and settings fields            |
| `Textarea`  | SSH key field                                     |
| `Label`     | Form labels                                       |
| `Switch`    | Settings toggles                                  |
| `Select`    | Font family, cursor style, terminal theme pickers |
| `Separator` | Section dividers                                  |
| `Card`      | Server cards and settings groups                  |
| `Sheet`     | Mobile bottom sheets                              |
| `Dialog`    | Desktop modal variant of sheets                   |
| `Checkbox`  | "Don't show again" destructive confirmations      |
| `Sonner`    | Toast notifications                               |

Do not use lucide-react.

Use `@phosphor-icons/react` exclusively. Phosphor Icons should usually use `weight="fill"`.

### 3.2 Package.json dependencies

```json
{
  "dependencies": {
    "next": "15.x",
    "react": "19.x",
    "react-dom": "19.x",
    "express": "^4.18.0",
    "socket.io": "^4.7.0",
    "socket.io-client": "^4.7.0",
    "ssh2": "^1.17.0",
    "better-sqlite3-multiple-ciphers": "^9.x",
    "@xterm/xterm": "^5.x",
    "@xterm/addon-fit": "^0.10.x",
    "@xterm/addon-attach": "^0.11.x",
    "@xterm/addon-web-links": "^0.11.x",
    "@xterm/addon-search": "^0.15.x",
    "framer-motion": "^11.x",
    "web-haptics": "latest",
    "@phosphor-icons/react": "^2.x",
    "tailwind-merge": "^2.x",
    "clsx": "^2.x",
    "class-variance-authority": "^0.7.x",
    "next-themes": "^0.3.x",
    "sonner": "^1.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "@types/node": "^20.x",
    "@types/react": "^19.x",
    "@types/better-sqlite3": "^7.x",
    "tailwindcss": "^4.x",
    "autoprefixer": "^10.x",
    "postcss": "^8.x"
  }
}
```

---

## 4. Server: `server.js`

The custom server runs everything. It must:

* Start Next.js programmatically.
* Attach Express to handle Next.js requests.
* Attach Socket.IO to the same HTTP server.
* Manage active SSH connections keyed by Socket.IO socket ID.
* Expose REST endpoints for server CRUD and settings.
* Forward all other requests to Next.js.

```js
const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const express = require("express");
const { Server } = require("socket.io");
const { initDB } = require("./lib/db");
const { handleSocket } = require("./lib/ssh");

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT || 3000);

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const expressApp = express();

  expressApp.use(express.json());

  expressApp.get("/api/servers", async (req, res) => {
    // Return saved servers without credential field.
  });

  expressApp.post("/api/servers", async (req, res) => {
    // Validate input, encrypt credential, save server.
  });

  expressApp.put("/api/servers/:id", async (req, res) => {
    // Update server. Only update credential when a new one is provided.
  });

  expressApp.delete("/api/servers/:id", async (req, res) => {
    // Delete saved server.
  });

  expressApp.get("/api/settings", async (req, res) => {
    // Return settings.
  });

  expressApp.put("/api/settings", async (req, res) => {
    // Update settings.
  });

  expressApp.all("*", (req, res) => {
    return handle(req, res, parse(req.url, true));
  });

  const httpServer = createServer(expressApp);

  const io = new Server(httpServer, {
    cors: {
      origin: "*"
    }
  });

  io.on("connection", (socket) => {
    handleSocket(socket, io);
  });

  initDB();

  httpServer.listen(port, () => {
    console.log(`Nomad listening on http://localhost:${port}`);
  });
});
```

---

## 5. Database: `lib/db.js`

Use `better-sqlite3-multiple-ciphers`.

The database file lives at:

```txt
/app/data/nomad.db
```

For local development, use:

```txt
./data/nomad.db
```

Encryption key behavior:

* Prefer `NOMAD_SECRET`.
* If `NOMAD_SECRET` is not set, generate a key on first run.
* Store the generated key in `.nomad-key` next to the database.
* Do not regenerate the key if `.nomad-key` exists.
* If the key is lost, stored credentials cannot be decrypted.

Schema:

```sql
CREATE TABLE IF NOT EXISTS servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER DEFAULT 22,
  username TEXT NOT NULL,
  auth_type TEXT NOT NULL,
  credential TEXT NOT NULL,
  last_connected INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

Default settings inserted on first run:

```txt
default_session_name = nomad
auto_attach_single = true
haptics_enabled = true
theme = system
terminal_font_size = 13
terminal_font_family = JetBrains Mono
terminal_cursor_style = block
terminal_cursor_blink = true
terminal_scrollback = 5000
terminal_theme = nomad
confirm_kill_session = true
confirm_kill_window = true
confirm_delete_server = true
confirm_detach = true
```

Credential encryption:

* Use Node.js `crypto.createCipheriv`.
* Algorithm: `aes-256-gcm`.
* Encrypt before storing.
* Decrypt only when creating an SSH connection.
* Never expose raw credentials through REST responses.
* Never log credentials.

REST server response shape:

```ts
type ServerResponse = {
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
```

The `credential` column must never be included in `GET /api/servers`.

---

## 6. SSH and tmux manager: `lib/ssh.js`

Each Socket.IO connection manages one SSH and tmux session.

### 6.1 Socket.IO event protocol

Client to server:

```txt
connect:server       { serverId }
list:sessions        {}
attach:session       { sessionName }
new:session          { sessionName }
kill:session         { sessionName }
new:window           {}
kill:window          { windowIndex }
prev:window          {}
next:window          {}
list:windows         {}
rename:window        { index, name }
scroll:mode          {}
scroll:exit          {}
scroll:up            {}
scroll:down          {}
scroll:search        { query }
terminal:input       { data }
terminal:resize      { cols, rows }
detach               {}
disconnect:server    {}
```

Server to client:

```txt
server:connecting    { host }
server:connected     {}
server:error         { message }
server:disconnected  {}
sessions:list        { sessions: [{ name, windows, activity, attached }] }
windows:list         { windows: [{ index, name, active, panes }] }
session:attached     { sessionName }
terminal:output      { data }
terminal:resized     { cols, rows }
error                { message }
reconnecting         {}
```

### 6.2 SSH connection flow

```txt
1. Client emits connect:server { serverId }.
2. Server looks up server in DB.
3. Server decrypts credential.
4. Server creates ssh2 Client.
5. Server connects using host, port, username, and auth.
6. Server emits server:connected.
7. Server runs tmux list-sessions.
8. Server emits sessions:list or auto-attaches based on settings.
9. Client emits attach:session or new:session.
10. Server opens a PTY shell with conn.shell().
11. Server writes tmux attach or create command into the shell.
12. Server streams PTY output to client as base64.
13. Client decodes output and writes it to xterm.js.
```

SSH options:

```js
{
  host,
  port,
  username,
  password,
  privateKey,
  keepaliveInterval: 10000,
  readyTimeout: 15000,
  term: "xterm-256color"
}
```

Use either `password` or `privateKey`, never both.

### 6.3 PTY shell behavior

Use `conn.shell()`, not `conn.exec()`, for the terminal session.

```js
conn.shell(
  {
    term: "xterm-256color",
    cols,
    rows
  },
  (err, stream) => {
    if (err) {
      socket.emit("server:error", { message: err.message });
      return;
    }

    stream.on("data", (chunk) => {
      socket.emit("terminal:output", {
        data: chunk.toString("base64")
      });
    });

    socket.on("terminal:input", ({ data }) => {
      stream.write(data);
    });

    socket.on("terminal:resize", ({ cols, rows }) => {
      stream.setWindow(rows, cols, 0, 0);
    });
  }
);
```

### 6.4 tmux commands

List sessions:

```bash
tmux list-sessions -F "#{session_name}|#{session_windows}|#{session_activity}|#{session_attached}"
```

List windows:

```bash
tmux list-windows -t <session> -F "#{window_index}|#{window_name}|#{window_active}|#{window_panes}"
```

Attach to existing session or create if missing:

```bash
exec tmux new-session -A -s <sessionName>
```

Create new session:

```bash
tmux new-session -s <sessionName>
```

Kill session:

```bash
tmux kill-session -t <sessionName>
```

New window:

```bash
tmux new-window
```

Kill window:

```bash
tmux kill-window -t <index>
```

Previous window:

```bash
tmux previous-window
```

Next window:

```bash
tmux next-window
```

Rename window:

```bash
tmux rename-window -t <index> <name>
```

Enter copy mode:

```bash
tmux copy-mode
```

Page up in copy mode:

```bash
tmux send-keys -X page-up
```

Page down in copy mode:

```bash
tmux send-keys -X page-down
```

Search in copy mode:

```bash
tmux send-keys -X search-forward "<query>"
```

Exit copy mode:

```bash
tmux send-keys -X cancel
```

### 6.5 Session selection logic

```txt
1. Run tmux list-sessions.
2. If no sessions exist:
   - Create session named settings.default_session_name.
   - Attach to it.
3. If exactly one session exists:
   - Check settings.auto_attach_single.
   - If true, auto-attach and skip picker.
   - If false, show picker with one item.
4. If multiple sessions exist:
   - Emit sessions:list.
   - Sort by activity, most recent first.
   - Client shows SessionSheet picker.
   - Highlight most recently active session.
```

### 6.6 Reconnection logic

When SSH disconnects unexpectedly:

```txt
1. Emit reconnecting to client.
2. Client shows a non-blocking reconnect banner over the terminal.
3. Server attempts reconnect every 3 seconds, up to 5 attempts.
4. On success:
   - Re-attach to same session.
   - Emit server:connected.
   - Resume window polling.
5. On failure after 5 attempts:
   - Emit server:disconnected.
   - Client navigates back to server list.
   - Show error toast.
```

---

## 7. Design system

Nomad uses:

* shadcn/ui as the UI component base.
* tweakcn-generated CSS variables.
* Tailwind CSS v4.
* Poppins for main interface typography.
* Playfair Display for optional editorial accents.
* JetBrains Mono for terminals and technical labels.
* Phosphor Icons for all iconography.
* Framer Motion for all motion.
* Sonner for toast notifications.

Design priorities:

* shadcn-based, not custom-from-scratch primitives.
* tweakcn-compatible tokens.
* Phosphor Icons only.
* Filled Phosphor icons by default.
* Rounded, tactile, friendly surfaces.
* Orange primary action color.
* Warm neutral backgrounds.
* Mobile-first layout.
* Terminal remains dark regardless of app theme.

---

## 7.1 Theme: `app/globals.css`

Use this exact tweakcn-generated theme.

```css
@import "tailwindcss";

@custom-variant dark (&:is(.dark *));

:root {
  --background: oklch(1.0000 0 0);
  --foreground: oklch(0.2101 0.0318 264.6645);
  --card: oklch(1.0000 0 0);
  --card-foreground: oklch(0.2101 0.0318 264.6645);
  --popover: oklch(1.0000 0 0);
  --popover-foreground: oklch(0.2101 0.0318 264.6645);
  --primary: oklch(0.6716 0.1368 48.5130);
  --primary-foreground: oklch(1.0000 0 0);
  --secondary: oklch(0.5360 0.0398 196.0280);
  --secondary-foreground: oklch(1.0000 0 0);
  --muted: oklch(0.9670 0.0029 264.5419);
  --muted-foreground: oklch(0.5510 0.0234 264.3637);
  --accent: oklch(0.9491 0 0);
  --accent-foreground: oklch(0.2101 0.0318 264.6645);
  --destructive: oklch(0.6368 0.2078 25.3313);
  --destructive-foreground: oklch(0.9851 0 0);
  --border: oklch(0.9276 0.0058 264.5313);
  --input: oklch(0.9276 0.0058 264.5313);
  --ring: oklch(0.6716 0.1368 48.5130);
  --chart-1: oklch(0.5940 0.0443 196.0233);
  --chart-2: oklch(0.7214 0.1337 49.9802);
  --chart-3: oklch(0.8721 0.0864 68.5474);
  --chart-4: oklch(0.6268 0 0);
  --chart-5: oklch(0.6830 0 0);
  --sidebar: oklch(0.9670 0.0029 264.5419);
  --sidebar-foreground: oklch(0.2101 0.0318 264.6645);
  --sidebar-primary: oklch(0.6716 0.1368 48.5130);
  --sidebar-primary-foreground: oklch(1.0000 0 0);
  --sidebar-accent: oklch(1.0000 0 0);
  --sidebar-accent-foreground: oklch(0.2101 0.0318 264.6645);
  --sidebar-border: oklch(0.9276 0.0058 264.5313);
  --sidebar-ring: oklch(0.6716 0.1368 48.5130);
  --font-sans: Poppins, ui-sans-serif, sans-serif, system-ui;
  --font-serif: Playfair Display, ui-serif, serif;
  --font-mono: JetBrains Mono, monospace;
  --radius: 2rem;
  --shadow-x: 0px;
  --shadow-y: 14px;
  --shadow-blur: 23.5px;
  --shadow-spread: -6px;
  --shadow-opacity: 0.18;
  --shadow-color: #000000;
  --shadow-2xs: 0px 14px 23.5px -6px hsl(0 0% 0% / 0.09);
  --shadow-xs: 0px 14px 23.5px -6px hsl(0 0% 0% / 0.09);
  --shadow-sm: 0px 14px 23.5px -6px hsl(0 0% 0% / 0.18), 0px 1px 2px -7px hsl(0 0% 0% / 0.18);
  --shadow: 0px 14px 23.5px -6px hsl(0 0% 0% / 0.18), 0px 1px 2px -7px hsl(0 0% 0% / 0.18);
  --shadow-md: 0px 14px 23.5px -6px hsl(0 0% 0% / 0.18), 0px 2px 4px -7px hsl(0 0% 0% / 0.18);
  --shadow-lg: 0px 14px 23.5px -6px hsl(0 0% 0% / 0.18), 0px 4px 6px -7px hsl(0 0% 0% / 0.18);
  --shadow-xl: 0px 14px 23.5px -6px hsl(0 0% 0% / 0.18), 0px 8px 10px -7px hsl(0 0% 0% / 0.18);
  --shadow-2xl: 0px 14px 23.5px -6px hsl(0 0% 0% / 0.45);
  --tracking-normal: -0.025em;
  --spacing: 0.25rem;
}

.dark {
  --background: oklch(0.1797 0.0043 308.1928);
  --foreground: oklch(0.8109 0 0);
  --card: oklch(0.1822 0 0);
  --card-foreground: oklch(0.8109 0 0);
  --popover: oklch(0.1797 0.0043 308.1928);
  --popover-foreground: oklch(0.8109 0 0);
  --primary: oklch(0.7214 0.1337 49.9802);
  --primary-foreground: oklch(0.1797 0.0043 308.1928);
  --secondary: oklch(0.5940 0.0443 196.0233);
  --secondary-foreground: oklch(0.1797 0.0043 308.1928);
  --muted: oklch(0.2520 0 0);
  --muted-foreground: oklch(0.6268 0 0);
  --accent: oklch(0.3211 0 0);
  --accent-foreground: oklch(0.8109 0 0);
  --destructive: oklch(0.5940 0.0443 196.0233);
  --destructive-foreground: oklch(0.1797 0.0043 308.1928);
  --border: oklch(0.2520 0 0);
  --input: oklch(0.2520 0 0);
  --ring: oklch(0.7214 0.1337 49.9802);
  --chart-1: oklch(0.5940 0.0443 196.0233);
  --chart-2: oklch(0.7214 0.1337 49.9802);
  --chart-3: oklch(0.8721 0.0864 68.5474);
  --chart-4: oklch(0.6268 0 0);
  --chart-5: oklch(0.6830 0 0);
  --sidebar: oklch(0.1822 0 0);
  --sidebar-foreground: oklch(0.8109 0 0);
  --sidebar-primary: oklch(0.7214 0.1337 49.9802);
  --sidebar-primary-foreground: oklch(0.1797 0.0043 308.1928);
  --sidebar-accent: oklch(0.3211 0 0);
  --sidebar-accent-foreground: oklch(0.8109 0 0);
  --sidebar-border: oklch(0.2520 0 0);
  --sidebar-ring: oklch(0.7214 0.1337 49.9802);
  --font-sans: Poppins, ui-sans-serif, sans-serif, system-ui;
  --font-serif: Playfair Display, ui-serif, serif;
  --font-mono: JetBrains Mono, monospace;
  --radius: 2rem;
  --shadow-x: 0px;
  --shadow-y: 14px;
  --shadow-blur: 23.5px;
  --shadow-spread: -6px;
  --shadow-opacity: 0.18;
  --shadow-color: #000000;
  --shadow-2xs: 0px 14px 23.5px -6px hsl(0 0% 0% / 0.09);
  --shadow-xs: 0px 14px 23.5px -6px hsl(0 0% 0% / 0.09);
  --shadow-sm: 0px 14px 23.5px -6px hsl(0 0% 0% / 0.18), 0px 1px 2px -7px hsl(0 0% 0% / 0.18);
  --shadow: 0px 14px 23.5px -6px hsl(0 0% 0% / 0.18), 0px 1px 2px -7px hsl(0 0% 0% / 0.18);
  --shadow-md: 0px 14px 23.5px -6px hsl(0 0% 0% / 0.18), 0px 2px 4px -7px hsl(0 0% 0% / 0.18);
  --shadow-lg: 0px 14px 23.5px -6px hsl(0 0% 0% / 0.18), 0px 4px 6px -7px hsl(0 0% 0% / 0.18);
  --shadow-xl: 0px 14px 23.5px -6px hsl(0 0% 0% / 0.18), 0px 8px 10px -7px hsl(0 0% 0% / 0.18);
  --shadow-2xl: 0px 14px 23.5px -6px hsl(0 0% 0% / 0.45);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);

  --font-sans: var(--font-sans);
  --font-mono: var(--font-mono);
  --font-serif: var(--font-serif);

  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);

  --shadow-2xs: var(--shadow-2xs);
  --shadow-xs: var(--shadow-xs);
  --shadow-sm: var(--shadow-sm);
  --shadow: var(--shadow);
  --shadow-md: var(--shadow-md);
  --shadow-lg: var(--shadow-lg);
  --shadow-xl: var(--shadow-xl);
  --shadow-2xl: var(--shadow-2xl);

  --tracking-tighter: calc(var(--tracking-normal) - 0.05em);
  --tracking-tight: calc(var(--tracking-normal) - 0.025em);
  --tracking-normal: var(--tracking-normal);
  --tracking-wide: calc(var(--tracking-normal) + 0.025em);
  --tracking-wider: calc(var(--tracking-normal) + 0.05em);
  --tracking-widest: calc(var(--tracking-normal) + 0.1em);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }

  html {
    height: 100%;
  }

  body {
    @apply bg-background text-foreground;
    min-height: 100%;
    letter-spacing: var(--tracking-normal);
  }
}

@layer utilities {
  .pb-safe {
    padding-bottom: env(safe-area-inset-bottom);
  }

  .pt-safe {
    padding-top: env(safe-area-inset-top);
  }

  .pl-safe {
    padding-left: env(safe-area-inset-left);
  }

  .pr-safe {
    padding-right: env(safe-area-inset-right);
  }

  .shadow-orange {
    box-shadow: 0 4px 16px rgba(255, 95, 0, 0.3);
  }

  .shadow-bar {
    box-shadow:
      0 4px 20px rgba(0, 0, 0, 0.12),
      0 1px 4px rgba(0, 0, 0, 0.06);
  }

  .shadow-sheet {
    box-shadow: 0 -2px 24px rgba(0, 0, 0, 0.1);
  }

  .topo-bg {
    background-image: url("/topo-pattern.svg");
    background-size: 600px 600px;
    background-repeat: repeat;
  }
}
```

Key theme notes:

* `--primary` is the orange action color.
* Use `bg-primary text-primary-foreground` for orange buttons.
* `--radius: 2rem` means shadcn components become very rounded by default.
* This pill-like radius is intentional.
* `--muted` is the default field and secondary surface background.
* The terminal always uses hardcoded dark colors regardless of app theme.

---

## 7.2 Fonts: `app/layout.tsx`

Use Google fonts through `next/font/google`.

```tsx
import type { Metadata } from "next";
import { Poppins, Playfair_Display, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "@/contexts/ThemeProvider";
import { Toaster } from "sonner";
import "./globals.css";

const fontSans = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans"
});

const fontSerif = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-serif"
});

const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono"
});

export const metadata: Metadata = {
  title: "Nomad",
  description: "Mobile-first tmux manager"
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#FF5F00"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${fontSans.variable} ${fontSerif.variable} ${fontMono.variable} antialiased`}
      >
        <ThemeProvider>
          {children}
          <Toaster richColors position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
```

Typography scale:

| Role     | Class                     | Usage                        |
| -------- | ------------------------- | ---------------------------- |
| Display  | `text-3xl font-bold`      | Page titles                  |
| Title    | `text-xl font-semibold`   | Section titles, server names |
| Subtitle | `text-base font-medium`   | Session names, card labels   |
| Body     | `text-sm font-normal`     | Default content              |
| Caption  | `text-xs font-normal`     | Timestamps, hostnames        |
| Micro    | `text-[10px] font-medium` | Action bar labels, badges    |

Poppins plus `--tracking-normal: -0.025em` should make the UI feel crisp and slightly condensed.

---

## 7.3 Icons: Phosphor Icons

Use `@phosphor-icons/react` exclusively.

Do not use lucide-react.

Use filled icons by default:

```tsx
import {
  Compass,
  HardDrive,
  Terminal,
  Gear,
  Plus,
  X,
  ArrowLeft,
  ArrowRight,
  TextAlignLeft,
  SignOut,
  MagnifyingGlass,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeSlash,
  Key,
  Lock,
  Globe,
  User,
  CaretRight,
  CheckCircle,
  XCircle,
  Warning,
  WifiHigh,
  WifiSlash,
  StackSimple,
  ArrowClockwise,
  Laptop,
  Moon,
  Sun
} from "@phosphor-icons/react";

<HardDrive weight="fill" size={20} />;
```

Default rule:

```tsx
<Icon weight="fill" size={20} />
```

Exceptions:

* Use `weight="bold"` for high-impact destructive or navigation icons where fill looks muddy.
* Use `weight="regular"` only if the filled icon becomes visually unclear at small sizes.

Icon usage map:

| Location              | Icon                | Weight |
| --------------------- | ------------------- | ------ |
| App wordmark          | `Compass`           | `fill` |
| Settings button       | `Gear`              | `fill` |
| Add server FAB        | `Plus`              | `fill` |
| Server card chevron   | `CaretRight`        | `fill` |
| Session windows badge | `StackSimple`       | `fill` |
| New session           | `Plus`              | `fill` |
| Back button           | `ArrowLeft`         | `bold` |
| Session picker        | `StackSimple`       | `fill` |
| Disconnect            | `SignOut`           | `fill` |
| Action bar New        | `Plus`              | `fill` |
| Action bar Kill       | `X`                 | `bold` |
| Action bar Prev       | `ArrowLeft`         | `fill` |
| Action bar Next       | `ArrowRight`        | `fill` |
| Action bar Scroll     | `TextAlignLeft`     | `fill` |
| Action bar Detach     | `SignOut`           | `fill` |
| Action bar Up         | `ArrowUp`           | `fill` |
| Action bar Down       | `ArrowDown`         | `fill` |
| Action bar Find       | `MagnifyingGlass`   | `fill` |
| Action bar Exit       | `X`                 | `bold` |
| Password field toggle | `Eye` or `EyeSlash` | `fill` |
| Auth Password         | `Lock`              | `fill` |
| Auth SSH Key          | `Key`               | `fill` |
| Hostname field        | `Globe`             | `fill` |
| Username field        | `User`              | `fill` |
| Theme Light           | `Sun`               | `fill` |
| Theme Dark            | `Moon`              | `fill` |
| Theme System          | `Laptop`            | `fill` |
| Reconnecting          | `ArrowClockwise`    | `fill` |
| Error toast           | `XCircle`           | `fill` |
| Success toast         | `CheckCircle`       | `fill` |
| Warning toast         | `Warning`           | `fill` |

Server online and offline indicators are CSS circles, not icons.

---

## 7.4 shadcn component customizations

The theme radius intentionally makes shadcn components soft and pill-like. Lean into it.

### Button

Use shadcn `Button`.

Rules:

* `variant="default"` is orange primary.
* `variant="outline"` is transparent with border.
* `variant="ghost"` is for nav actions.
* `variant="destructive"` is for delete, kill, and destructive confirmations.
* Use `size="lg"` for primary CTAs.
* Use `size="default"` for normal actions.
* Use `rounded-full` for important mobile CTAs.

Primary CTA class:

```tsx
<Button className="h-13 w-full rounded-full shadow-orange">
  Save Server
</Button>
```

### Input

Use shadcn `Input`.

Rules:

* Use `bg-muted`.
* Use `border-input`.
* Use orange focus ring through `ring`.
* Labels sit above fields.

Default field class:

```tsx
<Input className="h-12 rounded-xl bg-muted px-4" />
```

### Textarea

Use shadcn `Textarea` for SSH keys.

```tsx
<Textarea className="min-h-40 rounded-xl bg-muted px-4 py-3 font-mono text-xs" />
```

### Switch

Use shadcn `Switch`.

Rules:

* Active state should use `bg-primary`.
* Use in settings rows only.

### Select

Use shadcn `Select`.

Rules:

* Use for terminal font, cursor style, and terminal theme.
* Keep trigger width reasonable on mobile.
* Use full-width select only in stacked forms.

### Sheet

Use shadcn `Sheet`.

Rules:

* `side="bottom"` on mobile.
* `side="right"` for desktop settings panel.
* Overlay should be `bg-black/35`.
* Add a drag handle for mobile sheets.
* For drag-to-dismiss, wrap the sheet content with a Framer Motion layer if needed.

### Dialog

Use shadcn `Dialog`.

Rules:

* Desktop modal equivalent of mobile sheets.
* Used for edit server, new session, and confirmations on desktop.

### Card

Use shadcn `Card`.

Rules:

* Use as base for server cards.
* Override padding and radius as needed.
* Use `shadow-sm`, `shadow-md`, or theme shadows.

### Sonner

Use `sonner` for toasts.

Do not build a custom toast system unless Sonner cannot support a required feature.

---

## 7.5 Terminal colors

The terminal is theme-independent and always dark.

```ts
export const nomadTerminalTheme = {
  background: "#1A1714",
  foreground: "#E8E3DD",
  cursor: "#FF5F00",
  cursorAccent: "#1A1714",
  selection: "rgba(255,95,0,0.25)",
  black: "#1A1714",
  red: "#D9534F",
  green: "#5DB35D",
  yellow: "#D4A017",
  blue: "#5B9BD5",
  magenta: "#C586C0",
  cyan: "#4EC9B0",
  white: "#E8E3DD",
  brightBlack: "#4A4540",
  brightRed: "#E06C75",
  brightGreen: "#7ED321",
  brightYellow: "#E5C07B",
  brightBlue: "#61AFEF",
  brightMagenta: "#C678DD",
  brightCyan: "#56B6C2",
  brightWhite: "#FFFFFF"
};
```

---

## 7.6 Spacing

All spacing uses multiples of 4px.

| Token     | Value | Usage                         |
| --------- | ----: | ----------------------------- |
| `p-5`     |  20px | Screen edge padding           |
| `gap-3`   |  12px | Between list items            |
| `gap-4`   |  16px | Standard component gap        |
| `gap-6`   |  24px | Section gap                   |
| `py-3.5`  |  14px | Settings row vertical padding |
| `h-12`    |  48px | Inputs                        |
| `h-13`    |  52px | Primary mobile CTA            |
| `size-14` |  56px | FAB                           |

---

## 7.7 Border radius

The global theme radius is `2rem`, but use explicit utility classes where component shape matters.

```txt
Cards:          rounded-2xl
Bottom sheets:  rounded-t-3xl
Buttons pill:   rounded-full
Inputs:         rounded-xl
Terminal:       rounded-2xl
Action bar:     rounded-full
Badges:         rounded-md
```

---

## 7.8 Shadows

Prefer the theme shadows. Add these utility classes when needed:

```css
.shadow-orange {
  box-shadow: 0 4px 16px rgba(255, 95, 0, 0.3);
}

.shadow-bar {
  box-shadow:
    0 4px 20px rgba(0, 0, 0, 0.12),
    0 1px 4px rgba(0, 0, 0, 0.06);
}

.shadow-sheet {
  box-shadow: 0 -2px 24px rgba(0, 0, 0, 0.1);
}
```

Use:

* `shadow-sm` for resting cards.
* `shadow-md` for active or lifted cards.
* `shadow-orange` for the FAB and primary hero CTA.
* `shadow-bar` for floating terminal action bar.
* `shadow-sheet` for bottom sheets.

---

## 7.9 Topographic pattern

Create:

```txt
public/topo-pattern.svg
```

SVG requirements:

* Organic curved topographic contour lines.
* Not perfect concentric circles.
* Multiple uneven line paths.
* Uses `currentColor`.
* `viewBox="0 0 800 800"`.
* Tile-friendly.
* No embedded raster image.

Apply only on:

* Home screen `/`
* Settings screen `/settings`

Usage pattern:

```tsx
<div className="pointer-events-none absolute inset-0 topo-bg text-primary opacity-[0.035] dark:opacity-[0.045]" />
```

Desktop can increase opacity:

```tsx
<div className="pointer-events-none absolute inset-0 topo-bg text-primary opacity-[0.035] dark:opacity-[0.045] md:opacity-[0.06]" />
```

---

## 8. Animation system

Use Framer Motion throughout.

Do not use CSS transitions for interactive component state changes unless the transition is trivial and non-interactive.

### 8.1 Spring configs

Create:

```txt
lib/animations.ts
```

```ts
export const springs = {
  quick: {
    type: "spring",
    stiffness: 400,
    damping: 28,
    mass: 0.8
  },

  sheet: {
    type: "spring",
    stiffness: 320,
    damping: 32,
    mass: 1
  },

  bar: {
    type: "spring",
    stiffness: 350,
    damping: 26,
    mass: 0.9
  },

  page: {
    type: "spring",
    stiffness: 280,
    damping: 30,
    mass: 1
  },

  micro: {
    type: "spring",
    stiffness: 500,
    damping: 35,
    mass: 0.6
  },

  bouncy: {
    type: "spring",
    stiffness: 300,
    damping: 18,
    mass: 0.8
  }
};
```

### 8.2 Standard variants

```ts
import { springs } from "./animations";

export const variants = {
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.15 }
  },

  slideUp: {
    initial: { y: 24, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    exit: { y: 24, opacity: 0 },
    transition: springs.sheet
  },

  scaleIn: {
    initial: { scale: 0.94, opacity: 0 },
    animate: { scale: 1, opacity: 1 },
    exit: { scale: 0.94, opacity: 0 },
    transition: springs.quick
  },

  listItem: {
    initial: { y: 12, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    transition: springs.quick
  }
};
```

### 8.3 Specific animation specs

Server card tap:

```tsx
<motion.div whileTap={{ scale: 0.97 }} transition={springs.quick} />
```

FAB tap:

```tsx
<motion.button whileTap={{ scale: 0.92 }} transition={springs.quick} />
```

Bottom sheet open:

```txt
Sheet moves from y: 100% to y: 0.
Backdrop fades from opacity 0 to 0.4.
Use springs.sheet.
```

Bottom sheet close:

```txt
Sheet moves to y: 100%.
Backdrop fades to opacity 0.
Close should feel slightly faster than open.
```

Action bar mode change:

```txt
Default mode and scroll mode cross-fade.
Icons and labels animate opacity and slight y offset.
Bar width animates if button count changes.
Use AnimatePresence with mode="popLayout".
Use springs.bar.
```

Window tab indicator:

```txt
Orange underline pill slides horizontally between tabs.
Use layoutId="window-indicator".
```

Session list stagger:

```txt
Each row animates in with 50ms stagger delay.
Use parent staggerChildren: 0.05.
```

Connecting animation:

```txt
Use 3 concentric SVG circles.
Each circle expands from scale 0 to 1.5 and fades out.
Stagger delays: 0s, 0.5s, 1s.
Loop infinitely.
Ring color uses primary.
```

Sonner toast behavior:

```txt
Use Sonner for toast mount and stacking.
Use success, error, warning, and info variants.
Customize styling with theme tokens where practical.
```

---

## 9. Haptics

Use `web-haptics` as the primary interface. Fall back to `navigator.vibrate()`.

Create:

```txt
hooks/useHaptics.ts
```

```ts
"use client";

import { useWebHaptics } from "web-haptics/react";
import { useSettings } from "@/hooks/useSettings";

export const hapticPatterns = {
  tap: 8,
  confirm: 12,
  success: [10, 50, 20],
  error: [30, 50, 30],
  warning: [20, 30, 20],
  kill: [15, 40, 15, 40, 15],
  detach: [10, 30, 10]
};

export function useHaptics() {
  const { trigger } = useWebHaptics();
  const { settings } = useSettings();

  const enabled = settings?.haptics_enabled === "true";

  const fallback = (pattern: VibratePattern) => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  };

  const run = (pattern: VibratePattern) => {
    if (!enabled) return;

    try {
      trigger(pattern);
    } catch {
      fallback(pattern);
    }
  };

  return {
    tap: () => run(hapticPatterns.tap),
    confirm: () => run(hapticPatterns.confirm),
    success: () => run(hapticPatterns.success),
    error: () => run(hapticPatterns.error),
    warning: () => run(hapticPatterns.warning),
    kill: () => run(hapticPatterns.kill),
    detach: () => run(hapticPatterns.detach)
  };
}
```

When to trigger:

| Event                          | Haptic    |
| ------------------------------ | --------- |
| Server card press              | `tap`     |
| Session row press              | `tap`     |
| Action bar button press        | `tap`     |
| Save server                    | `confirm` |
| New session created            | `confirm` |
| SSH connected                  | `success` |
| Session attached               | `success` |
| SSH failed                     | `error`   |
| Command error                  | `error`   |
| Destructive confirmation opens | `warning` |
| Session killed                 | `kill`    |
| Window killed                  | `kill`    |
| Detached from session          | `detach`  |

Gracefully no-op when haptics are unavailable.

---

## 10. Screens and components

---

## 10.1 Home screen: server list `/`

Layout:

```txt
Safe area top
NavBar
  Left: Nomad wordmark with Compass icon
  Right: Settings Gear icon

Main content
  Topographic background overlay
  Page padding px-5 pt-4
  Title: Servers
  Animated server list
  Empty state if no servers

Floating Add Server button
  Fixed bottom-right
  Above safe area
```

Title:

```tsx
<h1 className="mb-6 text-3xl font-bold text-foreground">
  Servers
</h1>
```

### ServerCard component

Use shadcn `Card` as the base.

Visual:

```txt
Background: card
Border: border
Radius: rounded-2xl
Shadow: shadow-sm
Hover desktop: shadow-md
Tap mobile: scale 0.97
```

Layout:

```txt
Left:
  Status dot, 9px
  Orange glow if recently online
  Gray if offline

Middle:
  Server name
  Hostname below

Right:
  Last connected timestamp
  CaretRight icon below or inline
```

Online status:

* Online means recently connected, or active socket connected.
* Offline means no active socket.
* Use CSS circle, not icon.

Swipe left behavior:

* Reveals destructive delete action.
* iOS-style red delete region.
* Confirm before deleting unless skipped in settings.

### Empty state

Content:

```txt
Centered in remaining space.
Simple line-art topographic landscape.
Title: No servers yet
Body: Add your first server to start exploring.
Button: Add Server
```

Use Phosphor `Compass` or `HardDrive` icon in the empty state.

### FAB

Use shadcn `Button` or a custom motion button.

```tsx
<Button
  size="icon"
  className="fixed bottom-8 right-5 z-40 size-14 rounded-full bg-primary text-primary-foreground shadow-orange pb-safe"
>
  <Plus weight="fill" size={24} />
</Button>
```

---

## 10.2 Add Server sheet

Triggered by FAB.

Use shadcn `Sheet`.

Mobile:

* Bottom sheet.
* Rounded top corners.
* Drag handle.
* Full width.
* Can be nearly full height.

Desktop:

* Dialog or right-side sheet.

Fields:

1. Display Name, required.
2. Hostname or IP Address, required.
3. Port, number input, default `22`.
4. Username, required.
5. Authentication segmented control: `Password` or `SSH Key`.
6. Password field if auth type is password.
7. SSH private key textarea if auth type is key.
8. Optional SSH key passphrase field, not stored, used only during connection if needed.

Input style:

```txt
Background: bg-muted
Border: border-input
Radius: rounded-xl
Padding: px-4 py-3
Font: text-sm
Label: text-xs text-muted-foreground
Focus: orange ring through theme token
```

Auth segmented control:

```txt
Container: bg-muted rounded-xl p-1
Active segment: bg-primary text-primary-foreground rounded-lg
Inactive: text-muted-foreground
Indicator: Framer Motion layout animation
```

Save button:

```txt
Full-width orange pill
Height: 52px
Text: Save Server
Disabled: opacity 40%, no shadow
Loading: spinner replaces text
Success: haptic confirm, sheet closes, server list refreshes
```

Security:

* Do not echo stored credentials.
* Do not prefill credential value on edit.
* Do not send credentials back from API.

---

## 10.3 Edit Server sheet

Same component structure as Add Server.

Differences:

* Title: `Edit Server`.
* Fields prefilled except credential.
* Credential field placeholder: `••••••••`.
* If credential field is left blank, keep existing encrypted credential.
* If credential field has content, replace stored credential.
* Show destructive `Delete Server` button at bottom.

Delete behavior:

* Show ConfirmSheet unless `confirm_delete_server` is false.
* On confirm, delete server.
* Close sheet.
* Refresh server list.
* Show Sonner success toast.

---

## 10.4 Session picker sheet

Appears after SSH connects when manual session selection is needed.

Header:

```txt
Title: Sessions
Right action: Done
```

Session row layout:

```txt
Left:
  StackSimple icon
  Session name
  Activity caption

Right:
  Windows badge
  CaretRight icon
```

Session row states:

* Most recently active session gets subtle `bg-accent`.
* Attached session gets left orange border.
* Tapping a row attaches to that session.
* Long press opens rename or kill options.

Windows badge:

```txt
Small pill
bg-primary/10
text-primary
Micro text
Icon: StackSimple fill
```

Footer:

```txt
New Session row
Plus icon
Text: New Session
```

New session behavior:

* Tapping New Session shows inline input or nested sheet.
* Default value comes from `settings.default_session_name`.
* Creating a session attaches immediately.

---

## 10.5 Terminal view `/session/[serverId]`

Layout:

```txt
NavBar
  Left: back arrow and session name
  Right: session picker icon and disconnect icon

Window tab bar
  Horizontal scroll
  Active window indicator
  Plus button for new window

Terminal pane
  Dark rounded card
  xterm.js inside
  Fills available space

Floating action bar
  Bottom-center on mobile
  Above keyboard
  Morphs between normal mode and scroll mode
```

### NavBar

Mobile:

```txt
Solid background.
Safe area aware.
Back button on left.
Session name centered or left-aligned.
Actions on right.
```

Desktop:

```txt
Can be integrated into main layout.
Action bar becomes toolbar above terminal.
```

Icons:

* Back: `ArrowLeft weight="bold"`
* Sessions: `StackSimple weight="fill"`
* Disconnect: `SignOut weight="fill"`

### WindowTabs

Behavior:

* Poll `list:windows` every 2 seconds after attach.
* Active tab uses orange text and subtle orange background.
* Indicator uses `layoutId="window-indicator"`.
* Tabs are horizontally scrollable.
* Hide scrollbar.
* Plus tab creates a new tmux window.

Tab style:

```txt
Container: horizontal flex, gap-2, overflow-x-auto
Tab: rounded-full px-3 py-2 text-xs
Active: bg-primary/10 text-primary
Inactive: text-muted-foreground
```

### Terminal pane

Requirements:

* xterm.js is client-side only.
* Create terminal in `useEffect`.
* Dispose terminal on unmount.
* Load addons:

  * FitAddon
  * AttachAddon, available but not primary transport
  * WebLinksAddon
  * SearchAddon
* Use ResizeObserver.
* Debounce resize by 100ms.
* Emit `terminal:resize` after fit.
* Decode base64 terminal output before writing.

Terminal options:

```ts
{
  fontFamily: settings.terminal_font_family,
  fontSize: Number(settings.terminal_font_size),
  cursorStyle: settings.terminal_cursor_style,
  cursorBlink: settings.terminal_cursor_blink === "true",
  scrollback: Number(settings.terminal_scrollback),
  theme: getTerminalTheme(settings.terminal_theme),
  allowProposedApi: true,
  macOptionIsMeta: true
}
```

Terminal container:

```txt
Background: #1A1714
Radius: rounded-2xl
Padding: 14px
Overflow: hidden
Height: full available space
```

Scroll mode:

* Terminal pane gets orange ring.
* Action bar switches to scroll controls.
* Exiting scroll mode calls `terminal.scrollToBottom()`.

### ActionBar component

Mobile default mode buttons:

```ts
const defaultButtons = [
  { icon: Plus, label: "New", event: "new:window" },
  { icon: X, label: "Kill", event: "kill:window", destructive: true },
  { icon: ArrowLeft, label: "Prev", event: "prev:window" },
  { icon: ArrowRight, label: "Next", event: "next:window" },
  { icon: TextAlignLeft, label: "Scroll", event: "scroll:mode" },
  { icon: SignOut, label: "Detach", event: "detach" }
];
```

Scroll mode buttons:

```ts
const scrollButtons = [
  { icon: ArrowUp, label: "Up", event: "scroll:up" },
  { icon: ArrowDown, label: "Down", event: "scroll:down" },
  { icon: MagnifyingGlass, label: "Find", event: "scroll:search" },
  { icon: X, label: "Exit", event: "scroll:exit", accent: true }
];
```

Action button style:

```txt
Width: 48px
Layout: flex column
Icon: 20px
Label: 10px
Default color: muted foreground
Active color: primary
Destructive color: destructive
Tap scale: 0.88
Haptic: tap
```

Action bar style:

```txt
Position: fixed bottom-center
Height: 56px
Background: card
Border: border
Radius: rounded-full
Shadow: shadow-bar
Padding: px-2
Safe area aware
```

Desktop behavior:

* Action bar becomes compact toolbar above terminal.
* No floating bottom bar.
* Labels can be hidden if there is enough icon affordance.

### Scroll mode search

Pressing Find:

* Shows small search bar above action bar.
* Uses SearchAddon.
* Enter finds next.
* Shift Enter finds previous.
* X closes search.
* Escape closes search.

Search commands:

```ts
searchAddon.findNext(query);
searchAddon.findPrevious(query);
```

### Reconnect banner

When SSH drops:

```txt
Slim banner below nav.
Orange background.
White text: Reconnecting...
Icon: ArrowClockwise fill, spinning.
Non-blocking.
```

On success:

* Banner slides away.
* Haptic success.

On failure:

* Toast error.
* Navigate home.

---

## 10.6 Settings screen `/settings`

Use grouped iOS-style sections.

Background:

* App background.
* Topographic overlay.
* Mobile padding `px-5`.
* Desktop constrained max width.

Sections:

### General

Rows:

* Default Session Name, text input, default `nomad`
* Auto-attach if single session, switch
* Haptic Feedback, switch
* Theme, segmented control: Light, Dark, System

Theme icons:

* Light: `Sun weight="fill"`
* Dark: `Moon weight="fill"`
* System: `Laptop weight="fill"`

### Terminal

Rows:

* Font Size, stepper from 10 to 20, default 13
* Font Family, picker:

  * JetBrains Mono
  * SF Mono
  * Fira Code
  * Cascadia Code
  * Monospace
* Cursor Style, segmented:

  * Block
  * Underline
  * Bar
* Cursor Blink, switch
* Scrollback Lines, number input from 1000 to 50000
* Terminal Theme, picker:

  * Nomad
  * Dark
  * Solarized Dark
  * Dracula
  * Nord

### Confirmations

Rows:

* Confirm before killing session
* Confirm before killing window
* Confirm before deleting server
* Confirm before detaching

### About

Rows:

* Version badge
* GitHub link
* Reset All Settings, destructive button

Section header style:

```txt
text-[10px]
text-muted-foreground
uppercase
tracking-widest
mx-5
mb-2
mt-6
```

Row style:

```txt
Background: card
Border: border
Padding: px-5 py-3.5
Label: text-sm text-foreground
Control: right side
Grouped corners on first and last rows
```

---

## 10.7 Confirmation sheet

Used for destructive actions.

Actions requiring confirmation:

* Kill session.
* Kill window.
* Delete server.
* Detach from session.

Sheet content:

```txt
Title
Message
Checkbox: Don't show this again for this action
Buttons:
  Destructive confirm button
  Cancel button
```

Rules:

* Haptic warning on open.
* Haptic kill on destructive confirm for kill actions.
* Haptic detach on detach.
* Store skipped confirmations in settings.
* If skipped, execute directly next time.

Settings keys:

```txt
confirm_kill_session
confirm_kill_window
confirm_delete_server
confirm_detach
```

When checkbox is checked and user confirms:

```txt
Set corresponding setting to false.
```

---

## 10.8 Sonner toast notifications

Use Sonner.

Mount in `app/layout.tsx`:

```tsx
<Toaster richColors position="top-center" />
```

Use helper functions:

```ts
import { toast } from "sonner";

toast.success("Server saved");
toast.error("SSH connection failed");
toast.warning("Window killed");
toast.info("Reconnecting...");
```

Toast rules:

* Success for save, connect, attach.
* Error for SSH failure, command failure, validation failure.
* Warning for destructive success or risky state.
* Info for reconnecting and neutral events.

Do not create a custom Toast component unless Sonner cannot support a required interaction.

---

## 11. Terminal themes

Create:

```txt
lib/terminalThemes.ts
```

```ts
export const terminalThemes = {
  nomad: {
    background: "#1A1714",
    foreground: "#E8E3DD",
    cursor: "#FF5F00",
    cursorAccent: "#1A1714",
    selection: "rgba(255,95,0,0.3)",
    black: "#1A1714",
    red: "#D9534F",
    green: "#5DB35D",
    yellow: "#D4A017",
    blue: "#5B9BD5",
    magenta: "#C586C0",
    cyan: "#4EC9B0",
    white: "#E8E3DD",
    brightBlack: "#4A4540",
    brightRed: "#E06C75",
    brightGreen: "#7ED321",
    brightYellow: "#E5C07B",
    brightBlue: "#61AFEF",
    brightMagenta: "#C678DD",
    brightCyan: "#56B6C2",
    brightWhite: "#FFFFFF"
  },

  dark: {
    background: "#111111",
    foreground: "#F2F2F2",
    cursor: "#FFFFFF",
    cursorAccent: "#111111",
    selection: "rgba(255,255,255,0.22)",
    black: "#111111",
    red: "#FF5C57",
    green: "#5AF78E",
    yellow: "#F3F99D",
    blue: "#57C7FF",
    magenta: "#FF6AC1",
    cyan: "#9AEDFE",
    white: "#F1F1F0",
    brightBlack: "#686868",
    brightRed: "#FF5C57",
    brightGreen: "#5AF78E",
    brightYellow: "#F3F99D",
    brightBlue: "#57C7FF",
    brightMagenta: "#FF6AC1",
    brightCyan: "#9AEDFE",
    brightWhite: "#FFFFFF"
  },

  "solarized-dark": {
    background: "#002B36",
    foreground: "#839496",
    cursor: "#93A1A1",
    cursorAccent: "#002B36",
    selection: "rgba(147,161,161,0.25)",
    black: "#073642",
    red: "#DC322F",
    green: "#859900",
    yellow: "#B58900",
    blue: "#268BD2",
    magenta: "#D33682",
    cyan: "#2AA198",
    white: "#EEE8D5",
    brightBlack: "#002B36",
    brightRed: "#CB4B16",
    brightGreen: "#586E75",
    brightYellow: "#657B83",
    brightBlue: "#839496",
    brightMagenta: "#6C71C4",
    brightCyan: "#93A1A1",
    brightWhite: "#FDF6E3"
  },

  dracula: {
    background: "#282A36",
    foreground: "#F8F8F2",
    cursor: "#F8F8F2",
    cursorAccent: "#282A36",
    selection: "rgba(68,71,90,0.9)",
    black: "#21222C",
    red: "#FF5555",
    green: "#50FA7B",
    yellow: "#F1FA8C",
    blue: "#BD93F9",
    magenta: "#FF79C6",
    cyan: "#8BE9FD",
    white: "#F8F8F2",
    brightBlack: "#6272A4",
    brightRed: "#FF6E6E",
    brightGreen: "#69FF94",
    brightYellow: "#FFFFA5",
    brightBlue: "#D6ACFF",
    brightMagenta: "#FF92DF",
    brightCyan: "#A4FFFF",
    brightWhite: "#FFFFFF"
  },

  nord: {
    background: "#2E3440",
    foreground: "#D8DEE9",
    cursor: "#D8DEE9",
    cursorAccent: "#2E3440",
    selection: "rgba(76,86,106,0.9)",
    black: "#3B4252",
    red: "#BF616A",
    green: "#A3BE8C",
    yellow: "#EBCB8B",
    blue: "#81A1C1",
    magenta: "#B48EAD",
    cyan: "#88C0D0",
    white: "#E5E9F0",
    brightBlack: "#4C566A",
    brightRed: "#BF616A",
    brightGreen: "#A3BE8C",
    brightYellow: "#EBCB8B",
    brightBlue: "#81A1C1",
    brightMagenta: "#B48EAD",
    brightCyan: "#8FBCBB",
    brightWhite: "#ECEFF4"
  }
} as const;

export type TerminalThemeName = keyof typeof terminalThemes;

export function getTerminalTheme(name: string) {
  return terminalThemes[name as TerminalThemeName] ?? terminalThemes.nomad;
}
```

---

## 12. PWA setup

Use Next.js App Router manifest support.

Create:

```txt
app/manifest.ts
```

```ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nomad",
    short_name: "Nomad",
    description: "Mobile-first tmux manager",
    start_url: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#FF5F00",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png"
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png"
      },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      }
    ]
  };
}
```

App icon design:

```txt
Background: #1A1714
Four topographic rings in orange #FF5F00
Ring opacity: 20%, 40%, 65%, 90%
Center glyph: >_
Glyph color: #F0EBE5
Font: JetBrains Mono semibold
Exports: 192, 512, 512 maskable
```

Service worker:

* Register a basic service worker.
* Cache app shell and static assets.
* Do not cache terminal data.
* Do not cache credentials.
* Do not cache API responses containing server metadata unless intentionally designed later.

---

## 13. State management

Use React built-in state, reducers, and context.

No Redux.

No Zustand for v1.

Contexts:

```txt
SocketContext
SettingsContext
ThemeProvider from next-themes
```

Sonner handles toast state internally.

### Socket state machine

```txt
idle
connecting
connected
session_picking
attached
reconnecting
disconnected
error
```

Reducer actions:

```ts
type SocketAction =
  | { type: "CONNECT_REQUEST"; serverId: string }
  | { type: "CONNECTED" }
  | { type: "SESSIONS_RECEIVED"; sessions: TmuxSession[] }
  | { type: "ATTACHED"; sessionName: string }
  | { type: "RECONNECTING" }
  | { type: "DISCONNECTED" }
  | { type: "ERROR"; message: string };
```

Keep state clear and boring. Do not hide connection state in random component-local state.

---

## 14. Mobile-specific behaviors

### Keyboard handling

Requirements:

* When soft keyboard opens, terminal pane shrinks to fit remaining space.
* Action bar stays above keyboard.
* Use `window.visualViewport` where available.
* Fall back to safe area bottom when unavailable.

Behavior:

```ts
window.visualViewport?.addEventListener("resize", handleViewportChange);
```

Action bar bottom position:

```txt
window.innerHeight - visualViewport.height + safeAreaBottom + 16
```

### Safe areas

Utilities:

```css
.pb-safe {
  padding-bottom: env(safe-area-inset-bottom);
}

.pt-safe {
  padding-top: env(safe-area-inset-top);
}
```

Viewport:

```ts
export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};
```

### Touch behavior

Rules:

```txt
Action buttons use touch-action: manipulation.
Terminal pane uses overscroll-behavior: none.
Bottom sheets support drag down to dismiss.
Long press session row for context actions.
```

Long press:

```txt
500ms press on session row opens rename and kill context menu.
```

### Bottom sheet gestures

Rules:

```txt
Drag handle at top of every mobile sheet.
Swipe down past 40% sheet height dismisses.
Swipe velocity greater than 500px/s dismisses.
Tap backdrop dismisses.
Use Framer Motion drag.
```

---

## 15. Desktop adaptations

When viewport is at least `768px`:

```txt
Use sidebar instead of bottom-sheet-first navigation.
Sidebar width: 260px.
Sidebar background: sidebar token.
Sidebar border-right: border token.
Main area: terminal fills remaining width.
Action bar becomes toolbar above terminal.
Bottom sheets become centered dialogs.
Show hover states.
Increase topo texture opacity to 0.06.
```

Desktop layout:

```txt
┌───────────────┬────────────────────────────┐
│ Sidebar       │ Main terminal area          │
│ Servers       │ Nav / toolbar               │
│ Sessions      │ Window tabs                 │
│ Settings link │ Terminal                    │
└───────────────┴────────────────────────────┘
```

Sidebar content:

* Server list with status dots.
* Connected server highlighted.
* Session list below connected server.
* Settings link pinned near bottom.

---

## 16. Routing

Routes:

```txt
/                     Server list
/settings             Settings
/session/[serverId]   Terminal view for connected server
```

Navigation:

* Use Next.js `router.push()`.
* Use Framer Motion for page transitions.
* Use `AnimatePresence` for route transitions where practical.
* Socket disconnects on terminal unmount unless reconnect flow is active.

Back navigation from session:

* If attached, confirm detach unless `confirm_detach` is false.
* On detach, emit `detach`.
* Clean up socket listeners.
* Navigate home.

---

## 17. Docker and deployment

### Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["node", "server.js"]
```

### docker-compose.yml

```yaml
version: "3.8"

services:
  nomad:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - nomad-data:/app/data
    environment:
      - NODE_ENV=production
      - NOMAD_SECRET=${NOMAD_SECRET}
      - PORT=3000
    restart: unless-stopped

volumes:
  nomad-data:
```

### .env.example

```txt
NOMAD_SECRET=change-this-to-a-random-string-at-least-32-chars
NODE_ENV=production
PORT=3000
```

Deployment rules:

* DB is stored at `/app/data/nomad.db`.
* `/app/data` must be volume-mounted.
* `NOMAD_SECRET` must be stable across container recreations.
* Changing `NOMAD_SECRET` breaks decryption for existing credentials.
* Do not expose Nomad directly to the public internet without authentication and TLS.
* Recommended access path is Tailscale, VPN, local network, or authenticated reverse proxy.

---

## 18. Key implementation notes for Claude Code

1. xterm.js must be client-side only.

Use:

```tsx
const Terminal = dynamic(() => import("@/components/Terminal"), {
  ssr: false
});
```

2. Socket.IO client must be client-side only.

Initialize in `useEffect` or inside a client component.

3. Terminal data is binary-safe via base64.

Server:

```js
socket.emit("terminal:output", {
  data: chunk.toString("base64")
});
```

Client:

```ts
terminal.write(atob(data));
```

4. PTY resize must be debounced.

Use ResizeObserver and debounce by 100ms.

5. Use `conn.shell()` for interactive terminal.

Do not use `conn.exec()` for the interactive terminal.

6. Use `conn.exec()` only for one-shot tmux commands.

Examples:

* list sessions
* list windows
* kill session
* rename window

7. tmux auto-create should use:

```bash
tmux new-session -A -s <sessionName>
```

8. Window list polling is acceptable for v1.

Poll every 2 seconds after attach.

9. Never log credentials.

No password logs. No private key logs. No decrypted credential errors.

10. Never return credentials from API.

`GET /api/servers` must omit `credential`.

11. Initialize encrypted SQLite correctly.

```js
const Database = require("better-sqlite3-multiple-ciphers");
const db = new Database(dbPath);
db.pragma(`key='${secret}'`);
```

12. PWA haptics vary by browser.

Use `web-haptics`, then fallback gracefully.

13. Framer Motion and App Router need client boundaries.

Use `"use client"` on animated components.

14. Dark mode uses `next-themes`.

Use:

```tsx
<NextThemesProvider attribute="class" defaultTheme="system" enableSystem>
  {children}
</NextThemesProvider>
```

15. Tailwind dark mode uses class strategy.

If a Tailwind config is present:

```ts
darkMode: "class"
```

16. No lucide-react.

All icons must be Phosphor Icons.

17. Most Phosphor icons should use filled weight.

Default to:

```tsx
weight="fill"
```

18. Use Sonner instead of a custom Toast component.

Do not add custom Toast files unless absolutely required.

19. No `<form>` elements in React components.

Use button `onClick` handlers for submissions. This avoids mobile keyboard and submit edge cases in this app.

20. SSH key passphrase handling.

Add optional passphrase input in the connect flow if needed. Do not store passphrase by default.

21. Keep terminal dark regardless of global theme.

The app can be light or dark, but terminal theme is controlled separately.

22. Use shadcn source-level customization when needed.

Do not fight shadcn from the outside with messy overrides. Edit the generated component when the primitive needs to match Nomad.

---

## 19. File checklist

Required files:

```txt
server.js

lib/db.js
lib/ssh.js
lib/tmux.js
lib/animations.ts
lib/terminalThemes.ts

app/globals.css
app/layout.tsx
app/page.tsx
app/manifest.ts
app/settings/page.tsx
app/session/[serverId]/page.tsx

components/ServerCard.tsx
components/AddServerSheet.tsx
components/EditServerSheet.tsx
components/SessionSheet.tsx
components/NewSessionInput.tsx
components/Terminal.tsx
components/ActionBar.tsx
components/WindowTabs.tsx
components/BottomSheet.tsx
components/ConfirmSheet.tsx
components/NavBar.tsx
components/EmptyState.tsx
components/StatusDot.tsx
components/SegmentedControl.tsx
components/Spinner.tsx
components/ReconnectBanner.tsx

components/ui/button.tsx
components/ui/input.tsx
components/ui/textarea.tsx
components/ui/label.tsx
components/ui/switch.tsx
components/ui/select.tsx
components/ui/separator.tsx
components/ui/card.tsx
components/ui/sheet.tsx
components/ui/dialog.tsx
components/ui/checkbox.tsx

contexts/SocketContext.tsx
contexts/SettingsContext.tsx
contexts/ThemeProvider.tsx

hooks/useSocket.ts
hooks/useSettings.ts
hooks/useHaptics.ts
hooks/useTerminal.ts

public/topo-pattern.svg
public/icons/icon-192.png
public/icons/icon-512.png
public/icons/icon-512-maskable.png

tailwind.config.ts
next.config.ts
tsconfig.json
.env.example
Dockerfile
docker-compose.yml
README.md
```

Do not include:

```txt
components/Toast.tsx
components/ToastProvider.tsx
lucide-react
zustand
redux
next-pwa
```

Sonner replaces custom toast components.

---

## 20. README requirements

The README must include:

```txt
1. Project name and short description.
2. What Nomad is.
3. Requirements.
4. Quick start.
5. Production Docker setup.
6. Environment variables.
7. PWA install instructions.
8. Security notes.
9. Screenshot placeholder.
10. License placeholder.
```

README outline:

````md
# Nomad

Nomad is a mobile-first, self-hosted tmux manager that lets you connect to remote servers over SSH from a browser and control tmux sessions without needing a dedicated SSH client.

## Requirements

- Node.js 20+
- tmux installed on target servers
- SSH access to target servers
- Docker optional
- Tailscale, VPN, local network, or trusted reverse proxy recommended

## Quick start

```bash
git clone <repo-url>
cd nomad
npm install
cp .env.example .env
npm run dev
````

Edit `.env` and set `NOMAD_SECRET`.

## Production

```bash
docker compose up -d
```

## Environment variables

| Variable       | Required | Description                                  |
| -------------- | -------- | -------------------------------------------- |
| `NOMAD_SECRET` | Yes      | Secret used for encrypted credential storage |
| `NODE_ENV`     | No       | `production` for production                  |
| `PORT`         | No       | Defaults to `3000`                           |

## PWA install

### iOS

Open Nomad in Safari, tap Share, then Add to Home Screen.

### Android

Open Nomad in Chrome, tap menu, then Install app.

## Security

Nomad stores SSH credentials encrypted in SQLite. Keep `NOMAD_SECRET` stable and private. Do not expose Nomad directly to the public internet without additional authentication and TLS.

## Screenshots

Coming soon.

````

---

## 21. Summary of decisions

| Concern | Decision |
|---|---|
| Frontend | Next.js 15 App Router |
| Backend | Custom Node.js server with Express and Socket.IO |
| SSH | `ssh2` npm package |
| Terminal | `@xterm/xterm` v5 with fit, attach, web-links, search addons |
| Storage | `better-sqlite3-multiple-ciphers` encrypted SQLite |
| UI foundation | shadcn/ui |
| Theme source | tweakcn-generated CSS variables |
| Styling | Tailwind CSS v4 |
| Icons | Phosphor Icons, usually filled |
| Animations | Framer Motion |
| Toasts | Sonner |
| Haptics | `web-haptics` plus `navigator.vibrate` fallback |
| PWA | Next.js App Router manifest plus basic service worker |
| Dark mode | `next-themes`, class strategy |
| State | React Context plus `useReducer` |
| Port | `3000` |
| Data dir | `/app/data` |
| Access model | Local network, Tailscale, VPN, or authenticated proxy |

---

## 22. Non-negotiables

```txt
Use shadcn/ui as the component base.
Use the tweakcn theme in globals.css.
Use Phosphor Icons only.
Use filled Phosphor icons by default.
Do not use lucide-react.
Use Sonner for toasts.
Keep xterm.js client-side only.
Use Socket.IO for terminal transport.
Use conn.shell() for interactive terminal.
Use encrypted SQLite for credentials.
Never expose credentials through REST responses.
Never log credentials.
Terminal stays dark regardless of app theme.
Mobile-first behavior must be polished, not an afterthought.
````
