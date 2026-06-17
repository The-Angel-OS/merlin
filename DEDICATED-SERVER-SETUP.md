# JARVIS — Dedicated Windows Server 2019 Setup Guide
> Angel OS Primary Development Node · Ad Astra · RAH

This guide configures the Windows Server 2019 box as the primary Angel OS development node,
running JARVIS Command Center at boot and keeping it in sync with the primary desktop.

---

## 1. Prerequisites

### Node.js (LTS)
```powershell
# Download from https://nodejs.org/ (LTS, Windows x64 installer)
# Or via winget:
winget install OpenJS.NodeJS.LTS
# Verify
node --version   # >= 20.x
npm --version
```

### pnpm
```powershell
npm install -g pnpm
pnpm --version   # >= 9.x
```

### Git
```powershell
winget install Git.Git
git config --global user.name "Kenneth Courtney"
git config --global user.email "your@email.com"
```

---

## 2. Clone Repos

### JARVIS Command Center
```powershell
mkdir C:\Dev
cd C:\Dev
git clone https://github.com/YOUR_ORG/mediaserver.git mediaserver
cd mediaserver
pnpm install
```

### Angel OS (primary dev repo)
```powershell
cd C:\Dev
git clone https://github.com/The-Angel-OS/angels-os.git angels-os
cd angels-os
pnpm install
```

---

## 3. Environment Configuration

### JARVIS .env.local
Create `C:\Dev\mediaserver\.env.local`:
```
YOUTUBE_CHANNEL_ID=UCxxxxxxxxxxxxxxxx
YOUTUBE_API_KEY=AIzaSy...
YOUTUBE_CLIENT_ID=xxxx.apps.googleusercontent.com
YOUTUBE_CLIENT_SECRET=GOCSPX-...
YOUTUBE_REFRESH_TOKEN=1//...
ANGELS_API_URL=https://www.spacesangels.com
ANGELS_API_KEY=<bearer token from SpacesAngels admin>
ANTHROPIC_API_KEY=sk-ant-...
```

### Angel OS .env
Key fields for dev node:
```
DATABASE_URI=postgresql://postgres:<password>@74.208.87.243:5432/angels_os
PAYLOAD_SECRET=<same secret as production>
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_SERVER_URL=http://localhost:3000
```

> DB Note: Point to the shared production PostgreSQL at 74.208.87.243, or spin up a local
> PostgreSQL for isolated dev. Local is recommended to avoid polluting production data during testing.

---

## 4. Local PostgreSQL (Recommended for Isolated Dev)

```powershell
winget install PostgreSQL.PostgreSQL
# During install: set password, port = 5432

# After install, create DB:
psql -U postgres -c "CREATE DATABASE angels_os_dev;"

# Update Angel OS .env:
# DATABASE_URI=postgresql://postgres:<password>@localhost:5432/angels_os_dev

# Run Payload migrations:
cd C:\Dev\angels-os
pnpm payload migrate
```

---

## 5. Build JARVIS

```powershell
cd C:\Dev\mediaserver
pnpm build
pnpm start
# Open: http://localhost:3030
# LAN: http://<server-ip>:3030
```

---

## 6. Auto-Start at Boot (Task Scheduler)

More reliable than Startup folder / VBS scripts.

### Create JARVIS Task
1. Open **Task Scheduler** (taskschd.msc)
2. **Create Task** (not Basic Task)
3. **General tab**:
   - Name: `JARVIS Command Center`
   - Run whether user is logged on or not: checked
   - Run with highest privileges: checked
4. **Triggers tab** > New:
   - Begin: `At startup`
   - Delay task for: `30 seconds`
5. **Actions tab** > New:
   - Action: `Start a program`
   - Program/script: `C:\Dev\mediaserver\start-service.bat`
   - Start in: `C:\Dev\mediaserver`
6. **Conditions**: Uncheck "Start only if on AC power"
7. **Settings**: "If task fails, restart every 1 minute" x 3 attempts

---

## 7. PM2 (Production Process Manager)

For 24/7 uptime with crash recovery:

