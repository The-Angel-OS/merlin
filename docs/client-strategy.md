# JARVIS Client Strategy

**Status**: Draft (Sprint 47 target)
**Authors**: Desktop Claude + kenne
**Last updated**: 2026-04-16

JARVIS has three client form factors. All of them are thin shells around
the same Next.js PWA core running at `C:\Dev\mediaserver`. None of them
ship business logic — they host, discover, and surface.

```
 ┌─────────────────────────────────────────────────────────────┐
 │                       JARVIS Core (PWA)                     │
 │   Next.js 15 App Router + Payload proxy + LiveKit + LAN     │
 │               C:\Dev\mediaserver   (port 3001)              │
 └───────────┬──────────────────┬──────────────────┬───────────┘
             │                  │                  │
   ┌─────────▼────────┐ ┌───────▼────────┐ ┌───────▼────────┐
   │  Windows Tray    │ │   Android      │ │      iOS       │
   │  (Tauri)         │ │  (Capacitor)   │ │  (Capacitor)   │
   └──────────────────┘ └────────────────┘ └────────────────┘
```

---

## 1. Windows desktop (system tray launcher)

### Recommendation: **Tauri 2**, not Electron

| Concern            | Electron             | Tauri 2                          |
| ------------------ | -------------------- | -------------------------------- |
| Binary size        | ~90–120 MB           | ~8–15 MB                         |
| RAM idle           | ~150 MB              | ~40 MB                           |
| Tray support       | Yes                  | Yes (native)                     |
| Auto-update        | electron-updater     | tauri-plugin-updater (built-in)  |
| Signing/notarize   | Separate chain       | Windows signtool works           |
| Language           | Node                 | Rust core + JS frontend          |
| LiveKit WebRTC     | OK                   | OK (uses system WebView2 → OK)   |

WebView2 ships on all Windows 10+ boxes. We already have Rust experience
via existing tooling. Tray is the whole point → Tauri wins.

### Feature set (v1)

- System-tray icon with menu:
  - **Open JARVIS** → opens default browser to `http://localhost:3001`
    (or opens an embedded WebView2 window)
  - **Cameras** → direct to `/cameras`
  - **Spaces** → direct to `/spaces`
  - **LEO** → direct to `/leo`
  - **Status: online / offline / syncing** (live indicator)
  - **Discovered nodes** (submenu, populated from `/api/infra/discovery`)
  - **Settings** → opens `/settings`
  - **Quit**
- Start-on-boot toggle (stored in `%APPDATA%\JARVIS\config.json`)
- Single-instance enforcement (2nd launch just shows the tray)
- Auto-start the Next.js server as a child process if not already running
  (check port 3001 first; respect existing instance)
- Native notifications for:
  - Camera motion detected
  - LiveKit room invite received
  - LEO system alert

### Project layout (future)

```
C:\Dev\mediaserver\
  src-tauri/               ← Rust tray + updater
    src/
      main.rs              ← tray menu + single-instance + spawn next
      tray.rs
      ipc.rs               ← commands exposed to WebView
    tauri.conf.json
  src/                     ← existing Next.js app (unchanged)
  package.json             ← adds "tauri": "tauri" script
```

### Build

- `pnpm tauri dev`  → launches tray + dev server
- `pnpm tauri build` → produces `JARVIS_0.1.0_x64-setup.exe` + MSI

Sign with your Angel OS code-signing cert (same one used for
spaces-angels.com Windows installers if/when we have them).

---

## 2. Android client

### Recommendation: **Capacitor 6**

Already the architectural assumption (see `storage.ts` abstraction, PWA
manifest, `display_override`). Capacitor wraps the same Next.js build
output that the PWA serves.

### Build mode

**Server-backed, not static export.**

JARVIS is a stateful local node (reads DB, proxies cameras, issues
LiveKit tokens). Android doesn't run Node. So the mobile client must
talk to **some** JARVIS instance — either:

- a JARVIS Windows/Tauri instance on the same LAN (discovered), or
- the tenant's Angel OS origin (spaces-angels.com / clearwater-cruisin.spacesangels.com)

The Capacitor shell ships **only** the client-side bundle (UI, PWA
shell, LEO chat widget, camera viewer, book reader) and connects to a
configurable base URL stored in `Preferences`.

### First-run flow

1. App opens → `onboarding/connect` screen
2. "Scan LAN" → uses a native mDNS/Bonjour plugin to find JARVIS nodes
   advertising `_jarvis._tcp.local`
3. User picks a node OR types a URL (e.g. `https://spaces-angels.com`)
4. OAuth (Google / Twitter / Apple) against chosen origin
5. Tenant selection → stored via `appStorage.setTenant(...)`
6. Home

### Native plugins needed

- `@capacitor/preferences` ✅ already installed
- `@capacitor/push-notifications` (camera motion, room invites)
- `@capacitor/network` (show offline banner; route reads to cache)
- `@capacitor/filesystem` (book downloads for offline reading)
- `@capacitor/share` (share posts/products to other apps)
- `@capacitor-community/barcode-scanner` (QR pairing with a JARVIS node)
- Custom: `capacitor-mdns` or wrap Android NSD via plugin

### Build commands

```bash
pnpm build                          # next build
npx cap sync android                # copy web assets → android/
npx cap open android                # open in Android Studio
# then build signed APK / AAB
```

### Play Store requirements

- Package id: `com.angels.jarvis`
- Privacy policy URL (host on spaces-angels.com/legal/privacy)
- Data safety form: we store user email + OAuth tokens; all on-device
  except tenant-scoped data via API
