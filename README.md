# Nomad

Nomad is a mobile-first, self-hosted tmux manager that lets you connect to
remote servers over SSH from a browser and control tmux sessions without
needing a dedicated SSH client. It is installable as a PWA and works well on
phones, tablets, and desktops.

## Requirements

- Node.js 20+ (Tailwind v4's `@tailwindcss/oxide` native binding requires Node 20+)
- tmux installed on target servers
- SSH access to target servers
- Docker (optional)
- Tailscale, VPN, local network, or trusted reverse proxy recommended

## Quick start

```bash
git clone <repo-url>
cd nomad
npm install
cp .env.example .env
# Edit .env and set a long random NOMAD_SECRET (at least 32 chars).
npm run dev
```

Open http://localhost:3000.

The custom `server.js` starts Next.js, Express, and Socket.IO together on
port `3000`. On first run, Nomad creates `./data/nomad.db` and a `.nomad-key`
fallback file if `NOMAD_SECRET` is not set. SSH credentials are encrypted
with AES-256-GCM and never returned by the REST API.

## Production with Docker

```bash
docker compose up -d
```

The container writes its encrypted database to a `nomad-data` volume mounted
at `/app/data`. Set `NOMAD_SECRET` to a stable, long random string and keep
it private — losing it makes saved credentials unrecoverable.

## Environment variables

| Variable        | Required | Description                                            |
| --------------- | -------- | ------------------------------------------------------ |
| `NOMAD_SECRET`  | Yes (prod) | Secret used to derive the AES key and SQLCipher pragma |
| `NODE_ENV`      | No       | `production` for production                            |
| `PORT`          | No       | Defaults to `3000`                                     |
| `NOMAD_DATA_DIR`| No       | Override the data directory (default `/app/data` in prod, `./data` in dev) |

## PWA install

### iOS

Open Nomad in Safari → Share → Add to Home Screen.

### Android

Open Nomad in Chrome → menu → Install app.

## Security

Nomad stores SSH credentials encrypted in SQLite. The encryption key derives
from `NOMAD_SECRET` (or a generated `.nomad-key` for local dev). The REST API
returns server metadata only — credentials are never sent to the client and
never logged. Do not expose Nomad directly to the public internet without
additional authentication and TLS.

## Screenshots

Coming soon.

## License

TBD.
