'use client'
import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { RefreshCw, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LogEntry { id: string; timestamp: string; type: string; source: string; message: string; metadata?: any }

const TYPES = ['all', 'incident', 'error', 'file_arrived', 'youtube_update', 'angels', 'system', 'api_call']
const TYPE_DOT: Record<string, string> = {
  incident: 'bg-red-400', error: 'bg-red-400',
  angels: 'bg-emerald-400', file_arrived: 'bg-blue-400',
  youtube_update: 'bg-lcars-lavender', system: 'bg-muted-foreground',
  info: 'bg-lcars-blue', api_call: 'bg-amber-400',
}

export default function LogPage() {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = (t?: string) => {
    const url = t && t !== 'all' ? `/api/log?limit=200&type=${t}` : '/api/log?limit=200'
    fetch(url).then(r => r.json()).then(d => setEntries(d.entries || [])).catch(() => {})
  }

  useEffect(() => { load(filter); const iv = setInterval(() => load(filter), 15000); return () => clearInterval(iv) }, [filter])

  const filtered = search
    ? entries.filter(e => e.message.toLowerCase().includes(search.toLowerCase()) || e.source.toLowerCase().includes(search.toLowerCase()))
    : entries

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-lcars-amber mb-1">
            ── Activity Log · {filtered.length} entries
          </div>
          <h1 className="text-2xl font-mono font-semibold">Officer Log</h1>
        </div>
        <button
          onClick={() => load(filter)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider rounded-md border border-border/60 text-muted-foreground hover:text-foreground transition"
        >
          <RefreshCw className="size-3" /> Refresh
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search log..." className="pl-8" />
        </div>
        <div className="flex gap-1 flex-wrap">
          {TYPES.map(t => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={cn(
                'px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wider rounded-md border transition',
                filter === t
                  ? 'border-lcars-amber/60 bg-lcars-amber/10 text-lcars-amber'
                  : 'border-border/60 text-muted-foreground hover:text-foreground',
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <Card className="p-0 gap-0 overflow-hidden">
        <div className="divide-y divide-border/30">
          {filtered.map(e => (
            <div
              key={e.id}
              onClick={() => setExpanded(expanded === e.id ? null : e.id)}
              className="px-4 py-2 cursor-pointer hover:bg-accent/30 transition"
            >
              <div className="flex items-center gap-3 text-xs">
                <div className={`size-1.5 rounded-full shrink-0 ${TYPE_DOT[e.type] || 'bg-muted-foreground'}`} />
                <span className="text-muted-foreground font-mono shrink-0 w-36">
                  {new Date(e.timestamp).toLocaleString()}
                </span>
                <span className="text-[10px] font-mono uppercase tracking-wider text-lcars-amber/80 shrink-0 w-24 truncate">
                  {e.type}
                </span>
                <span className="text-muted-foreground shrink-0">[{e.source}]</span>
                <span className="text-foreground/90 truncate flex-1">{e.message}</span>
              </div>
              {expanded === e.id && e.metadata && (
                <pre className="mt-2 ml-6 text-[10px] text-muted-foreground bg-background/60 border border-border/40 rounded p-2 overflow-x-auto">
                  {JSON.stringify(e.metadata, null, 2)}
                </pre>
              )}
            </div>
          ))}
          {!filtered.length && (
            <div className="py-16 text-center text-xs text-muted-foreground">No log entries yet.</div>
          )}
        </div>
      </Card>
    </div>
  )
}
