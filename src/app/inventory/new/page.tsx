'use client'
/**
 * /inventory/new — Start a capture batch.
 *
 * Flow:
 *   1. Pick files (camera on mobile, file picker on desktop)
 *   2. Review + tag + choose collection
 *   3. Add to queue → redirect to /inventory
 *
 * Works offline; items are enqueued immediately.
 */
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Camera, Upload, Tag, X, CheckCircle2, Loader2,
  ShoppingBag, MapPin, Film, Image as ImageIcon, Package,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { appStorage } from '@/lib/storage'
import {
  addItem, createBatch, type InventoryCollection,
} from '@/lib/inventoryQueue'
import { startUploader } from '@/lib/inventoryUploader'

// ─── Config ─────────────────────────────────────────────────────────────────

const COLLECTIONS: { id: InventoryCollection; label: string; icon: React.ElementType; color: string }[] = [
  { id: 'media',    label: 'Media',     icon: ImageIcon,  color: '#99ccff' },
  { id: 'products', label: 'Products',  icon: ShoppingBag, color: '#22cc88' },
  { id: 'spaces',   label: 'Spaces',    icon: MapPin,     color: '#cc99cc' },
  { id: 'dashcam',  label: 'Dashcam',   icon: Film,       color: '#cc4444' },
  { id: 'other',    label: 'Other',     icon: Package,    color: '#7788aa' },
]

