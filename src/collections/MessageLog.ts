import type { CollectionConfig } from 'payload'

/**
 * MessageLog — Merlin's LOCAL triaging message log (the "battle computer" record).
 *
 * Every local signal Merlin perceives (sentinel deltas, snapshots, node events)
 * is logged here FIRST, with the triage verdict (score/reason) and whether it was
 * GRADUATED up the chain to Core. This is the Payload(SQLite)-backed LogStore for
 * the shared `@angel-os/brain` MessageLog primitive — the field shape mirrors the
 * Brain's LogEntry so the adapter is a thin map, and it gives Merlin a real local
 * admin view of "what did I see, what did I decide, did it go up?".
 *
 * @see @angel-os/brain MessageLog / LogEntry
 * @see src/lib/messageLog.ts (the LogStore + Submitter adapter)
 */
export const MessageLog: CollectionConfig = {
  slug: 'message-log',
  admin: {
    useAsTitle: 'type',
    defaultColumns: ['type', 'status', 'score', 'source', 'createdAt'],
    group: 'Brain',
  },
  // The log is a local record; reads are open to logged-in admins, writes happen
  // through the brain adapter (overrideAccess) — keep the admin UI read-leaning.
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'signalId',
      type: 'text',
      index: true,
      unique: true,
      admin: { description: 'Stable id from the Brain (dedupe key).' },
    },
    {
      name: 'type',
      type: 'text',
      required: true,
      index: true,
      admin: { description: 'Signal type, e.g. "screen.delta" | "snapshot.captured".' },
    },
    {
      name: 'source',
      type: 'text',
      required: true,
      admin: { description: 'Emitting body — "merlin".' },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'held',
      index: true,
      options: [
        { label: 'Held (logged, below budget)', value: 'held' },
        { label: 'Pending (about to graduate)', value: 'pending' },
        { label: 'Submitted (graduated up)', value: 'submitted' },
        { label: 'Failed (graduate failed)', value: 'failed' },
      ],
    },
    {
      name: 'score',
      type: 'number',
      admin: { description: 'Triage score (0..1+).' },
    },
    {
      name: 'reason',
      type: 'text',
      admin: { description: 'Why triage held or graduated it.' },
    },
    {
      name: 'submittedRef',
      type: 'text',
      admin: { description: 'Ref returned by the chain on success (Core msg id/url).' },
    },
    {
      name: 'error',
      type: 'text',
      admin: { description: 'Failure detail (for retry/observability).' },
    },
    {
      name: 'payload',
      type: 'json',
      admin: { description: 'The signal body (opaque).' },
    },
  ],
}
