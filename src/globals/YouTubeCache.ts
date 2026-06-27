import type { GlobalConfig } from 'payload'

/**
 * YouTubeCache — cached YouTube channel stats + video list (was youtube-cache.json).
 * Not configuration; purely a cache refreshed by lib/youtube.ts. Stored as a global
 * so store.ts can be fully retired. Read/write through the cache shim in store.ts.
 */
export const YouTubeCache: GlobalConfig = {
  slug: 'youtube-cache',
  admin: { group: 'Node', description: 'Cached YouTube data — refreshed automatically.' },
  access: { read: () => true },
  fields: [
    { name: 'channel', type: 'json' },
    { name: 'videos', type: 'json' },
    { name: 'updatedAt', type: 'text' },
  ],
}
