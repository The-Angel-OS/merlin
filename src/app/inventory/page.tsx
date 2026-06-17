'use client'
/**
 * /inventory — Photo Inventory Queue Dashboard
 *
 * Shows the queue state, lets the user pause/resume the uploader,
 * retry failed items, and purge completed items. The "+ New batch"
 * button starts a capture session.
 */
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useInventoryQueue } from '@/hooks/useInventoryQueue'
import {
  removeItem, retryItem, purgeDoneItems, listBatches,
  type InventoryItem, type InventoryBatch,
} from '@/lib/inventoryQueue'
import {
  startUploader, stopUploader, isUploaderRunning,
} from '@/lib/inventoryUploader'
import { cn } from '@/lib/utils'
import {
  Plus, Camera, Pause, Play, Trash2, RotateCw,
  CheckCircle2, AlertTriangle, Clock, Upload, Wifi, WifiOff, Package,
} from 'lucide-react'

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function fmtAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

const STATUS_COLOR: Record<string, string> = {
  pending: '#7788aa',
  uploading: '#99ccff',
  done: '#22cc88',
  error: '#cc4444',
}

const STATUS_ICON: Record<string, React.ElementType> = {
  pending: Clock,
  uploading: Upload,
  done: CheckCircle2,
  error: AlertTriangle,
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const { items, stats, loading } = useInventoryQueue()
  const [running, setRunning] = useState(false)
  const [online, setOnline] = useState(true)
  const [batches, setBatches] = useState<InventoryBatch[]>([])

  useEffect(() => {
    setRunning(isUploaderRunning())
    if (typeof navigator !== 'undefined') setOnline(navigator.onLine)
    const onUp = () => setRunning(isUploaderRunning())
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('nimue:uploader', onUp)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    listBatches().then(setBatches).catch(() => {})
    return () => {
      window.removeEventListener('nimue:uploader', onUp)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  useEffect(() => { listBatches().then(setBatches).catch(() => {}) }, [items.length])

  const toggleUploader = async () => {
    if (running) stopUploader()
    else await startUploader()
    setRunning(isUploaderRunning())
  }

  const handleRetry = async (id: string) => { await retryItem(id) }
  const handleRemove = async (id: string) => { await removeItem(id) }
  const handlePurge = async () => {
    const n = await purgeDoneItems(0)
    // immediate feedback — queue hook will pick up next tick
    void n
  }

  const batchMap = new Map(batches.map(b => [b.id, b]))

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-lcars-amber mb-1">
            ── Photo Inventory · Field Ops
          </div>
          <h1 className="text-2xl font-semibold">Inventory Queue</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Capture offline, upload to Angel OS when connected. Dedupe by SHA-256.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={toggleUploader}
            className={cn(
              'inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-mono uppercase tracking-wider transition',
              running
                ? 'border-lcars-green/40 bg-lcars-green/10 text-lcars-green hover:bg-lcars-green/20'
                : 'border-border bg-card hover:border-lcars-amber/40',
            )}
            title={running ? 'Pause uploader' : 'Start uploader'}
          >
            {running ? <><Pause className="size-3" />Uploader On</> : <><Play className="size-3" />Uploader Off</>}
          </button>
          <Link
            href="/inventory/new"
            className="inline-flex items-center gap-2 rounded-md border border-lcars-amber/60 bg-lcars-amber/10 text-lcars-amber px-3 py-1.5 text-xs font-mono uppercase tracking-wider hover:bg-lcars-amber/20 transition"
          >
            <Plus className="size-3" /> New Batch
          </Link>
        </div>
      </div>

      {/* Status row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <StatTile label="Total" value={stats.total} color="#f5a623" />
        <StatTile label="Pending" value={stats.pending} color="#7788aa" />
        <StatTile label="Uploading" value={stats.uploading} color="#99ccff" pulse={stats.uploading > 0} />
        <StatTile label="Done" value={stats.done} color="#22cc88" />
        <StatTile label="Errors" value={stats.error} color="#cc4444" />
      </div>

      {/* Connection banner */}
      <div
        className={cn(
          'flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-mono',
          online
            ? 'border-lcars-green/30 bg-lcars-green/5 text-lcars-green'
            : 'border-lcars-amber/40 bg-lcars-amber/10 text-lcars-amber',
        )}
      >
        {online ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
        <span className="uppercase tracking-wider">
          {online ? 'Online' : 'Offline'}
        </span>
        <span className="text-muted-foreground">
          · {stats.pending + stats.error} queued · {fmtBytes(stats.pendingBytes)} pending
        </span>
        {stats.done > 0 && (
          <button
            onClick={handlePurge}
            className="ml-auto text-[10px] hover:text-foreground underline underline-offset-2"
          >
            Clear {stats.done} completed
          </button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="rounded-lg border border-border bg-card/50 p-10 text-center text-xs text-muted-foreground font-mono">
          Opening local database…
        </div>
      ) : items.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="rounded-lg border border-border bg-card/50 overflow-hidden">
          <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-3 px-3 py-2 border-b border-border/60 text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
            <span>Status</span>
            <span>Item</span>
            <span>Batch</span>
            <span>Size</span>
            <span>Actions</span>
          </div>
          <div className="divide-y divide-border/40">
            {items.map(item => (
              <InventoryRow
                key={item.id}
                item={item}
                batch={batchMap.get(item.batchId)}
                onRetry={() => handleRetry(item.id)}
                onRemove={() => handleRemove(item.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function StatTile({ label, value, color, pulse }: { label: string; value: number; color: string; pulse?: boolean }) {
  return (
    <div
      className="rounded-md border bg-card/40 px-3 py-2"
      style={{ borderColor: `${color}40` }}
    >
      <div
        className="text-[9px] font-mono uppercase tracking-widest"
        style={{ color }}
      >
        {label}
      </div>
      <div className="text-xl font-semibold mt-0.5 flex items-center gap-1.5">
        {value}
        {pulse && (
          <span
            className="size-1.5 rounded-full"
            style={{ background: color, animation: 'liveness-dot-pulse 1.2s ease-in-out infinite' }}
          />
        )}
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-border/80 bg-card/30 p-10 text-center">
      <Camera className="size-10 mx-auto text-muted-foreground/60" />
      <div className="mt-3 text-sm font-medium">Queue is empty</div>
      <p className="mt-1 text-xs text-muted-foreground">
        Start a new batch to capture or import photos for Angel OS.
      </p>
      <Link
        href="/inventory/new"
        className="mt-4 inline-flex items-center gap-2 rounded-md border border-lcars-amber/60 bg-lcars-amber/10 text-lcars-amber px-3 py-1.5 text-xs font-mono uppercase tracking-wider hover:bg-lcars-amber/20 transition"
      >
        <Plus className="size-3" /> New Batch
      </Link>
    </div>
  )
}

function InventoryRow({
  item, batch, onRetry, onRemove,
}: {
  item: InventoryItem
  batch?: InventoryBatch
  onRetry: () => void
  onRemove: () => void
}) {
  const [preview, setPreview] = useState<string | null>(null)
  const Icon = STATUS_ICON[item.status]
  const color = STATUS_COLOR[item.status]

  useEffect(() => {
    if (!item.mime.startsWith('image/')) return
    const url = URL.createObjectURL(item.blob)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [item.blob, item.mime])

  return (
    <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-3 px-3 py-2 items-center text-xs hover:bg-white/3 transition-colors">
      <div className="flex items-center gap-2">
        <div
          className="size-9 rounded overflow-hidden bg-muted/20 flex items-center justify-center shrink-0 border border-border/40"
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt={item.filename} className="size-full object-cover" />
          ) : (
            <Package className="size-4 text-muted-foreground" />
          )}
        </div>
        <div
          className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider"
          style={{ borderColor: `${color}60`, color }}
        >
          <Icon className={cn('size-2.5', item.status === 'uploading' && 'animate-pulse')} />
          {item.status}
        </div>
      </div>
      <div className="min-w-0">
        <div className="truncate font-medium">{item.filename}</div>
        <div className="text-[10px] text-muted-foreground font-mono truncate">
          {item.mime} · {item.tags.length > 0 ? item.tags.join(' · ') : 'no tags'} · {fmtAgo(item.createdAt)} ago
          {item.status === 'error' && item.lastError && (
            <span className="text-lcars-red"> · {item.lastError}</span>
          )}
        </div>
      </div>
      <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
        {batch?.name ?? item.batchId.slice(0, 6)}
      </div>
      <div className="text-[10px] font-mono text-muted-foreground">
        {fmtBytes(item.size)}
      </div>
      <div className="flex gap-1">
        {item.status === 'error' && (
          <button
            onClick={onRetry}
            className="p-1 rounded hover:bg-accent/50 text-lcars-blue"
            title="Retry"
          >
            <RotateCw className="size-3.5" />
          </button>
        )}
        <button
          onClick={onRemove}
          className="p-1 rounded hover:bg-accent/50 text-muted-foreground hover:text-lcars-red"
          title="Remove"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
