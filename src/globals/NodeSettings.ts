import type { GlobalConfig } from 'payload'

/**
 * NodeSettings — Merlin's node configuration (was settings.json).
 *
 * Backed by a write-through in-memory cache in lib/store.ts: getSettings() stays
 * synchronous for hot loops, while this global is the durable source of truth and
 * the admin-editable surface. Fields mirror the Settings interface.
 */
export const NodeSettings: GlobalConfig = {
  slug: 'node-settings',
  admin: { group: 'Node' },
  access: { read: () => true },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Federation',
          fields: [
            { name: 'angelsApiUrl', type: 'text', defaultValue: 'https://platform.spacesangels.com' },
            {
              name: 'seedNodes',
              type: 'text',
              hasMany: true,
              defaultValue: ['https://platform.spacesangels.com', 'https://federation.kendev.co'],
              admin: { description: 'Federation seed nodes. A node can contribute/borrow intelligence against any of these without being bound to an endeavor.' },
            },
            { name: 'angelsApiKey', type: 'text' },
            { name: 'boundEndeavor', type: 'text', admin: { description: 'Endeavor slug this node is locked onto.' } },
            { name: 'boundAngelsUrl', type: 'text' },
            { name: 'nodeToken', type: 'text', admin: { readOnly: true } },
            { name: 'nodeTokenExpiresAt', type: 'text', admin: { readOnly: true } },
            { name: 'busChannel', type: 'text', admin: { readOnly: true } },
            { name: 'busSpaceId', type: 'text', admin: { readOnly: true } },
            { name: 'busCursor', type: 'text', admin: { readOnly: true } },
          ],
        },
        {
          label: 'Keys',
          fields: [
            { name: 'anthropicApiKey', type: 'text' },
            { name: 'geminiApiKey', type: 'text' },
            { name: 'ollamaUrl', type: 'text', admin: { description: 'Local Ollama base URL (default http://127.0.0.1:11434).' } },
            { name: 'ollamaModel', type: 'text', admin: { description: 'Preferred model. Use a :cloud tag (e.g. nemotron-3-super:cloud) to run on Ollama\u2019s servers \u2014 needs the token below.' } },
            { name: 'ollamaApiKey', type: 'text', admin: { description: 'Ollama account token (Bearer) \u2014 required for :cloud models.' } },
            { name: 'youtubeChannelId', type: 'text' },
            { name: 'youtubeApiKey', type: 'text' },
            { name: 'youtubeClientId', type: 'text' },
            { name: 'youtubeClientSecret', type: 'text' },
            { name: 'youtubeRefreshToken', type: 'text' },
          ],
        },
        {
          label: 'Media / Watch',
          fields: [
            { name: 'watchedDirs', type: 'json', admin: { description: 'Array of absolute directory paths to watch.' } },
            { name: 'screenshotsDir', type: 'text' },
            { name: 'masterDescription', type: 'textarea' },
            { name: 'cameraDevice', type: 'text' },
          ],
        },
        {
          label: 'Sentinel',
          fields: [
            { name: 'sentinelEnabled', type: 'checkbox', defaultValue: false },
            { name: 'sentinelDevice', type: 'text' },
            { name: 'sentinelWindow', type: 'text' },
            { name: 'sentinelSources', type: 'json', admin: { description: 'Array of "camera:Name" / "window:Title".' } },
            { name: 'sentinelIntervalMs', type: 'number', defaultValue: 5000 },
            { name: 'sentinelThreshold', type: 'number', defaultValue: 0.04 },
            { name: 'boloVisionModel', type: 'text', admin: { description: 'Vision model for BOLO analysis (defaults to ollamaModel or "llava").' } },
          ],
        },
        {
          label: 'Server',
          fields: [
            { name: 'port', type: 'number', defaultValue: 3030 },
            { name: 'tvMode', type: 'checkbox', defaultValue: false },
            { name: 'tunnelUrl', type: 'text', admin: { description: 'Ephemeral public tunnel URL.' } },
          ],
        },
      ],
    },
  ],
}
