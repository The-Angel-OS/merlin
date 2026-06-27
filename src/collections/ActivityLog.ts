import type { CollectionConfig } from 'payload'

/**
 * ActivityLog — Merlin's node activity feed (was activity-log.json in store.ts).
 * Powers the Node Log / Recent Activity UI. Append-only in practice; capped by a
 * periodic prune rather than a hard ring buffer.
 */
export const ActivityLog: CollectionConfig = {
  slug: 'activity-log',
  admin: {
    useAsTitle: 'message',
    defaultColumns: ['type', 'source', 'message', 'createdAt'],
    group: 'Node',
  },
  access: { read: () => true },
  fields: [
    {
      name: 'type',
      type: 'select',
      required: true,
      index: true,
      defaultValue: 'info',
      options: [
        'file_arrived',
        'youtube_update',
        'api_call',
        'incident',
        'system',
        'error',
        'angels',
        'info',
      ],
    },
    { name: 'source', type: 'text', required: true, index: true },
    { name: 'message', type: 'text', required: true },
    { name: 'metadata', type: 'json' },
  ],
}
