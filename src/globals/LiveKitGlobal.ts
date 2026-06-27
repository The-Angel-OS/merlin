import type { GlobalConfig } from 'payload'

/**
 * LiveKitGlobal — LiveKit/Spaces voice config (was livekit.json).
 * Write-through cached in lib/store.ts so getLiveKitConfig() stays synchronous.
 */
export const LiveKitGlobal: GlobalConfig = {
  slug: 'livekit-config',
  admin: { group: 'Node' },
  access: { read: () => true },
  fields: [
    { name: 'serverUrl', type: 'text', admin: { description: 'wss://your-livekit-server' } },
    { name: 'apiKey', type: 'text' },
    { name: 'apiSecret', type: 'text' },
  ],
}
