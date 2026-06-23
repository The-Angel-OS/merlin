'use client'
import { useCallback, useEffect, useState } from 'react'
import { Eye, Play, Square, Camera, MonitorSmartphone, RefreshCw } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getSentinelData, startSentinelAction, stopSentinelAction } from './actions'

type Submittal = { at: string; filename: string; url: string; source: string; endeavor: string }
type SourceLast = { at: string; changed: boolean; diff: number; blank?: boolean; url?: string; error?: string }
type Status = {
  running: boolean
  enabled: boolean
  sources: string[]
  intervalMs: number
  threshold: number
  last: Record<string, SourceLast>
}

export default function SentinelPage() {
  const [cameras, setCameras] = useState<string[]>([])
  const [windows, setWindows] = useState<string[]>([])
  const [submittals, setSubmittals] = useState<Submittal[]>([])
  const [status, setStatus] = useState<Status | null>(null)
  const [base, setBase] = useState('')
  const [bound, setBound] = useState('')
  // form
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [seeded, setSeeded] = useState(false)
  const [seconds, setSeconds] = useState(5)
  const [thresholdPct, setThresholdPct] = useState(4)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    const d = await getSentinelData()
    setCameras(d.cameras)
    setWindows(d.windows)
    setSubmittals(d.submittals)
    setStatus(d.status as Status)
    setBase(d.boundAngelsUrl)
    setBound(d.boundEndeavor)
    setSeeded((wasSeeded) => {
      if (!wasSeeded) {
        setSelected(new Set(d.status.sources || []))
        if (d.status.intervalMs) setSeconds(Math.round(d.status.intervalMs / 1000))
        if (d.status.threshold) setThresholdPct(Math.round(d.status.threshold * 100))
      }
      return true
    })
  }, [])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => void refresh(), 10000)
    return () => clearInterval(id)
  }, [refresh])

  const toggle = (spec: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(spec)) next.delete(spec)
      else next.add(spec)
      return next
    })

  const start = async () => {
    setBusy(true)
    try {
      setStatus(
        (await startSentinelAction({
          sources: [...selected],
          intervalMs: Math.max(1000, seconds * 1000),
          threshold: Math.min(1, Math.max(0.005, thresholdPct / 100)),
        })) as Status,
      )
    } finally {
      setBusy(false)
    }
  }
  const stop = async () => {
    setBusy(true)
    try { setStatus((await stopSentinelAction()) as Status) } finally { setBusy(false) }
  }

  const running = status?.running
  const imgUrl = (u: string) => (u.startsWith('http') ? u : `${base}${u}`)
  const label = (spec: string) => spec.replace(/^(camera|window):/, '')

  const SourceRow = ({ spec, icon }: { spec: string; icon: React.ReactNode }) => {
    const last = status?.last?.[spec]
    return (
      <label className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted/30 cursor-pointer">
        <input type="checkbox" checked={selected.has(spec)} onChange={() => toggle(spec)} className="accent-lcars-green" />
        {icon}
        <span className="flex-1 truncate">{label(spec)}</span>
        {last ? (
          <span
            className={`text-[10px] font-mono ${last.error ? 'text-lcars-red' : last.blank ? 'text-lcars-amber' : last.changed ? 'text-lcars-green' : 'text-muted-foreground'}`}
            title={last.error || ''}
          >
            {last.error ? 'err' : last.blank ? 'blank' : `Δ${(last.diff * 100).toFixed(0)}%`}
          </span>
        ) : null}
      </label>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-lcars-red mb-1">── Surveillance · Sentinel</div>
        <h1 className="text-2xl font-mono font-semibold">Sentinel</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Watch one or more cameras/windows; submit a frame to the endeavor only when a scene changes.
        </p>
      </div>

      {!bound ? (
        <Card className="p-4 text-xs font-mono text-lcars-amber border-lcars-amber/30 bg-lcars-amber/5">
          Not locked onto an endeavor — submittals have nowhere to go. Lock on in Federation first.
        </Card>
      ) : null}

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-mono">
            <Eye className={`size-4 ${running ? 'text-lcars-green' : 'text-muted-foreground'}`} />
            <span className={running ? 'text-lcars-green' : 'text-muted-foreground'}>
              {running ? `WATCHING ${status?.sources.length ?? 0} source(s)` : 'IDLE'}
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void refresh()} title="Refresh">
            <RefreshCw className="size-3.5" />
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Sources (pick any)</span>
            <div className="max-h-44 overflow-y-auto rounded border border-border p-1">
              {cameras.length ? (
                <>
                  <div className="px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest text-muted-foreground/60">Cameras</div>
                  {cameras.map((c) => <SourceRow key={`c:${c}`} spec={`camera:${c}`} icon={<Camera className="size-3 shrink-0" />} />)}
                </>
              ) : null}
              {windows.length ? (
                <>
                  <div className="px-2 py-0.5 mt-1 text-[9px] font-mono uppercase tracking-widest text-muted-foreground/60">Windows</div>
                  {windows.map((w) => <SourceRow key={`w:${w}`} spec={`window:${w}`} icon={<MonitorSmartphone className="size-3 shrink-0" />} />)}
                </>
              ) : null}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 content-start">
            <label className="space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Every (sec)</span>
              <Input type="number" min={1} value={seconds} onChange={(e) => setSeconds(Number(e.target.value) || 5)} />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Change %</span>
              <Input type="number" min={0.5} step={0.5} value={thresholdPct} onChange={(e) => setThresholdPct(Number(e.target.value) || 4)} />
            </label>
            <div className="col-span-2 text-[10px] font-mono text-muted-foreground">
              {selected.size} selected{selected.size > 1 ? ' · each watched independently' : ''}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {running ? (
            <>
              <Button onClick={stop} disabled={busy} variant="destructive" size="sm">
                <Square className="size-3.5 mr-1.5" /> Stop watching
              </Button>
              <Button onClick={start} disabled={busy || selected.size === 0} variant="ghost" size="sm">Apply changes</Button>
            </>
          ) : (
            <Button onClick={start} disabled={busy || selected.size === 0} size="sm">
              <Play className="size-3.5 mr-1.5" /> Start watching
            </Button>
          )}
        </div>
      </Card>

      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Submittals ({submittals.length})</div>
        {submittals.length === 0 ? (
          <Card className="p-6 text-center text-xs font-mono text-muted-foreground">
            No submittals yet. Start watching — captures appear here and in the endeavor’s Media.
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
                <div className="truncate px-2 py-1 text-[10px] font-mono text-muted-foreground">{new Date(s.at).toLocaleString()}</div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
