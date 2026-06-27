import type { CollectionConfig } from 'payload'

/**
 * Files — Merlin's local file registry (was file-registry.json). Tracks media
 * files the watcher detects on disk, their category/status, and any YouTube link.
 */
export const Files: CollectionConfig = {
  slug: 'files',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'category', 'status', 'size', 'detectedAt'],
    group: 'Node',
  },
  access: { read: () => true },
  fields: [
    { name: 'path', type: 'text', required: true, unique: true, index: true },
    { name: 'name', type: 'text', required: true },
    { name: 'ext', type: 'text' },
    {
      name: 'category',
      type: 'select',
      defaultValue: 'other',
      options: ['video', 'image', 'srt', 'document', 'audio', 'other'],
    },
    { name: 'size', type: 'number' },
    { name: 'detectedAt', type: 'date' },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'new',
      index: true,
      options: ['new', 'reviewed', 'archived', 'linked'],
    },
    { name: 'youtubeId', type: 'text' },
    { name: 'notes', type: 'textarea' },
  ],
}
