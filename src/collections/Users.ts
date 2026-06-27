import type { CollectionConfig } from 'payload'

/**
 * Users — Merlin's LOCAL admin accounts (auth-enabled), so the embedded Payload
 * admin at /admin has a login. This is intentionally minimal and SEPARATE from
 * Core's Users: a Merlin node is operated locally by whoever runs the machine.
 * It is NOT the federation identity (that lives in Core, reached via node tokens).
 */
export const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  admin: {
    useAsTitle: 'email',
    group: 'System',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
    },
  ],
}
