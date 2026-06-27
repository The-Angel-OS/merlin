'use client'
import { useEffect, useState, useRef } from 'react'
import { Camera, Plus, RefreshCw, Trash2, Maximize2, X, Eye, EyeOff, Settings2, Wifi, WifiOff, MonitorPlay } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Camera as CameraType } from '@/lib/store'

// ─── Camera Feed ──────────────────────────────────────────────────────────────

function CameraFeed({ cam, onExpand }: { cam: CameraType; onExpand: () => void }) {
  const [status, setStatus] = useState<'loading' | 'live' | 'error'>('loading')
  const [lastSnapshot, setLastSnapshot] = useState<string | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const snapshotUrl = `/api/cameras/${cam.id}/snapshot`
  const streamUrl = `/api/cameras/${cam.id}/stream`

  // For MJPEG: just point an <img> at the stream proxy
  // For HLS: we'd use a <video> with hls.js
  // For snapshot-only: poll the snapshot endpoint

  useEffect(() => {
    if (!cam.enabled) return
    // Attempt a snapshot to check reachability
    const img = new Image()
    img.onload = () => {
      setStatus('live')
      setLastSnapshot(snapshotUrl + '?t=' + Date.now())
    }
    img.onerror = () => setStatus('error')
    img.src = snapshotUrl + '?t=' + Date.now()
  }, [cam.id, cam.enabled, snapshotUrl])

  if (!cam.enabled) {
    return (
      <div className="flex-1 flex items-center justify-center bg-black/40 rounded">
        <div className="text-center text-xs text-muted-foreground">
          <EyeOff className="size-6 mx-auto mb-1 opacity-40" />
          Disabled
        </div>
      </div>
    )
  }

  if (cam.protocol === 'hls' && cam.hlsUrl) {
    return (
      <div className="flex-1 relative bg-black rounded overflow-hidden">
        <video
          autoPlay
          muted
          playsInline
          className="w-full h-full object-cover"
          onLoadedData={() => setStatus('live')}
          onError={() => setStatus('error')}
        >
          <source src={cam.hlsUrl} type="application/x-mpegURL" />
        </video>
        {status !== 'live' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <RefreshCw className="size-5 text-muted-foreground animate-spin" />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex-1 relative bg-black rounded overflow-hidden group">
      {/* MJPEG stream via proxy */}
      <img
        ref={imgRef}
        src={cam.protocol === 'http' ? streamUrl : snapshotUrl + '?t=' + Date.now()}
        alt={cam.name}
        className="w-full h-full object-cover"
        onLoad={() => setStatus('live')}
        onError={() => setStatus('error')}
      />

      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 gap-2">
          <WifiOff className="size-6 text-lcars-red" />
          <span className="text-[10px] font-mono text-lcars-red">Unreachable</span>
          {lastSnapshot && (
            <img src={lastSnapshot} alt="last known" className="absolute inset-0 w-full h-full object-cover opacity-20" />
          )}
        </div>
      )}

      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <RefreshCw className="size-5 text-lcars-amber animate-spin" />
        </div>
      )}

      {/* Expand button on hover */}
      <button
        onClick={onExpand}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded bg-black/60 hover:bg-black/80"
      >
        <Maximize2 className="size-3.5 text-white" />
      </button>

      {/* Live indicator */}
      {status === 'live' && (
        <div className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/60">
          <div className="size-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[9px] font-mono text-white uppercase">Live</span>
        </div>
      )}
    </div>
  )
}

// ─── Camera Card ──────────────────────────────────────────────────────────────