interface StagedFile {
  file: File
  preview?: string
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function NewBatchPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  const [batchName, setBatchName] = useState(() => `Batch ${new Date().toLocaleString()}`)
  const [collection, setCollection] = useState<InventoryCollection>('media')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [staged, setStaged] = useState<StagedFile[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 })

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return
    const next: StagedFile[] = Array.from(incoming).map(file => ({
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
    }))
    setStaged(prev => [...prev, ...next])
  }

  const removeStaged = (idx: number) => {
    setStaged(prev => {
      const victim = prev[idx]
      if (victim?.preview) URL.revokeObjectURL(victim.preview)
      return prev.filter((_, i) => i !== idx)
    })
  }

  const addTag = () => {
    const t = tagInput.trim().toLowerCase()
    if (!t) return
    if (tags.includes(t)) return
    setTags(prev => [...prev, t])
    setTagInput('')
  }

  const removeTag = (t: string) => setTags(prev => prev.filter(x => x !== t))

  const submit = async () => {
    if (staged.length === 0) return
    setSubmitting(true)
    setProgress({ done: 0, total: staged.length })
    try {
      const tenant = appStorage.getTenant() || 'default'
      const batch = await createBatch({
        name: batchName.trim() || `Batch ${new Date().toISOString()}`,
        collection,
        tags,
        notes: notes.trim() || undefined,
        tenant,
      })
      for (let i = 0; i < staged.length; i++) {
        const sf = staged[i]
        await addItem({
          file: sf.file,
          filename: sf.file.name,
          tags,
          notes: notes.trim() || undefined,
          batchId: batch.id,
          collection,
        })
        setProgress({ done: i + 1, total: staged.length })
      }
      // Free object URLs before navigation
      for (const s of staged) if (s.preview) URL.revokeObjectURL(s.preview)
      // Kick uploader in case it wasn't running
      await startUploader().catch(() => {})
      router.push('/inventory')
    } finally {
      setSubmitting(false)
    }
  }

  const totalSize = staged.reduce((a, s) => a + s.file.size, 0)

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/inventory"
          className="inline-flex items-center justify-center size-8 rounded-md border border-border hover:border-lcars-amber/40 transition"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-lcars-amber">
            ── New Batch
          </div>
          <h1 className="text-xl font-semibold">Start Capture</h1>
        </div>
      </div>

      {/* Batch name */}
      <div>
        <label className="block text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">
          Batch Name
        </label>
        <input
          value={batchName}
          onChange={e => setBatchName(e.target.value)}
          className="w-full rounded-md border border-border bg-background/60 px-3 py-1.5 text-sm outline-none focus:border-lcars-amber/60"
          placeholder="e.g. Inventory — Warehouse 3 — Mar 18"
        />
      </div>

      {/* Collection */}
      <div>
        <label className="block text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">
          Target Collection
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {COLLECTIONS.map(c => {
            const Icon = c.icon
            const active = collection === c.id
            return (
              <button
                key={c.id}
                onClick={() => setCollection(c.id)}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-md border px-3 py-2.5 text-xs transition',
                  active
                    ? 'bg-accent/50 font-medium'
                    : 'bg-card/40 text-muted-foreground hover:text-foreground',
                )}
                style={{
                  borderColor: active ? c.color : 'var(--border)',
                  color: active ? c.color : undefined,
                }}
              >
                <Icon className="size-4" />
                <span className="font-mono uppercase tracking-wider text-[10px]">{c.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Tags */}
      <div>
        <label className="block text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">
          Tags
        </label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {tags.map(t => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-full bg-lcars-blue/10 border border-lcars-blue/40 text-lcars-blue px-2 py-0.5 text-[10px] font-mono"
            >
              <Tag className="size-2.5" />
              {t}
              <button onClick={() => removeTag(t)} className="hover:text-lcars-red">
                <X className="size-2.5" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag() }
            }}
            className="flex-1 rounded-md border border-border bg-background/60 px-3 py-1.5 text-xs outline-none focus:border-lcars-amber/60"
            placeholder="Type a tag and press Enter"
          />
          <button
            onClick={addTag}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-mono uppercase tracking-wider hover:border-lcars-amber/40 transition"
          >
            Add
          </button>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">
          Notes
        </label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-border bg-background/60 px-3 py-1.5 text-sm outline-none focus:border-lcars-amber/60 resize-y"
          placeholder="Context, location, SKU prefix… applied as alt text."
        />
      </div>

      {/* Capture */}
      <div>
        <label className="block text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">
          Capture
        </label>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => cameraRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-md border border-lcars-amber/60 bg-lcars-amber/10 text-lcars-amber px-4 py-2 text-xs font-mono uppercase tracking-wider hover:bg-lcars-amber/20 transition"
          >
            <Camera className="size-3.5" /> Take Photo
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-xs font-mono uppercase tracking-wider hover:border-lcars-amber/40 transition"
          >
            <Upload className="size-3.5" /> Pick Files
          </button>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={e => { addFiles(e.target.files); if (e.target) e.target.value = '' }}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={e => { addFiles(e.target.files); if (e.target) e.target.value = '' }}
          />
        </div>
      </div>

      {/* Staged list */}
      {staged.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Staged · {staged.length} · {(totalSize / 1024 / 1024).toFixed(1)} MB
            </div>
            <button
              onClick={() => {
                for (const s of staged) if (s.preview) URL.revokeObjectURL(s.preview)
                setStaged([])
              }}
              className="text-[10px] font-mono text-muted-foreground hover:text-lcars-red"
            >
              Clear all
            </button>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {staged.map((s, i) => (
              <div
                key={i}
                className="relative group rounded-md border border-border/60 bg-card/40 overflow-hidden aspect-square"
              >
                {s.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.preview} alt={s.file.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Film className="size-6 text-muted-foreground" />
                  </div>
                )}
                <div className="absolute bottom-0 inset-x-0 bg-black/70 px-1.5 py-0.5 text-[9px] font-mono truncate">
                  {s.file.name}
                </div>
                <button
                  onClick={() => removeStaged(i)}
                  className="absolute top-1 right-1 size-5 rounded-full bg-black/70 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Submit */}
      <div className="sticky bottom-4 flex items-center gap-3 rounded-lg border border-border bg-card/80 backdrop-blur px-4 py-3">
        <div className="flex-1 text-xs">
          {submitting ? (
            <span className="flex items-center gap-2 text-lcars-blue font-mono">
              <Loader2 className="size-3.5 animate-spin" />
              Enqueuing {progress.done}/{progress.total}…
            </span>
          ) : staged.length === 0 ? (
            <span className="text-muted-foreground">Add at least one file to continue.</span>
          ) : (
            <span>
              <span className="font-semibold">{staged.length}</span>
              <span className="text-muted-foreground"> item{staged.length === 1 ? '' : 's'} ready · </span>
              <span className="text-muted-foreground">{COLLECTIONS.find(c => c.id === collection)?.label}</span>
            </span>
          )}
        </div>
        <button
          onClick={submit}
          disabled={staged.length === 0 || submitting}
          className={cn(
            'inline-flex items-center gap-2 rounded-md border px-4 py-2 text-xs font-mono uppercase tracking-wider transition',
            staged.length === 0 || submitting
              ? 'border-border bg-muted/40 text-muted-foreground cursor-not-allowed'
              : 'border-lcars-green/60 bg-lcars-green/10 text-lcars-green hover:bg-lcars-green/20',
          )}
        >
          <CheckCircle2 className="size-3.5" />
          Add to Queue
        </button>
      </div>
    </div>
  )
}
