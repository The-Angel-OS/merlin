'use client'
import { useCallback, useEffect, useState } from 'react'
import { Eye, Play, Square, Camera, MonitorSmartphone, RefreshCw } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getSentinelData, startSentinelAction, stopSentinelAction, type SentinelConfig } from './actions'

type Submittal = { at: string; filename: string; url: string; source: string; endeavor: string }
type Status = {
  running: boolean
  enabled: boolean
  source: string
  device: string
  window: string
  intervalMs: number
  threshold: number
  last: { at: string; changed: boolean; diff: number; url?: string } | null
}

export default function SentinelPage() {
  const [cameras, setCameras] = useState<string[]>([])
  const [windows, setWindows] = useState<string[]>([])
  const [submittals, setSubmittals] = useState<Submittal[]>([])
  const [status, setStatus] = useState<Status | null>(null)
  const [base, setBase] = useState('')
  const [bound, setBound] = useState('')
  // form
  const [source, setSource] = useState('') // "camera:Name" | "window:Title"
  const [seconds, setSeconds] = useState(5)
  const [thresholdPct, setThresholdPct] = useState(4)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    const d = await getSentinelData()
    setCameras(d.cameras)
    setWindows(d.windows)
    setSubmittals(d.submittals)
    setStatus(d.status)
    setBase(d.boundAngelsUrl)
    setBound(d.boundEndeavor)
    // seed the form from current settings on first load
    setSource((prev) => prev || (d.status.window ? `window:${d.status.window}` : d.status.device ? `camera:${d.status.device}` : ''))
    setSeconds((prev) => (prev === 5 && d.status.intervalMs ? Math.round(d.status.intervalMs / 1000) : prev))
    setThresholdPct((prev) => (prev === 4 && d.status.threshold ? Math.round(d.status.threshold * 100) : prev))
  }, [])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => void refresh(), 10000)
    return () => clearInterval(id)
  }, [refresh])

  const apply = (over: Partial<SentinelConfig> = {}): SentinelConfig => {
    const [kind, ...rest] = source.split(':')
    const name = rest.join(':')
    return {
      ...(kind === 'window' ? { window: name } : { device: name }),
      intervalMs: Math.max(1000, seconds * 1000),
      threshold: Math.min(1, Math.max(0.005, thresholdPct / 100)),
      ...over,
    }
  }

  const start = async () => {
    setBusy(true)
    try { setStatus(await startSentinelAction(apply())) } finally { setBusy(false) }
  }
  const stop = async () => {
    setBusy(true)
    try { setStatus(await stopSentinelAction()) } finally { setBusy(false) }
  }

  const running = status?.running
  const imgUrl = (u: string) => (u.startsWith('http') ? u : `${base}${u}`)

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-lcars-red mb-1">── Surveillance · Sentinel</div>
        <h1 className="text-2xl font-mono font-semibold">Sentinel</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Watch a camera or window; submit a frame to the endeavor only when the scene changes.
        </p>
      </div>

      {!bound ? (
        <Card className="p-4 text-xs font-mono text-lcars-amber border-lcars-amber/30 bg-lcars-amber/5">
          Not locked onto an endeavor — submittals have nowhere to go. Lock on in Federation first.
        </Card>
      ) : null}

      {/* ── Config + control ─────────────────────────────────────────────── */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-mono">
            <Eye className={`size-4 ${running ? 'text-lcars-green' : 'text-muted-foreground'}`} />
            <span className={running ? 'text-lcars-green' : 'text-muted-foreground'}>
              {running ? 'WATCHING' : 'IDLE'}
            </span>
            {status?.last ? (
              <span className="text-[10px] text-muted-foreground">
                · last Δ{(status.last.diff * 100).toFixed(1)}% {status.last.changed ? '(submitted)' : '(no change)'} @ {new Date(status.last.at).toLocaleTimeString()}
              </span>
            ) : null}
          </div>
          <Button variant="ghost" size="sm" onClick={() => void refresh()} title="Refresh">
            <RefreshCw className="size-3.5" />
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Source</span>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary/50"
            >
              <option value="">— pick a camera or window —</option>
              {cameras.length ? (
                <optgroup label="Cameras">
                  {cameras.map((c) => <option key={`c:${c}`} value={`camera:${c}`}>📷 {c}</option>)}
                </optgroup>
              ) : null}
              {windows.length ? (
                <optgroup label="Windows">
                  {windows.map((w) => <option key={`w:${w}`} value={`window:${w}`}>🖥️ {w}</option>)}
                </optgroup>
              ) : null}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Every (sec)</span>
              <Input type="number" min={1} value={seconds} onChange={(e) => setSeconds(Number(e.target.value) || 5)} />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Change %</span>
              <Input type="number" min={0.5} step={0.5} value={thresholdPct} onChange={(e) => setThresholdPct(Number(e.target.value) || 4)} />
            </label>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {running ? (
            <Button onClick={stop} disabled={busy} variant="destructive" size="sm">
              <Square className="size-3.5 mr-1.5" /> Stop watching
            </Button>
          ) : (
            <Button onClick={start} disabled={busy || !source} size="sm">
              <Play className="size-3.5 mr-1.5" /> Start watching
            </Button>
          )}
          {running ? (
            <Button onClick={start} disabled={busy} variant="ghost" size="sm" title="Re-apply config">
              Apply changes
            </Button>
          ) : null}
          <span className="text-[10px] font-mono text-muted-foreground inline-flex items-center gap-1">
            {source.startsWith('window:') ? <MonitorSmartphone className="size-3" /> : <Camera className="size-3" />}
            {source.replace(/^(camera|window):/, '') || 'no source'}
          </span>
        </div>
      </Card>

      {/* ── Submittals gallery ───────────────────────────────────────────── */}
      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
          Submittals ({submittals.length})
        </div>
        {submittals.length === 0 ? (
          <Card className="p-6 text-center text-xs font-mono text-muted-foreground">
            No submittals yet. Start watching, or snap one — captures appear here and in the endeavor’s Media.
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {submittals.map((s, i) => (
              <a
                key={`${s.at}-${i}`}
                href={imgUrl(s.url)}
                target="_blank"
                rel="noreferrer"
                className="group block overflow-hidden rounded-lg border border-border bg-muted/20"
                title={`${s.source} · ${new Date(s.at).toLocaleString()}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imgUrl(s.url)} alt={s.source} className="aspect-video w-full object-cover transition group-hover:opacity-90" loading="lazy" />
                <div className="truncate px-2 py-1 text-[10px] font-mono text-muted-foreground">
                  {new Date(s.at).toLocaleString()}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