function CameraCard({
  cam,
  onDelete,
  onExpand,
}: {
  cam: CameraType
  onDelete: (id: string) => void
  onExpand: (cam: CameraType) => void
}) {
  return (
    <div className="flex flex-col gap-2 p-3 rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm hover:border-lcars-amber/30 transition-all">
      <CameraFeed cam={cam} onExpand={() => onExpand(cam)} />

      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium truncate">{cam.name}</div>
          <div className="text-[10px] font-mono text-muted-foreground truncate">
            {cam.location && `${cam.location} · `}{cam.ip}:{cam.port}
          </div>
        </div>
        <div className="flex items-center gap-1 ml-2">
          <button
            onClick={() => onExpand(cam)}
            className="p-1 rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground transition"
            title="Fullscreen"
          >
            <MonitorPlay className="size-3.5" />
          </button>
          <button
            onClick={() => onDelete(cam.id)}
            className="p-1 rounded hover:bg-lcars-red/20 text-muted-foreground hover:text-lcars-red transition"
            title="Remove camera"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Add Camera Modal ─────────────────────────────────────────────────────────

function AddCameraModal({ onClose, onSave }: { onClose: () => void; onSave: (cam: Partial<CameraType>) => void }) {
  const [form, setForm] = useState({
    name: '',
    location: '',
    ip: '',
    port: '80',
    username: '',
    password: '',
    mjpegPath: '/video',
    snapshotPath: '/snapshot',
    rtspUrl: '',
    hlsUrl: '',
    protocol: 'http' as 'http' | 'hls' | 'rtsp',
  })

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl border border-border bg-card/95 backdrop-blur-xl shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-mono uppercase tracking-widest text-lcars-amber">Add IP Camera</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent/50 transition">
            <X className="size-4 text-muted-foreground" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1 block">Camera Name *</label>
            <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Front Door" className="h-8 text-xs" />
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1 block">IP Address *</label>
            <Input value={form.ip} onChange={e => set('ip', e.target.value)} placeholder="192.168.1.100" className="h-8 text-xs font-mono" />
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1 block">Port</label>
            <Input value={form.port} onChange={e => set('port', e.target.value)} placeholder="80" className="h-8 text-xs font-mono" />
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1 block">Location</label>
            <Input value={form.location} onChange={e => set('location', e.target.value)} placeholder="Garage" className="h-8 text-xs" />
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1 block">Protocol</label>
            <select
              value={form.protocol}
              onChange={e => set('protocol', e.target.value)}
              className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs font-mono"
            >
              <option value="http">MJPEG (HTTP)</option>
              <option value="hls">HLS (m3u8)</option>
              <option value="rtsp">RTSP (via nginx)</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1 block">MJPEG Path</label>
            <Input value={form.mjpegPath} onChange={e => set('mjpegPath', e.target.value)} placeholder="/video" className="h-8 text-xs font-mono" />
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1 block">Snapshot Path</label>
            <Input value={form.snapshotPath} onChange={e => set('snapshotPath', e.target.value)} placeholder="/snapshot" className="h-8 text-xs font-mono" />
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1 block">Username</label>
            <Input value={form.username} onChange={e => set('username', e.target.value)} placeholder="admin" className="h-8 text-xs" />
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1 block">Password</label>
            <Input type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="••••••" className="h-8 text-xs" />
          </div>
          {(form.protocol === 'rtsp') && (
            <div className="col-span-2">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1 block">RTSP URL</label>
              <Input value={form.rtspUrl} onChange={e => set('rtspUrl', e.target.value)} placeholder="rtsp://192.168.1.100:554/stream1" className="h-8 text-xs font-mono" />
            </div>
          )}
          {(form.protocol === 'hls') && (
            <div className="col-span-2">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1 block">HLS URL (m3u8)</label>
              <Input value={form.hlsUrl} onChange={e => set('hlsUrl', e.target.value)} placeholder="http://192.168.1.10:8080/hls/cam1/index.m3u8" className="h-8 text-xs font-mono" />
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onClose} className="flex-1 h-8">Cancel</Button>
          <Button
            size="sm"
            className="flex-1 h-8 bg-lcars-amber text-black hover:bg-lcars-amber/90 font-mono uppercase tracking-wider"
            onClick={() => {
              if (!form.name || !form.ip) return
              onSave({ ...form, port: parseInt(form.port) || 80, enabled: true })
            }}
          >
            Add Camera
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Fullscreen Viewer ────────────────────────────────────────────────────────

function FullscreenViewer({ cam, onClose }: { cam: CameraType; onClose: () => void }) {
  const streamUrl = `/api/cameras/${cam.id}/stream`
  const hlsUrl = cam.hlsUrl || ''

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/30">
        <div>
          <span className="text-sm font-mono text-foreground">{cam.name}</span>
          {cam.location && <span className="text-xs text-muted-foreground ml-2">· {cam.location}</span>}
        </div>
        <button onClick={onClose} className="p-1.5 rounded hover:bg-white/10 transition">
          <X className="size-5 text-muted-foreground" />
        </button>
      </div>
      <div className="flex-1 relative">
        {cam.protocol === 'hls' && hlsUrl ? (
          <video autoPlay muted playsInline className="w-full h-full object-contain">
            <source src={hlsUrl} type="application/x-mpegURL" />
          </video>
        ) : (
          <img src={streamUrl} alt={cam.name} className="w-full h-full object-contain" />
        )}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CamerasPage() {
  const [cameras, setCameras] = useState<CameraType[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [expanded, setExpanded] = useState<CameraType | null>(null)
  const [loading, setLoading] = useState(true)
  const [layout, setLayout] = useState<'grid' | 'mosaic'>('grid')

  useEffect(() => {
    fetch('/api/cameras')
      .then(r => r.json())
      .then(d => { setCameras(d.cameras || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const addCamera = async (cam: Partial<CameraType>) => {
    const res = await fetch('/api/cameras', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cam),
    })
    const data = await res.json()
    if (data.camera) {
      setCameras(prev => [...prev, data.camera])
      setShowAdd(false)
    }
  }

  const deleteCamera = async (id: string) => {
    await fetch('/api/cameras', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setCameras(prev => prev.filter(c => c.id !== id))
  }

  const gridCols = cameras.length <= 1 ? 'grid-cols-1' :
    cameras.length <= 4 ? 'grid-cols-2' :
    cameras.length <= 9 ? 'grid-cols-3' : 'grid-cols-4'

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-lcars-red mb-1">
            ── Surveillance · IP Camera Grid
          </div>
          <h1 className="text-2xl font-mono font-semibold">Camera Feeds</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {cameras.length} camera{cameras.length !== 1 ? 's' : ''} configured · MJPEG, HLS, RTSP/nginx
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex border border-border/60 rounded-md overflow-hidden">
            <button
              onClick={() => setLayout('grid')}
              className={`px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider transition ${layout === 'grid' ? 'bg-lcars-amber/20 text-lcars-amber' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Grid
            </button>
            <button
              onClick={() => setLayout('mosaic')}
              className={`px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider transition ${layout === 'mosaic' ? 'bg-lcars-amber/20 text-lcars-amber' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Mosaic
            </button>
          </div>
          <Button
            size="sm"
            className="h-8 bg-lcars-amber text-black hover:bg-lcars-amber/90 font-mono uppercase tracking-wider text-[10px]"
            onClick={() => setShowAdd(true)}
          >
            <Plus className="size-3.5" /> Add Camera
          </Button>
        </div>
      </div>

      {/* Camera grid */}
      {loading ? (
        <div className="py-16 text-center text-xs text-muted-foreground">
          <RefreshCw className="size-5 mx-auto mb-2 animate-spin text-lcars-amber" />
          Loading cameras...
        </div>
      ) : cameras.length === 0 ? (
        <Card className="py-16">
          <div className="text-center space-y-3">
            <Camera className="size-10 mx-auto text-muted-foreground/40" />
            <div className="text-sm font-mono text-muted-foreground">No cameras configured</div>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              Add IP cameras using their MJPEG stream URL, HLS endpoint, or RTSP address (via nginx proxy).
            </p>
            <Button
              size="sm"
              className="bg-lcars-amber text-black hover:bg-lcars-amber/90 font-mono uppercase tracking-wider text-[10px]"
              onClick={() => setShowAdd(true)}
            >
              <Plus className="size-3.5" /> Add First Camera
            </Button>
          </div>
        </Card>
      ) : (
        <div className={`grid ${gridCols} gap-3 ${layout === 'mosaic' ? 'auto-rows-[220px]' : 'auto-rows-[200px]'}`}>
          {cameras.map(cam => (
            <div key={cam.id} className={`${layout === 'mosaic' && cameras.indexOf(cam) === 0 ? 'row-span-2 col-span-2' : ''} flex flex-col`}>
              <CameraCard cam={cam} onDelete={deleteCamera} onExpand={setExpanded} />
            </div>
          ))}
        </div>
      )}

      {/* RTSP/nginx tip */}
      {cameras.some(c => c.protocol === 'rtsp') && (
        <Card className="p-4 border-lcars-amber/20">
          <div className="text-[10px] font-mono uppercase tracking-widest text-lcars-amber mb-2">RTSP → HLS Conversion</div>
          <p className="text-xs text-muted-foreground mb-2">
            RTSP cameras require nginx-rtmp-module or ffmpeg to convert to HLS for browser playback.
            See <code className="text-lcars-blue bg-black/30 px-1 rounded">nginx-config/rtsp-to-hls.conf</code> in this repo.
          </p>
          <pre className="text-[10px] font-mono text-muted-foreground bg-black/30 rounded p-2 overflow-x-auto">
{`ffmpeg -i rtsp://user:pass@192.168.1.x:554/stream1 \\
  -c:v copy -c:a aac -f hls \\
  -hls_time 2 -hls_list_size 5 \\
  /var/www/hls/cam1/index.m3u8`}
          </pre>
        </Card>
      )}

      {showAdd && <AddCameraModal onClose={() => setShowAdd(false)} onSave={addCamera} />}
      {expanded && <FullscreenViewer cam={expanded} onClose={() => setExpanded(null)} />}
    </div>
  )
}
