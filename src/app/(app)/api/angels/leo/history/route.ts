/**
 * GET /api/angels/leo/history — replay the on-box LEO conversation.
 *
 * Reads the local chat store (data/leo/<conversationId>.json) and returns the
 * DISPLAYABLE turns (human + assistant text), skipping the tool plumbing turns the
 * brain persists for verbatim replay. Powers the /leo page's Spaces-style transcript:
 * last-N on mount, page-up for older, decaying poll for new.
 *
 * Cursors are INDICES into the display array, not timestamps — one runAgent turn
 * stamps all its messages with the same millisecond, so a timestamp cursor would
 * split or drop a turn. The store is append-only, so an index is stable across polls.
 *
 *   ?conversationId=default            (defaults to 'default')
 *   &limit=10                          window size (initial + page-up)
 *   &beforeIndex=<n>                   page-up: the window ending just before n
 *   &since=<n>                         poll/reconcile: everything at index >= n
 */
import { NextRequest, NextResponse } from 'next/server'
import { loadConversation, type StoredMessage } from '@/lib/leoChats'

export const dynamic = 'force-dynamic'

type DisplayMsg = { role: 'user' | 'assistant'; content: string; at: string; brain?: 'local' }

/**
 * Strip machine plumbing from a turn's text so the chat shows prose, not payloads:
 *  - the `@@ANGELS_RESULT@@:<id>:<json>` sentinel a node embeds for structured
 *    skill results (the file browser greps it out separately — it must never render)
 *  - the trailing `_(request <id>)_` correlation marker
 */
function cleanText(text: string): string {
  let s = text
  const sentinel = s.indexOf('@@ANGELS_RESULT@@')
  if (sentinel >= 0) s = s.slice(0, sentinel)
  s = s.replace(/\n*_\(request [^)]*\)_\s*$/i, '')
  return s.trim()
}

/** Map stored provider-neutral turns → display bubbles (drop tool turns + empty text). */
function toDisplay(messages: StoredMessage[]): DisplayMsg[] {
  const out: DisplayMsg[] = []
  for (const m of messages) {
    if (m.role === 'user') {
      const t = cleanText(m.text || '')
      if (t) out.push({ role: 'user', content: t, at: m.at })
    } else if (m.role === 'assistant') {
      // Local store = this node's on-box brain, so tag historical replies accordingly.
      const t = cleanText(m.text || '')
      if (t) out.push({ role: 'assistant', content: t, at: m.at, brain: 'local' })
    }
    // role === 'tool' → tool_result plumbing; never shown.
  }
  return out
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const conversationId = url.searchParams.get('conversationId') || 'default'
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 10, 1), 100)
  const beforeRaw = url.searchParams.get('beforeIndex')
  const sinceRaw = url.searchParams.get('since')

  try {
    const all = toDisplay(loadConversation(conversationId).messages)
    const total = all.length

    // Poll / reconcile: everything at or after the cursor (chronological).
    if (sinceRaw != null) {
      const since = Math.min(Math.max(Number(sinceRaw) || 0, 0), total)
      return NextResponse.json({ ok: true, conversationId, messages: all.slice(since), total, firstIndex: since, hasMore: false })
    }

    // Page-up (beforeIndex) or initial (last `limit`). Both returned chronological.
    const end = beforeRaw != null ? Math.min(Math.max(Number(beforeRaw) || 0, 0), total) : total
    const start = Math.max(0, end - limit)
    return NextResponse.json({
      ok: true,
      conversationId,
      messages: all.slice(start, end),
      total,
      firstIndex: start,
      hasMore: start > 0,
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e), messages: [], total: 0, firstIndex: 0, hasMore: false },
      { status: 500 },
    )
  }
}
