/**
 * Nimue — Capacitor configuration.
 *
 * To wire native shells:
 *   pnpm add @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android \
 *            @capacitor/preferences @capacitor/camera @capacitor/filesystem \
 *            @capacitor/network @capacitor/haptics @capacitor/splash-screen \
 *            @capacitor/status-bar
 *   pnpm next build && npx next export   # (or set output: 'export' via env flag)
 *   npx cap add ios
 *   npx cap add android
 *   npx cap sync
 *
 * `webDir` points at the exported static site. For hybrid (SSR web + native),
 * build the web app with `NEXT_EXPORT=1 pnpm build` — see next.config.js.
 */
// Note: `import type { CapacitorConfig } from '@capacitor/cli'` is the canonical
// form, but we keep this file usable before Capacitor is installed. The shape
// below matches CapacitorConfig — just duck-typed to avoid a dependency on
// @capacitor/cli at Next.js compile time.
type CapacitorConfigShape = Record<string, unknown>

const config: CapacitorConfigShape = {
  appId: 'com.angels.nimue',
  appName: 'Nimue',
  webDir: 'out',
  bundledWebRuntime: false,
  backgroundColor: '#0a0a0a',
  server: {
    // During development, let the native shell load from the dev server:
    //   CAP_SERVER_URL=http://192.168.1.10:3000 npx cap run ios
    // In production, web assets are bundled from webDir.
    url: process.env.CAP_SERVER_URL,
    cleartext: !!process.env.CAP_SERVER_URL,
    androidScheme: 'https',
  },
  ios: {
    contentInset: 'automatic',
    allowsLinkPreview: false,
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      launchAutoHide: true,
      backgroundColor: '#0a0a0a',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0a0a0a',
      overlaysWebView: false,
    },
    Preferences: {
      group: 'NimueGroup',
    },
  },
}

export default config
