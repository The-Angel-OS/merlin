import path from 'path'
import { fileURLToPath } from 'url'

import { buildConfig } from 'payload'
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { MessageLog } from './collections/MessageLog'
import { ActivityLog } from './collections/ActivityLog'
import { Submittals } from './collections/Submittals'
import { Files } from './collections/Files'
import { Incidents } from './collections/Incidents'
import { Cameras } from './collections/Cameras'
import { NodeSettings } from './globals/NodeSettings'
import { LiveKitGlobal } from './globals/LiveKitGlobal'
import { YouTubeCache } from './globals/YouTubeCache'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

/**
 * Merlin's EMBEDDED Payload CMS — local admin + local collections on SQLite.
 *
 * This is the node-local CMS: it gives Merlin a real /admin panel and a
 * MessageLog collection (the Payload-backed LogStore for @angel-os/brain), with
 * message/collection formats that mirror Core's schema so Merlin↔Core speak the
 * same shape. It is deliberately minimal — Core remains the federation source of
 * truth; this is the local node's own brain record + admin.
 *
 * DB: SQLite file under ./data (alongside Merlin's existing JSON stores), via
 * better-sqlite3 (already a Merlin dep, compiled).
 */
export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, MessageLog, ActivityLog, Submittals, Files, Incidents, Cameras],
  globals: [NodeSettings, LiveKitGlobal, YouTubeCache],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || 'merlin-local-dev-secret-change-me',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: sqliteAdapter({
    client: {
      url: process.env.PAYLOAD_DATABASE_URI || `file:${path.resolve(dirname, '../data/merlin.db')}`,
    },
  }),
  sharp,
})
