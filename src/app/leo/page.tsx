'use client'
import { useEffect, useRef, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Send, Sparkles, Radio, Hash, Clock, FileText, Wand2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Msg { role: 'user' | 'assistant'; content: string }

const MODES = [
  { key: 'chat', label: 'Chat', icon: Sparkles, hint: 'Talk to LEO' },
  { key: 'bus', label: 'Comm Stream', icon: Radio, hint: 'Watch the node bus' },
  { key: 'chapters', label: 'Chapters', icon: Clock, hint: 'Generate from SRT' },
  { key: 'hashtags', label: 'Hashtags', icon: Hash, hint: 'From title + description' },
  { key: 'optimize', label: 'Optimize', icon: Wand2, hint: 'Improve description' },
] as const

type Mode = typeof MODES[number]['key']

export default function LeoPage() {
  const [status, setStatus] = useState<any>(null)
  const [mode, setMode] = useState<Mode>('chat')
  const [input, setInput] = useState('')
  const [srtContent, setSrtContent] = useState('')
  const [descContent, setDescContent] = useState('')
  const [messages, setMessages] = useState<Msg[]>([])
  const [loading, setLoading] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/angels/status').then(r => r.json()).then(setStatus).catch(() => {})
  }, [])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const send = async () => {
    if (loading) return
    if (mode === 'chat' && !input.trim()) return

    const userMsg = input || (mode === 'chapters' ? '[SRT content attached]' : mode === 'optimize' ? '[Description attached]' : '[Title attached]')
    setMessages(m => [...m, { role: 'user', content: userMsg }])
    setInput('')
    setLoading(true)

    const body: any = { action: mode }
    if (mode === 'chat') { body.prompt = userMsg; body.history = messages.slice(-10) }
    if (mode === 'chapters') body.srtContent = srtContent
    if (mode === 'hashtags') { body.title = userMsg; body.description = descContent }
    if (mode === 'optimize') body.description = descContent

    try {
      const res = await fetch('/api/angels/leo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(r => r.json())
      setMessages(m => [...m, { role: 'assistant', content: res.response || res.error || '(empty)' }])
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: '⚠ Unable to reach LEO. Working from local cache.' }])
    }
    setLoading(false)
  }

  return (
    <div className="space-y-4 h-[calc(100vh-8rem)] flex flex-col">
      {/* Header strip */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-lcars-amber mb-1">
            ── LEO · Constitutional AI · Claude + Multi-model
          </div>
          <h1 className="text-2xl font-mono font-semibold">Angel Assistant</h1>
        </div>
        <Badge variant={status?.online ? 'online' : 'warning'}>
          <Radio className="size-2.5" />
          {status?.online ? `Bridge ${status.responseMs}ms` : 'Local fallback'}
        </Badge>
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
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="size-14 rounded-full bg-lcars-amber/10 flex items-center justify-center mb-3">
                <Sparkles className="size-6 text-lcars-amber" />
              </div>
              <div className="text-sm font-mono uppercase tracking-wider text-foreground">LEO Standing By</div>
              <div className="text-xs text-muted-foreground mt-2 max-w-md">
                SRT cleanup · Chapters · Hashtags · Description optimization · Incident analysis
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={cn(
                'max-w-[80%] px-4 py-2.5 rounded-xl text-sm whitespace-pre-wrap',
                m.role === 'user'
                  ? 'bg-lcars-amber/15 border border-lcars-amber/30 text-foreground'
                  : 'bg-card/60 border border-border/60 text-foreground/90',
              )}>
                {m.content}
              </div>
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
                mode === 'chat' ? 'Ask LEO anything...' :
                mode === 'hashtags' ? 'Video title...' :
                'Click send to process attached content'
              }
              className="flex-1 text-white placeholder:text-white/45"
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