```powershell
npm install -g pm2 pm2-windows-startup

# Start JARVIS
cd C:\Dev\mediaserver
pm2 start "pnpm start" --name "jarvis" --cwd "C:\Dev\mediaserver"

# Save + configure Windows service
pm2 save
pm2-startup install

# Monitoring
pm2 status
pm2 logs jarvis
pm2 restart jarvis
```

PM2 auto-restarts on crash, rate-limits restarts, and survives reboots via Windows service.

---

## 8. Tailscale VPN (Remote Access)

JARVIS accessible from:
- Bedroom TV (Google TV) via LAN: `http://192.168.x.x:3030`
- Primary desktop via LAN or Tailscale: `http://100.104.19.36:3030`
- Mobile/remote via Tailscale: `http://<server-tailscale-ip>:3030`

```powershell
winget install Tailscale.Tailscale
# Sign in with same Google/GitHub account as primary desktop
# Note the Tailscale IP assigned to this server
```

---

## 9. Windows Firewall Rules

```powershell
# JARVIS (required)
New-NetFirewallRule -DisplayName "JARVIS 3030" -Direction Inbound -Protocol TCP -LocalPort 3030 -Action Allow

# Angel OS dev server (optional)
New-NetFirewallRule -DisplayName "Angel OS 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow

# PostgreSQL — local subnet only, do NOT expose to internet
New-NetFirewallRule -DisplayName "PostgreSQL 5432 Local" -Direction Inbound -Protocol TCP -LocalPort 5432 -RemoteAddress LocalSubnet -Action Allow
```

---

## 10. Git Workflow

The server is the **primary** dev node. Desktop is for review/UI work.

```powershell
# Morning sync
cd C:\Dev\angels-os && git pull origin main
cd C:\Dev\mediaserver && git pull origin main

# End of day — push from server
git add -p
git commit -m "feat: sprint description"
git push origin main
```

Always commit `pnpm-lock.yaml` changes.

---

## 11. Incident Monitoring

JARVIS monitors Angel OS health every 60 seconds via the SpacesAngels bridge.
Incidents logged to `data/incidents.json` and visible in Mission Control dashboard.

VAPI phone alerts (optional):
- Number: +1 (727) 440-8797
- Add `VAPI_API_KEY` to `.env.local` when implementing voice incident alerts

---

## 12. Data Directory Layout

```
C:\Dev\mediaserver\data\
  settings.json        API keys + config (gitignored)
  log.json             Activity log, last 500 entries (gitignored)
  files.json           Inbox file registry (gitignored)
  youtube-cache.json   Video/channel cache (gitignored)
  incidents.json       Incident tracker (gitignored)
  .gitkeep             keeps dir tracked in git
```

**Backup `settings.json` securely** — it contains all API keys.

---

## 13. Watched Directories

JARVIS file watcher monitors these by default:
- `C:\Users\<username>\Downloads`
- `C:\Users\<username>\Videos`
- `C:\Users\<username>\Pictures`
- `C:\Users\<username>\Desktop`

Adjust paths in `src/lib/watcher.ts` if server user profile differs from desktop.

---

## 14. Health Check URLs

| URL | Purpose |
|-----|---------|
| http://localhost:3030 | JARVIS Mission Control |
| http://localhost:3030/api/health | System health JSON |
| http://localhost:3030/api/angels/status | SpacesAngels bridge status |
| http://localhost:3030/api/system | Full system snapshot |
| http://localhost:3000 | Angel OS (if running locally) |

---

## 15. Quick Reference

```powershell
# JARVIS
cd C:\Dev\mediaserver
pnpm dev          # Dev mode with hot reload
pnpm build        # Production build
pnpm start        # Production server :3030

# Angel OS
cd C:\Dev\angels-os
pnpm dev          # Dev server :3000
pnpm build        # Production build
pnpm test:unit    # Unit tests (5210+)
pnpm test:int     # Integration tests
pnpm payload migrate  # Apply DB migrations

# PM2
pm2 status
pm2 logs jarvis
pm2 restart jarvis
pm2 reload all
```

---

*Ad Astra — RAH*
*JARVIS v2.0 · Angel OS Command Center · Kenneth Scott Courtney*
