/**
 * angels.ts — SpacesAngels / Angel OS bridge
 * Connects to the mothership at spacesangels.com
 */
import { getSettings, appendLog, createIncident } from './store'

export interface AngelsStatus {
  online: boolean
  responseMs?: number
  version?: string
  tenants?: number
  error?: string
  checkedAt: string
}

let lastStatus: AngelsStatus | null = null
let lastCheckAt = 0
const STATUS_TTL_MS = 60 * 1000 // 1 min

export async function checkAngelsStatus(force = false): Promise<AngelsStatus> {
  const now = Date.now()
  if (!force && lastStatus && now - lastCheckAt < STATUS_TTL_MS) return lastStatus

  const s = getSettings()
  const url = `${s.angelsApiUrl}/api/health`
  const start = Date.now()

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: s.angelsApiKey ? { Authorization: `Bearer ${s.angelsApiKey}` } : {},
    })
    const ms = Date.now() - start
    const body = await res.json().catch(() => ({})) as any

    lastStatus = {
      online: res.ok,
      responseMs: ms,
      version: body?.version,
      tenants: body?.tenants,
      checkedAt: new Date().toISOString(),
    }

    if (!res.ok) {
      createIncident({
        severity: 'high',
        status: 'open',
        title: 'Angel OS health check failed',
        description: `HTTP ${res.status} from ${url}`,
        source: 'angels-bridge',
      })
    }
  } catch (err: any) {
    const ms = Date.now() - start
    lastStatus = { online: false, responseMs: ms, error: err.message, checkedAt: new Date().toISOString() }
    createIncident({
      severity: 'critical',
      status: 'open',
      title: 'Angel OS unreachable',
      description: `Connection failed to ${url}: ${err.message}`,
      source: 'angels-bridge',
    })
  }

  lastCheckAt = now
  return lastStatus!
}

export interface LeoMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function askLeo(prompt: string, history: LeoMessage[] = []): Promise<string> {
  const s = getSettings()

  // Try SpacesAngels LEO endpoint first
  if (s.angelsApiKey && s.angelsApiUrl) {
    try {
      const res = await fetch(`${s.angelsApiUrl}/api/ccm/leo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${s.angelsApiKey}`,
        },
        body: JSON.stringify({ message: prompt, history }),
        signal: AbortSignal.timeout(30000),
      })
      if (res.ok) {
        const data = await res.json() as any
        appendLog({ type: 'angels', source: 'leo', message: `LEO query: ${prompt.slice(0, 80)}...` })
        return data.response || data.message || 'LEO responded but no content returned.'
      }
    } catch {}
  }

  // Fallback: direct Anthropic API
  if (s.anthropicApiKey) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': s.anthropicApiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 2048,
          system: 'You are LEO, the AI assistant for Clearwater Cruisin Ministries and Angel OS. You help with video content, YouTube optimization, incident response, and daily operations. Be concise and actionable.',
          messages: [
            ...history.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: prompt },
          ],
        }),
        signal: AbortSignal.timeout(30000),
      })
      const data = await res.json() as any
      appendLog({ type: 'angels', source: 'leo-direct', message: `Direct Anthropic query: ${prompt.slice(0, 80)}...` })
      return data.content?.[0]?.text || 'No response.'
    } catch (err) {
      appendLog({ type: 'error', source: 'leo', message: `LEO query failed: ${err}` })
    }
  }

  return 'LEO unavailable — configure API keys in Settings.'
}

export async function optimizeDescription(description: string): Promise<string> {
  return askLeo(`Review and optimize this YouTube description for SEO and engagement. Keep all links and hashtags. Return only the improved description:\n\n${description}`)
}

export async function generateChapters(srtContent: string): Promise<string> {
  return askLeo(`Analyze this SRT transcript and generate YouTube chapter timestamps in this format:\n0:00 — Chapter title\n\nTranscript:\n${srtContent.slice(0, 8000)}`)
}

export async function suggestHashtags(title: string, description: string): Promise<string> {
  return askLeo(`Suggest 20 highly relevant YouTube hashtags for this video. Return only the hashtags separated by spaces:\nTitle: ${title}\nDescription: ${description.slice(0, 500)}`)
}
