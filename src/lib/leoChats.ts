/**
 * leoChats.ts — local chat history for the on-box LEO agent.
 * Zero native deps (matches store.ts): one JSON file per conversation in data/leo/.
 * Stores Anthropic-shaped content blocks so the loop can replay tool turns verbatim.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'fs'
import { join } from 'path'
import type { NeutralMsg } from './leoProviders'

const DIR = join(process.cwd(), 'data', 'leo')
if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true })

// Stored in the provider-neutral format so history replays on ANY provider.
export type StoredMessage = NeutralMsg & { at: string }

export type Conversation = {
  id: string
  createdAt: string
  updatedAt: string
  messages: StoredMessage[]
}

function file(id: string) {
  // keep ids filesystem-safe
  return join(DIR, `${id.replace(/[^a-z0-9_-]/gi, '_')}.json`)
}

export function loadConversation(id: string): Conversation {
  try {
    if (existsSync(file(id))) return JSON.parse(readFileSync(file(id), 'utf-8')) as Conversation
  } catch {
    /* corrupt/missing → fresh */
  }
  const now = new Date().toISOString()
  return { id, createdAt: now, updatedAt: now, messages: [] }
}

export function saveConversation(c: Conversation): void {
  c.updatedAt = new Date().toISOString()
  writeFileSync(file(c.id) + '.tmp', JSON.stringify(c, null, 2), 'utf-8')
  renameSync(file(c.id) + '.tmp', file(c.id))
}
