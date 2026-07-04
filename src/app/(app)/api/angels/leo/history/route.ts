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

/** Map stored provider-neutral turns → display bubbles (drop tool turns + empty text). */
function toDisplay(messages: StoredMessage[]): DisplayMsg[] {
  const out: DisplayMsg[] = []
  for (const m of messages) {
    if (m.role === 'user') {
      if (m.text?.trim()) out.push({ role: 'user', content: m.text, at: m.at })
    } else if (m.role === 'assistant') {
      // Local store = this node's on-box brain, so tag historical replies accordingly.
      if (m.text?.trim()) out.push({ role: 'assistant', content: m.text, at: m.at, brain: 'local' })
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
