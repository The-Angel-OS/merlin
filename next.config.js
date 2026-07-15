const { execSync } = require('child_process')

// Build stamp — bakes the git SHA + build time into the bundle at `next build`
// time. Surfaced in the sidebar footer + /api/health so you can tell AT A GLANCE
// whether a deploy actually took: if the running node is stale (an orphaned old
// process kept the port), the SHA won't match HEAD.
let BUILD_SHA = process.env.BUILD_SHA || ''
try {
  if (!BUILD_SHA) BUILD_SHA = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
} catch {
  BUILD_SHA = 'unknown'
}
const BUILD_TIME = new Date().toISOString()

/** @type {import('next').NextConfig} */
const baseConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_BUILD_SHA: BUILD_SHA,
    NEXT_PUBLIC_BUILD_TIME: BUILD_TIME,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'yt3.ggpht.com' },
      { protocol: 'https', hostname: 'i.ytimg.com' },
      { protocol: 'https', hostname: '*.googleusercontent.com' },
      { protocol: 'https', hostname: '*.spacesangels.com' },
      { protocol: 'https', hostname: '*.vercel-storage.com' },
      { protocol: 'http', hostname: '192.168.*' },
    ],
  },
  serverExternalPackages: ['livekit-server-sdk', 'better-sqlite3'],
  // Next 15.3+ rejects cross-origin requests for /_next/* assets with 400
  // Bad Request unless the origin is in this allowlist. `next dev -H 0.0.0.0`
  // binds to every interface, but accessing via LAN IP is still considered
  // cross-origin and gets blocked. LAN subnets + .local (mDNS) covered here.
  // Glob wildcards match a single dot-separated segment, so an IPv4
  // address like 192.168.0.234 needs `192.168.*.*` (4 segments), not
  // `192.168.*` (which would only match 192.168.foo).
  allowedDevOrigins: [
    '192.168.*.*',
    '10.*.*.*',
    '172.16.*.*', '172.17.*.*', '172.18.*.*', '172.19.*.*',
    '172.20.*.*', '172.21.*.*', '172.22.*.*', '172.23.*.*',
    '172.24.*.*', '172.25.*.*', '172.26.*.*', '172.27.*.*',
    '172.28.*.*', '172.29.*.*', '172.30.*.*', '172.31.*.*',
    '*.local',
    '*.lan',
  ],
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/proxy/vmware/:path*',
          destination: `${process.env.VMWARE_URL || 'https://192.168.1.1'}/:path*`,
        },
        {
          source: '/proxy/kubernetes/:path*',
          destination: `${process.env.K8S_DASHBOARD_URL || 'http://localhost:8001'}/:path*`,
        },
      ],
    }
  },
}

// PWA wrapper — applied in production only
let nextConfig = baseConfig
try {
  const withPWA = require('@ducanh2912/next-pwa').default({
    dest: 'public',
    cacheOnFrontEndNav: true,
    aggressiveFrontEndNavCaching: true,
    reloadOnOnline: true,
    // DISABLED while recovering clients from a stale precaching SW (see
    // public/sw.js, which is now a self-destruct worker). Re-enabling this
    // regenerates a precaching sw.js and overwrites the killer — only flip back
    // to `process.env.NODE_ENV === 'development'` once all clients have recovered.
    disable: true,
    workboxOptions: {
      disableDevLogs: true,
      // Self-heal stale clients: a new SW activates immediately, claims open
      // pages, and purges outdated precaches. Without this, a SW installed by
      // an earlier prod build keeps serving a stale app-shell that points at a
      // deleted CSS chunk → page renders unstyled (and a Google TV webview
      // can't easily clear its cache to recover).
      skipWaiting: true,
      clientsClaim: true,
      cleanupOutdatedCaches: true,
      runtimeCaching: [
        {
          urlPattern: /\/api\/payload\/.*/i,
          handler: 'StaleWhileRevalidate',
          options: {
            cacheName: 'angel-os-api-cache',
            expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 2 },
          },
        },
        {
          urlPattern: /\/api\/cameras\/.*\/snapshot/i,
          handler: 'NetworkFirst',
          options: {
            cacheName: 'camera-snapshots',
            expiration: { maxEntries: 50, maxAgeSeconds: 30 },
          },
        },
        {
          urlPattern: /\.(png|jpg|jpeg|svg|gif|webp|ico)$/i,
          handler: 'CacheFirst',
          options: {
            cacheName: 'image-cache',
            expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 },
          },
        },
      ],
    },
  })
  nextConfig = withPWA(baseConfig)
} catch {
  // @ducanh2912/next-pwa not installed yet — run: pnpm add @ducanh2912/next-pwa
}

// Payload wrapper — mounts the embedded CMS admin (/admin) + API. Required by
// Payload 3's Next integration; applied LAST so it wraps the (optionally PWA-
// wrapped) config. NOTE: editing next.config.js is disallowed for Core, but
// explicitly permitted for Merlin (local node CMS) per project direction.
const { withPayload } = require('@payloadcms/next/withPayload')

module.exports = withPayload(nextConfig)
