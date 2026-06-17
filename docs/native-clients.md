# Nimue Native Clients — Setup Guide

Nimue runs as a **web app (Next.js PWA)** today. To ship iOS / Android / Desktop shells, add Capacitor and/or Tauri on top of the same codebase.

---

## iOS + Android (Capacitor 6)

### 1. Install dependencies

```bash
pnpm add @capacitor/core @capacitor/cli
pnpm add @capacitor/ios @capacitor/android
pnpm add @capacitor/preferences @capacitor/camera @capacitor/filesystem
pnpm add @capacitor/network @capacitor/haptics
pnpm add @capacitor/splash-screen @capacitor/status-bar
```

### 2. Prereqs

- **iOS**: macOS + Xcode 15+ + CocoaPods (`sudo gem install cocoapods`)
- **Android**: Android Studio + SDK 34+ + Java 17

### 3. Build the web bundle for native

Native shells load from a static export. Set `NEXT_EXPORT=1` so `next.config.js` flips to `output: 'export'`:

```bash
NEXT_EXPORT=1 pnpm build
```

Output lands in `./out`. This matches `webDir` in `capacitor.config.ts`.

### 4. Add platforms

```bash
npx cap add ios
npx cap add android
npx cap sync
```

### 5. Run

```bash
# Native project opens in Xcode / Android Studio
npx cap open ios
npx cap open android

# Or run directly on a connected device
npx cap run ios --target "iPhone 15"
npx cap run android
```

### 6. Live reload during dev

Point the native shell at your dev server (Nimue already on port 3000):

```bash
# Desktop's LAN IP — get it via `ipconfig` (Windows) or `ifconfig` (macOS)
CAP_SERVER_URL=http://192.168.1.10:3000 npx cap run android
```

The config reads `CAP_SERVER_URL` and injects it as `server.url`.

### 7. Capabilities to enable

- **iOS** (`Info.plist`): `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSLocationWhenInUseUsageDescription`
- **Android** (`AndroidManifest.xml`): `CAMERA`, `READ_MEDIA_IMAGES`, `ACCESS_FINE_LOCATION`, `POST_NOTIFICATIONS`

### 8. Store-required IAP

Digital goods (e.g. WDEG book paywall) must go through Apple / Google IAP, not Stripe, on mobile. Easiest path:

```bash
pnpm add @revenuecat/purchases-capacitor
```

RevenueCat unifies both stores and is free up to $2.5k/mo revenue. Stripe remains the path for web + desktop.

---

## Desktop (Tauri 2)

### 1. Prereqs

- **Rust**: `curl https://sh.rustup.rs -sSf | sh` (or `winget install Rustlang.Rust.MSVC` on Windows)
- **Cargo CLI**: `cargo install tauri-cli --version "^2.0.0"`
- **Windows**: MSVC build tools (via Visual Studio Installer → "Desktop development with C++")
- **macOS**: Xcode command-line tools (`xcode-select --install`)
- **Linux**: `webkit2gtk`, `libayatana-appindicator3`, `librsvg2` (see Tauri docs)

### 2. Init

```bash
cargo tauri init
# App name: Nimue
# Window title: Nimue — Angel OS Node
# Web assets location: ../out     (matches NEXT_EXPORT=1)
# Dev server URL: http://localhost:3000
# Frontend dev cmd: pnpm dev
# Frontend build cmd: NEXT_EXPORT=1 pnpm build
```

### 3. System tray

Edit `src-tauri/tauri.conf.json`:

```json
{
  "tauri": {
    "systemTray": {
      "iconPath": "icons/icon.png",
      "iconAsTemplate": false
    }
  }
}
```

In `src-tauri/src/main.rs`, add a tray menu with: Open, Start Capture, Pause Uploader, Quit. Use the `tauri::tray::SystemTray` API (examples in Tauri docs).

### 4. Build

```bash
NEXT_EXPORT=1 pnpm build
cargo tauri build
```

Outputs: `.msi` / `.dmg` / `.AppImage` in `src-tauri/target/release/bundle/`.

Signed MSI on Windows: add a self-signed cert for dev, a proper EV cert for production.

---

## mDNS LAN discovery

For Nimue instances to find each other on a LAN (e.g. laptop finds desktop's local Angel OS):

- **Tauri**: `tauri-plugin-mdns` or a sidecar Rust binary advertising `_nimue._tcp.local`
- **Capacitor**: `@capacitor-community/zeroconf` plugin
- **Web (PWA)**: not possible — browsers don't expose mDNS

Service name: `_nimue._tcp.local`, port 3000, TXT records: `version`, `tenant`, `role`.

---

## Storage alignment

`src/lib/storage.ts` auto-detects Capacitor and uses `@capacitor/preferences` (iOS Keychain / Android SharedPreferences) when available, falling back to localStorage in the browser and memory in SSR.

The inventory queue (`src/lib/inventoryQueue.ts`) uses IndexedDB — available in **every** target (browser, Capacitor WebView, Tauri WebView). No native bridge needed.

---

## Payments paths by platform

| Platform | Subscriptions / digital goods | Physical goods |
|---|---|---|
| Web | Stripe Checkout | Stripe Checkout |
| iOS | Apple IAP (required by store) → RevenueCat | Stripe in-app browser |
| Android | Google Play Billing → RevenueCat | Stripe in-app browser |
| Desktop (Tauri) | Stripe Checkout in default browser | Stripe Checkout in default browser |

---

## CI

```yaml
# .github/workflows/native.yml (sketch)
jobs:
  web:
    runs-on: ubuntu-latest
    steps: [pnpm install, pnpm test, pnpm build]
  android:
    runs-on: ubuntu-latest
    steps: [pnpm install, NEXT_EXPORT=1 pnpm build, npx cap sync android, ./gradlew assembleRelease]
  ios:
    runs-on: macos-latest
    steps: [pnpm install, NEXT_EXPORT=1 pnpm build, npx cap sync ios, xcodebuild -workspace ...]
  desktop:
    strategy: { matrix: { os: [windows-latest, macos-latest, ubuntu-latest] } }
    steps: [pnpm install, cargo tauri build]
```
