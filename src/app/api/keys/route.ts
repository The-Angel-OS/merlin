import { NextRequest, NextResponse } from 'next/server'
import { getSettings, updateSettings } from '@/lib/store'
import { appendLog } from '@/lib/store'

// Mask a value for display
function mask(val: string): string {
  if (!val) return ''
  if (val.length <= 8) return '••••••••'
  return val.slice(0, 4) + '••••••••' + val.slice(-4)
}

// Keys that should be masked in GET response
const SENSITIVE_KEYS = [
  'youtubeApiKey', 'youtubeClientSecret', 'youtubeRefreshToken',
  'angelsApiKey', 'anthropicApiKey',
]

export async function GET() {
  const settings = getSettings()
  const safe: Record<string, any> = { ...settings }
  for (const key of SENSITIVE_KEYS) {
    if (safe[key]) safe[key] = mask(safe[key] as string)
  }
  // Indicate which keys are configured
  const configured: Record<string, boolean> = {}
  for (const key of SENSITIVE_KEYS) {
    configured[key] = !!((settings as any)[key])
  }
  return NextResponse.json({ settings: safe, configured })
}

export async function POST(req: NextRequest) {
  const updates = await req.json() as Record<string, string>

  // Only allow updating specific known settings keys
  const allowed = new Set([
    'youtubeChannelId', 'youtubeApiKey', 'youtubeClientId', 'youtubeClientSecret',
    'youtubeRefreshToken', 'angelsApiUrl', 'angelsApiKey', 'anthropicApiKey',
    'watchedDirs', 'screenshotsDir', 'port',
  ])

  const filtered: Record<string, any> = {}
  for (const [k, v] of Object.entries(updates)) {
    if (allowed.has(k)) filtered[k] = v
  }

  if (Object.keys(filtered).length === 0) {
    return NextResponse.json({ error: 'No valid keys to update' }, { status: 400 })
  }

  updateSettings(filtered)
  appendLog({ type: 'system', source: 'keys', message: `Settings updated: ${Object.keys(filtered).join(', ')}` })
  return NextResponse.json({ success: true, updated: Object.keys(filtered) })
}
