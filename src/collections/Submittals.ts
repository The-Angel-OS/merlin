import type { CollectionConfig } from 'payload'

/**
 * Submittals — record of camera/window snapshots this node pushed UP to the bound
 * endeavor's Media (was submittals.json). Powers Merlin's Screenshots tab. URLs
 * are relative to the bound endeavor (boundAngelsUrl).
 */
export const Submittals: CollectionConfig = {
  slug: 'submittals',
  admin: {
    useAsTitle: 'filename',
    defaultColumns: ['filename', 'source', 'endeavor', 'createdAt'],
    group: 'Node',
  },
  access: { read: () => true },
  fields: [
    { name: 'filename', type: 'text', required: true },
    { name: 'url', type: 'text', required: true, admin: { description: 'Core media URL (relative to the bound endeavor).' } },
    { name: 'source', type: 'text', admin: { description: 'e.g. "OBS Virtual Camera" or "window:Phone Link".' } },
    { name: 'endeavor', type: 'text', index: true },
    { name: 'at', type: 'date', admin: { description: 'Original submit timestamp (preserved on import).' } },
  ],
}
