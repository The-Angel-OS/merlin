'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Send, Sparkles, Radio, Hash, Clock, FileText, Wand2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Msg { role: 'user' | 'assistant'; content: string; provider?: string; model?: string; brain?: 'local' | 'remote'; at?: string }

const CONVERSATION_ID = 'default'

type Brain = 'local' | 'remote'

const MODES = [
  { key: 'chat', label: 'Chat', icon: Sparkles, hint: 'Talk to LEO' },
  { key: 'bus', label: 'Comm Stream', icon: Radio, hint: 'Watch the node bus' },
  { key: 'chapters', label: 'Chapters', icon: Clock, hint: 'Generate from SRT' },
  { key: 'hashtags', label: 'Hashtags', icon: Hash, hint: 'From title + description' },
  { key: 'optimize', label: 'Optimize', icon: Wand2, hint: 'Improve description' },
] as const

type Mode = typeof MODES[number]['key']

export default function LeoPage() {
  const [status, setStatus] = useState<{ online: boolean; responseMs?: number; lockedOn?: boolean } | null>(null)
  const [mode, setMode] = useState<Mode>('chat')
  const [brain, setBrain] = useState<Brain>('local')
  const [input, setInput] = useState('')
  const [srtContent, setSrtContent] = useState('')
  const [descContent, setDescContent] = useState('')
  const [messages, setMessages] = useState<Msg[]>([])
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  // Index cursors into the server's DISPLAY array (append-only → stable across polls):
  //   firstIndexRef = index of the oldest turn we hold (page-up cursor)
  //   seenCountRef  = display turns we've incorporated (poll `since` cursor)
  const firstIndexRef = useRef(0)
  const seenCountRef = useRef(0)
  const loadingRef = useRef(false)
  const loadingMoreRef = useRef(false) // synchronous reentrancy guard (state lags a tick)
  useEffect(() => { loadingRef.current = loading }, [loading])

  const nearBottom = () => {
    const el = scrollRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120
  }
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') =>
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior }))

  // Status strip.
  useEffect(() => {
    Promise.all([
      fetch('/api/angels/status').then(r => r.json()),
      fetch('/api/system').then(r => r.json()),
    ]).then(([angelsStatus, sys]) => {
      setStatus({ ...angelsStatus, lockedOn: sys?.binding?.lockedOn ?? false })
    }).catch(() => {})
  }, [])

  // ── Initial window: the last N turns of this node's on-box conversation ──
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const r = await fetch(`/api/angels/leo/history?conversationId=${CONVERSATION_ID}&limit=10`).then(x => x.json())
        if (!alive || !r?.ok) return
        setMessages((r.messages as Msg[]) || [])
        firstIndexRef.current = r.firstIndex ?? 0
        seenCountRef.current = r.total ?? (r.messages?.length ?? 0)
        setHasMore(Boolean(r.hasMore))
        scrollToBottom('auto')
      } catch { /* transient — the poll will catch up */ }
    })()
    return () => { alive = false }
  }, [])

  // ── Page-up: prepend older turns, holding the viewport on the same message ──
  const loadOlder = useCallback(async () => {
    // Ref guard, not the state flag: rapid scroll events fire this several times in
    // one tick, before setLoadingMore(true) commits — that double-prepends the window.
    if (loadingMoreRef.current || loadingRef.current || !hasMore) return
    loadingMoreRef.current = true
    const el = scrollRef.current
    const prevHeight = el?.scrollHeight ?? 0
    setLoadingMore(true)
    try {
      const r = await fetch(
        `/api/angels/leo/history?conversationId=${CONVERSATION_ID}&limit=20&beforeIndex=${firstIndexRef.current}`,
      ).then(x => x.json())
      if (r?.ok && Array.isArray(r.messages) && r.messages.length) {
        setMessages(prev => [...(r.messages as Msg[]), ...prev])
        firstIndexRef.current = r.firstIndex ?? 0
        setHasMore(Boolean(r.hasMore))
        requestAnimationFrame(() => { if (el) el.scrollTop += el.scrollHeight - prevHeight })
      } else {
        setHasMore(false)
      }
    } catch { /* leave hasMore set; the user can trigger again */ }
    setLoadingMore(false)
    loadingMoreRef.current = false
  }, [hasMore])

  const onScroll = () => {
    const el = scrollRef.current
    if (el && el.scrollTop < 80) void loadOlder()
  }

  // ── Live append: poll for turns persisted since we last looked (decaying 3s→30s) ──
  useEffect(() => {
    let alive = true
    let delay = 3000
    let timer: ReturnType<typeof setTimeout>
    const tick = async () => {
      // Don't fight an in-flight send — it reconciles its own authoritative turns.
      if (!loadingRef.current) {
        try {
          const r = await fetch(
            `/api/angels/leo/history?conversationId=${CONVERSATION_ID}&since=${seenCountRef.current}`,
          ).then(x => x.json())
          if (alive && r?.ok && Array.isArray(r.messages) && r.messages.length) {
            const stick = nearBottom()
            setMessages(prev => [...prev, ...(r.messages as Msg[])])
            seenCountRef.current = r.total ?? seenCountRef.current
            delay = 3000
            if (stick) scrollToBottom()
          }
        } catch { /* transient */ }
      }
      if (alive) { delay = Math.min(delay * 1.5, 30000); timer = setTimeout(tick, delay) }
    }
    timer = setTimeout(tick, delay)
    return () => { alive = false; clearTimeout(timer) }
  }, [])

  const send = async () => {
    if (loading) return
    if (mode === 'chat' && !input.trim()) return

    const userMsg = input || (mode === 'chapters' ? '[SRT content attached]' : mode === 'optimize' ? '[Description attached]' : '[Title attached]')
    // Optimistic user bubble for instant feedback; reconciled from the store after.
    const baseLen = messages.length
    const baseSeen = seenCountRef.current
    setMessages(m => [...m, { role: 'user', content: userMsg }])
    setInput('')
    setLoading(true)
    scrollToBottom()

    const body: any = { action: mode }
    if (mode === 'chat') { body.prompt = userMsg; body.history = messages.slice(-10); body.brain = brain; body.conversationId = CONVERSATION_ID }
    if (mode === 'chapters') body.srtContent = srtContent
    if (mode === 'hashtags') { body.title = userMsg; body.description = descContent }
    if (mode === 'optimize') body.description = descContent

    try {
      const res = await fetch('/api/angels/leo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(r => r.json())

      if (mode === 'chat' && res.brain === 'local') {
        // The on-box brain persisted this turn — replace the optimistic bubble with
        // the authoritative user + assistant turns from the store (exact, no dupes).
        let reconciled = false
        try {
          const h = await fetch(`/api/angels/leo/history?conversationId=${CONVERSATION_ID}&since=${baseSeen}`).then(r => r.json())
          if (h?.ok && Array.isArray(h.messages) && h.messages.length) {
            setMessages(prev => [...prev.slice(0, baseLen), ...(h.messages as Msg[])])
            seenCountRef.current = h.total ?? (baseSeen + h.messages.length)
            reconciled = true
          }
        } catch { /* fall back to the direct response below */ }
        if (!reconciled) {
          setMessages(m => [...m, { role: 'assistant', content: res.response || '(empty)', provider: res.provider, model: res.model, brain: res.brain }])
        }
      } else {
        // Remote LEO / utility modes aren't persisted to the local store — just append.
        setMessages(m => [...m, { role: 'assistant', content: res.response || res.error || '(empty)', provider: res.provider, model: res.model, brain: res.brain }])
      }
      scrollToBottom()
    } catch {
      const failMsg = brain === 'local'
        ? "⚠ Merlin's on-box brain didn't respond — is Ollama running on this node? Working from local cache."
        : '⚠ Couldn\'t reach LEO on Core. Check the endeavor lock-on, or switch to Merlin (on-box) to keep working offline.'
      setMessages(m => [...m, { role: 'assistant', content: failMsg }])
    }
    setLoading(false)
  }

  return (
    <div className="space-y-4 h-[calc(100vh-8rem)] flex flex-col">
      {/* Header strip */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-lcars-amber mb-1">
            ── {brain === 'local' ? 'MERLIN · On-box brain · Ollama / Multi-model' : 'LEO · Core bridge · Claude + Multi-model'}
          </div>
          <h1 className="text-2xl font-mono font-semibold">{brain === 'local' ? 'Talk to Merlin' : 'Talk to Leo'}</h1>
        </div>
        <div className="flex items-center gap-2">
          {/* Brain selector — WHO you're talking to. Merlin = this node's on-box
              brain (local Ollama, works offline). LEO = the enterprise brain on Core
              (needs a lock-on). Kept always-clickable: tapping LEO while unbound
              explains how to enable it rather than sitting there dead. */}
          <div className="flex rounded-md border border-border overflow-hidden text-[10px] font-mono uppercase tracking-wider">
            <button
              onClick={() => setBrain('local')}
              title="Merlin — this node's on-box brain (local Ollama, works offline)"
              className={cn('px-2.5 py-1.5 transition', brain === 'local' ? 'bg-lcars-green/25 text-lcars-green font-semibold' : 'text-muted-foreground hover:text-foreground')}
            >
              Merlin · on-box
            </button>
            <button
              onClick={() => {
                if (!status?.lockedOn) {
                  setMessages(m => [...m, { role: 'assistant', content: '⚑ Enterprise LEO needs a lock-on. Open CONNECT → Federation to lock this node onto an Endeavor — then LEO (on Core) becomes reachable from here. Until then you\'re talking to Merlin\'s on-box brain.' }])
                  return
                }
                setBrain('remote')
              }}
              title={status?.lockedOn ? 'LEO — the enterprise brain on Core (Claude + full tools + endeavor context)' : 'Lock onto an Endeavor first (Connect → Federation)'}
              className={cn('px-2.5 py-1.5 transition border-l border-border', brain === 'remote' ? 'bg-lcars-amber/25 text-lcars-amber font-semibold' : 'text-muted-foreground hover:text-foreground', !status?.lockedOn && 'opacity-70')}
            >
              LEO · enterprise{status?.lockedOn ? '' : ' 🔒'}
            </button>
          </div>
          <Badge variant={brain === 'local' ? 'online' : status?.online ? 'online' : 'warning'}>
            <Radio className="size-2.5" />
            {brain === 'local' ? 'On-box' : status?.online ? `Bridge ${status.responseMs}ms` : status?.lockedOn ? 'Bridge unreachable' : 'Not bound'}
          </Badge>
        </div>
      </div>

      {/* Mode pills */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none shrink-0">
        {MODES.map(m => {
          const Icon = m.icon
          const active = mode === m.key
          return (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-[11px] font-mono uppercase tracking-wider transition whitespace-nowrap',
                active
                  ? 'border-lcars-amber/60 bg-lcars-amber/10 text-lcars-amber'
                  : 'border-border/60 text-muted-foreground hover:text-foreground hover:border-border',
              )}
            >
              <Icon className="size-3" />
              {m.label}
            </button>
          )
        })}
      </div>

      {/* Context inputs */}
      {mode === 'chapters' && (
        <Textarea
          value={srtContent}
          onChange={e => setSrtContent(e.target.value)}
          placeholder="Paste SRT content..."
          rows={4}
          className="shrink-0 text-xs font-mono"
        />
      )}
      {(mode === 'optimize' || mode === 'hashtags') && (
        <Textarea
          value={descContent}
          onChange={e => setDescContent(e.target.value)}
          placeholder={mode === 'hashtags' ? 'Paste description for context...' : 'Paste description to optimize...'}
          rows={4}
          className="shrink-0 text-xs font-mono"
        />
      )}

      {/* Comm Stream — watch the node-bus channel (commands in / results out) */}
      {mode === 'bus' && <CommStream />}

      {/* Chat transcript */}
      {mode !== 'bus' && (
      <Card className="flex-1 p-0 gap-0 overflow-hidden flex flex-col">
        <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto p-4 space-y-3">
          {loadingMore && (
            <div className="py-1 text-center text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Loading earlier…
            </div>
          )}
          {messages.length === 0 && !loadingMore && (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="size-14 rounded-full bg-lcars-amber/10 flex items-center justify-center mb-3">
                <Sparkles className="size-6 text-lcars-amber" />
              </div>
              <div className="text-sm font-mono uppercase tracking-wider text-foreground">{brain === 'local' ? 'Merlin Standing By · on-box' : 'LEO Standing By · enterprise'}</div>
              <div className="text-xs text-muted-foreground mt-2 max-w-md">
                {brain === 'local'
                  ? "This node's own brain (local Ollama) — works offline. SRT cleanup · Chapters · Hashtags · Optimize · Incident analysis."
                  : 'LEO on Core — full tools + endeavor context. Talk to the enterprise, not just this box.'}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={cn('flex flex-col', m.role === 'user' ? 'items-end' : 'items-start')}>
              <div className={cn(
                'max-w-[80%] px-4 py-2.5 rounded-xl text-sm whitespace-pre-wrap',
                m.role === 'user'
                  ? 'bg-lcars-amber/15 border border-lcars-amber/30 text-foreground'
                  : 'bg-card/60 border border-border/60 text-foreground/90',
              )}>
                {m.content}
              </div>
              {m.role === 'assistant' && (m.provider || m.brain) && (
                <div className="mt-1 px-1 text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
                  {m.brain === 'remote' ? 'LEO · Core' : 'Merlin · on-box'}{m.provider ? ` · ${m.provider}` : ''}{m.model ? ` · ${m.model}` : ''}
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-card/60 border border-border/60 rounded-xl px-4 py-3">
                <div className="flex gap-1">
                  <span className="size-1.5 rounded-full bg-lcars-amber animate-pulse" />
                  <span className="size-1.5 rounded-full bg-lcars-amber animate-pulse [animation-delay:150ms]" />
                  <span className="size-1.5 rounded-full bg-lcars-amber animate-pulse [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Input bar */}
        <div className="border-t border-border/60 p-3">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
              placeholder={
                mode === 'chat' ? (brain === 'local' ? 'Ask Merlin (on-box)…' : 'Ask LEO on Core…') :
                mode === 'hashtags' ? 'Video title...' :
                'Click send to process attached content'
              }
              className="flex-1"
            />
            <Button onClick={send} disabled={loading} size="icon" variant="lcars">
              <Send className="size-4" />
            </Button>
          </div>
        </div>
      </Card>
      )}
    </div>
  )
}

// ─── Comm Stream ─────────────────────────────────────────────────────────────

interface StreamMsg { id: number | string; kind: string; tool?: string; requestId?: string; text: string; author?: string; createdAt?: string }
interface StreamResp { ok: boolean; bound: boolean; channel?: string; messages: StreamMsg[]; error?: string }

/**
 * CommStream — live view of this node's bus channel: LEO's commands flowing in and
 * the node's results flowing back. The visible byproduct of the channel dynamics.
 */
function CommStream() {
  const [data, setData] = useState<StreamResp | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    const tick = () => {
      fetch('/api/node/stream')
        .then(r => r.json())
        .then((d: StreamResp) => { if (alive) setData(d) })
        .catch(() => {})
    }
    tick()
    const id = setInterval(tick, 4000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [data?.messages.length])

  const messages = data?.messages ?? []

  return (
    <Card className="flex-1 p-0 gap-0 overflow-hidden flex flex-col">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5 shrink-0">
        <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-lcars-amber">
          <Radio className="size-3.5" />
          Node Bus
          {data?.channel ? <span className="text-muted-foreground normal-case tracking-normal">#{data.channel}</span> : null}
        </div>
        <span className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
          <span className="size-1.5 rounded-full bg-lcars-green animate-pulse" /> live · 4s
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {!data ? (
          <div className="text-xs text-muted-foreground font-mono">Connecting to bus…</div>
        ) : !data.bound ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <Radio className="size-6 text-muted-foreground mb-2" />
            <div className="text-sm font-mono text-foreground">No endeavor locked on</div>
            <div className="text-xs text-muted-foreground mt-1 max-w-sm">
              Lock this node onto an Endeavor (Federation → Connect) to open its bus channel.
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-xs text-muted-foreground font-mono">
            Channel open — no traffic yet. Ask LEO to “list files matching X” on this node.
          </div>
        ) : (
          messages.map(m => {
            const isCommand = m.kind === 'node-command'
            const isResult = m.kind === 'node-result'
            const dir = isCommand ? 'LEO → node' : isResult ? 'node → LEO' : m.kind
            const color = isCommand ? '#f5a623' : isResult ? '#22cc88' : '#7788aa'
            return (
              <div key={m.id} className={cn('flex', isResult ? 'justify-end' : 'justify-start')}>
                <div className="max-w-[85%] rounded-lg border px-3 py-2" style={{ borderColor: `${color}44`, background: `${color}0d` }}>
                  <div className="mb-1 flex items-center gap-2 text-[9px] font-mono uppercase tracking-widest" style={{ color }}>
                    <span>{dir}</span>
                    {m.tool ? <span className="text-muted-foreground">· {m.tool}</span> : null}
                    {m.createdAt ? <span className="text-muted-foreground/60">· {new Date(m.createdAt).toLocaleTimeString()}</span> : null}
                  </div>
                  <div className="whitespace-pre-wrap text-xs text-foreground/90">{m.text || '(no text)'}</div>
                </div>
              </div>
            )
          })
        )}
        {data?.error ? (
          <div className="text-[10px] font-mono" style={{ color: '#cc4444' }}>stream error: {data.error}</div>
        ) : null}
        <div ref={endRef} />
      </div>
    </Card>
  )
}