- Target SDK 34+
- 16KB page size alignment (Android 15 requirement)

---

## 3. iOS client

### Recommendation: **Same Capacitor 6 project**

```bash
npx cap add ios
npx cap sync ios
npx cap open ios
```

### iOS-specific concerns

- **WKWebView WebRTC**: LiveKit works in WKWebView since iOS 14.3, but
  camera/mic permissions require `NSCameraUsageDescription` and
  `NSMicrophoneUsageDescription` in `Info.plist`.
- **mDNS/Bonjour**: requires `NSLocalNetworkUsageDescription` + a list
  of Bonjour service types in `Info.plist`:
  ```xml
  <key>NSBonjourServices</key>
  <array><string>_jarvis._tcp</string></array>
  ```
- **Push notifications**: need Apple Push Notification service (APNs)
  key, config via `@capacitor/push-notifications`.
- **Sign in with Apple**: required if we offer Google/Twitter OAuth.
  Use `@capacitor-community/apple-sign-in`.
- **App Store review**: they're picky about "companion app" patterns.
  We need to demonstrate standalone value (PWA home + book reader work
  without a JARVIS node). Hence the WDEG book is shipped in-bundle
  as a fallback — review can open it offline and see value.
- **Background mode**: for camera motion push. `background-fetch` mode
  in `Info.plist`.

### App Store requirements

- Bundle id: `com.angels.jarvis`
- Privacy manifest (PrivacyInfo.xcprivacy) — required 2024+
- Age rating: 4+ (WDEG book is G-rated; no adult content)

---

## 4. Cross-platform concerns (all three clients)

### Shared responsibilities

All three shells must:
- Persist config via `appStorage` (already abstracted in `src/lib/storage.ts`)
- Detect the base JARVIS URL (discovery or manual)
- Refresh LEO's LiveKit tokens every <2h (tokens TTL 2h)
- Show offline banner when network is down
- Cache the last successful response from `/api/payload/*` for 2h (PWA
  runtime cache handles this today)

### Split responsibilities

| Feature             | Windows Tray | Android | iOS |
| ------------------- | ------------ | ------- | --- |
| Run Next.js server  | Yes (child)  | No      | No  |
| LAN mDNS discover   | via Rust     | NSD     | Bonjour |
| Background cameras  | Yes (notify) | Yes (push) | Limited |
| Book offline read   | Yes          | Yes     | Yes |
| LiveKit WebRTC      | Yes (WV2)    | Yes     | Yes (iOS 14.3+) |
| Tray/widget         | Tray         | Widget v2 | Widget |
| Auto-start on boot  | Yes (opt-in) | Yes (opt-in) | No (not allowed) |

### Versioning

All three read `/api/version` from the connected JARVIS node. If
server version > client version, show an "update available" banner.
The Tauri updater and App/Play stores handle the actual updates.

---

## 5. Rollout plan

### Sprint 47 (next)

- [ ] Add `src-tauri/` scaffold, minimal tray icon + "Open JARVIS" menu
- [ ] Advertise `_jarvis._tcp.local` from the Next.js server (zeroconf)
- [ ] Build Windows MSI via `pnpm tauri build`, signed
- [ ] Decide bundle ids (`com.angels.jarvis` proposed)
- [ ] Reserve app names: JARVIS / Angel JARVIS / Spaces Angel

### Sprint 48

- [ ] `npx cap add android`, first APK build
- [ ] mDNS discovery on Android
- [ ] OAuth flow wired (Google → then Twitter/X) against Angel OS
- [ ] Internal test track on Play Console
- [ ] Push notifications (FCM)

### Sprint 49

- [ ] `npx cap add ios`, first TestFlight build
- [ ] APNs + Sign in with Apple
- [ ] TestFlight invite to kenne + tylersuzanne84
- [ ] Privacy manifest + review pre-check

### Sprint 50

- [ ] Public release: Windows MSI on spaces-angels.com/download
- [ ] Play Store closed beta
- [ ] App Store submit for review
- [ ] Tauri auto-updater live

---

## 6. Open questions

1. **Code signing certs** — do we already have an EV cert for Windows,
   or do we buy one? ($300–$500/yr)
2. **Apple Developer account** — $99/yr, need to enroll under "Angel OS"
   org, not personal, so it survives ownership changes.
3. **Google Play Developer account** — $25 one-time.
4. **Push notification infra** — FCM for Android, APNs for iOS. Send
   from Angel OS? Add a `src/utilities/push-sender.ts` in angels-os.
5. **mDNS advertisement** — Next.js server needs to announce itself.
   Add a `bonjour-service` npm package + a server-start hook.
6. **Tray on Linux?** — Out of scope v1. Tauri supports it if we ever
   want it.

---

## 7. Where this fits in memory

Update `C:\Users\kenne\.claude\projects\C--Dev-angels-os\memory\MEMORY.md`
once Sprint 47 lands:

```md
## JARVIS Clients (Sprint 47+)
- Windows: Tauri 2 tray app → src-tauri/, signed MSI
- Android: Capacitor 6 → android/, AAB on Play Store
- iOS: Capacitor 6 → ios/, IPA on App Store
- All three discover LAN nodes via _jarvis._tcp.local mDNS
- Base URL configurable; default = discovered node, fallback = spaces-angels.com
- Storage abstracted via src/lib/storage.ts (Capacitor Preferences → localStorage → memory)
```
