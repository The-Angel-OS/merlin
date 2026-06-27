import type { CollectionConfig } from 'payload'

/**
 * Incidents — node incident log (was incidents.json). Severity + lifecycle for
 * issues the node detects (e.g. angels connectivity failures).
 */
export const Incidents: CollectionConfig = {
  slug: 'incidents',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'severity', 'status', 'source', 'createdAt'],
    group: 'Node',
  },
  access: { read: () => true },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'description', type: 'textarea' },
    { name: 'source', type: 'text', index: true },
    {
      name: 'severity',
      type: 'select',
      defaultValue: 'low',
      index: true,
      options: ['low', 'medium', 'high', 'critical'],
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'open',
      index: true,
      options: ['open', 'investigating', 'resolved'],
    },
    { name: 'resolvedAt', type: 'date' },
    { name: 'notes', type: 'textarea' },
  ],
}
