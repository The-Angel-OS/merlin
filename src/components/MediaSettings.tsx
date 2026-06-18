'use client'

import { useEffect, useState } from 'react'

interface RootConfig {
  path: string
  label: string
  icon: string
  enabled: boolean
  shared?: boolean
  minSizeMB?: number
}

interface ScannedDir {
  path: string
  label: string
  icon: string
  drive: string
  driveLabel: string
  hasMedia: boolean
  subDirCount: number
  alreadyConfigured: boolean
}

const ICON_CHOICES = ['🎬', '📅', '🚗', '📷', '📱', '🖼️', '🎥', '▶️', '🎵', '🖥️', '⏺️', '💾', '📁']

export default function MediaSettings({
  open,
  onClose,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [roots, setRoots] = useState<RootConfig[]>([])
  const [moviesMinSizeMB, setMoviesMinSizeMB] = useState(500)
  const [scanned, setScanned] = useState<ScannedDir[]>([])
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch('/api/movies/roots')
      .then(r => r.json())
      .then(cfg => {
        setRoots(cfg.roots || [])
        setMoviesMinSizeMB(cfg.moviesMinSizeMB ?? 500)
      })
      .finally(() => setLoading(false))
    runScan()
  }, [open])

  const runScan = () => {
    setScanning(true)
    fetch('/api/movies/scan')
      .then(r => r.json())
      .then(data => setScanned(data.dirs || []))
      .finally(() => setScanning(false))
  }

  const configuredPaths = new Set(roots.map(r => r.path.toLowerCase()))
  const discoverable = scanned.filter(d => !configuredPaths.has(d.path.toLowerCase()))

  const toggleEnabled = (i: number) =>
    setRoots(rs => rs.map((r, idx) => (idx === i ? { ...r, enabled: !r.enabled } : r)))

  const toggleShared = (i: number) =>
    setRoots(rs => rs.map((r, idx) => (idx === i ? { ...r, shared: !r.shared } : r)))

  const updateLabel = (i: number, label: string) =>
    setRoots(rs => rs.map((r, idx) => (idx === i ? { ...r, label } : r)))

  const updateIcon = (i: number, icon: string) =>
    setRoots(rs => rs.map((r, idx) => (idx === i ? { ...r, icon } : r)))

  const removeRoot = (i: number) => setRoots(rs => rs.filter((_, idx) => idx !== i))

  const move = (i: number, dir: -1 | 1) =>
    setRoots(rs => {
      const j = i + dir
      if (j < 0 || j >= rs.length) return rs
      const copy = [...rs]
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
      return copy
    })

  const addFromScan = (d: ScannedDir) =>
    setRoots(rs => [...rs, { path: d.path, label: d.label, icon: d.icon, enabled: true, minSizeMB: 0 }])

  const save = async () => {
    setSaving(true)
    try {
      await fetch('/api/movies/roots', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roots, moviesMinSizeMB }),
      })
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[88vh] overflow-hidden flex flex-col rounded-2xl border border-violet-500/30 bg-gradient-to-br from-gray-900 to-black shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700/50">
          <h2 className="text-xl font-semibold text-violet-300 flex items-center gap-2">
            <span>⚙️</span> Shortcuts
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-gray-800/60"
            title="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-4 space-y-6">
          {loading ? (
            <div className="text-center text-gray-400 py-8">Loading…</div>
          ) : (
            <>
              {/* Configured shortcuts */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs uppercase tracking-widest text-gray-500">Your Shortcuts</h3>
                  <div className="flex items-center gap-3 text-[10px] text-gray-500">
                    <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-violet-600" /> serve locally</span>
                    <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-600" /> share up</span>
                  </div>
                </div>
                <div className="space-y-2">
                  {roots.map((r, i) => (
                    <div
                      key={r.path}
                      className={`flex items-center gap-2 rounded-xl border p-2.5 transition-colors ${
                        r.enabled
                          ? 'border-violet-500/30 bg-gray-800/40'
                          : 'border-gray-700/40 bg-gray-900/40 opacity-60'
                      }`}
                    >
                      {/* Icon picker */}
                      <select
                        value={r.icon}
                        onChange={e => updateIcon(i, e.target.value)}
                        className="bg-gray-800 border border-gray-700 rounded-lg text-lg px-1.5 py-1 cursor-pointer"
                      >
                        {ICON_CHOICES.map(ic => (
                          <option key={ic} value={ic}>
                            {ic}
                          </option>
                        ))}
                        {!ICON_CHOICES.includes(r.icon) && <option value={r.icon}>{r.icon}</option>}
                      </select>

                      {/* Label + path */}
                      <div className="flex-1 min-w-0">
                        <input
                          value={r.label}
                          onChange={e => updateLabel(i, e.target.value)}
                          className="w-full bg-transparent text-sm text-gray-200 border-b border-transparent focus:border-violet-500/50 outline-none"
                        />
                        <div className="text-[10px] text-gray-500 font-mono truncate">{r.path}</div>
                      </div>

                      {/* Reorder */}
                      <div className="flex flex-col">
                        <button
                          onClick={() => move(i, -1)}
                          disabled={i === 0}
                          className="text-gray-500 hover:text-white disabled:opacity-20 leading-none text-xs"
                          title="Move up"
                        >
                          ▲
                        </button>
                        <button
                          onClick={() => move(i, 1)}
                          disabled={i === roots.length - 1}
                          className="text-gray-500 hover:text-white disabled:opacity-20 leading-none text-xs"
                          title="Move down"
                        >
                          ▼
                        </button>
                      </div>

                      {/* Serve-locally toggle */}
                      <button
                        onClick={() => toggleEnabled(i)}
                        className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${
                          r.enabled ? 'bg-violet-600' : 'bg-gray-700'
                        }`}
                        title={r.enabled ? 'Served locally' : 'Not served'}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                            r.enabled ? 'translate-x-4' : ''
                          }`}
                        />
                      </button>

                      {/* Share-up toggle — publish to the endeavor/federation (opt-in) */}
                      <button
                        onClick={() => toggleShared(i)}
                        className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${
                          r.shared ? 'bg-emerald-600' : 'bg-gray-700'
                        }`}
                        title={r.shared ? 'Shared up to your endeavor' : 'Local only — not shared up'}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                            r.shared ? 'translate-x-4' : ''
                          }`}
                        />
                      </button>

                      {/* Remove */}
                      <button
                        onClick={() => removeRoot(i)}
                        className="text-gray-500 hover:text-red-400 p-1"
                        title="Remove shortcut"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  {roots.length === 0 && (
                    <div className="text-sm text-gray-500 italic">No shortcuts yet — add some below.</div>
                  )}
                </div>
              </section>

              {/* Discovered directories */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs uppercase tracking-widest text-gray-500">
                    Discovered {scanning && '…'}
                  </h3>
                  <button
                    onClick={runScan}
                    className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Rescan
                  </button>
                </div>
                <div className="space-y-1.5">
                  {discoverable.map(d => (
                    <div
                      key={d.path}
                      className="flex items-center gap-2 rounded-lg border border-gray-700/30 bg-gray-900/30 p-2"
                    >
                      <span className="text-lg">{d.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-300 truncate">{d.label}</div>
                        <div className="text-[10px] text-gray-500 font-mono truncate">{d.path}</div>
                      </div>
                      <button
                        onClick={() => addFromScan(d)}
                        className="text-xs bg-violet-600/80 hover:bg-violet-600 text-white px-3 py-1 rounded-lg whitespace-nowrap"
                      >
                        + Add
                      </button>
                    </div>
                  ))}
                  {!scanning && discoverable.length === 0 && (
                    <div className="text-sm text-gray-500 italic">
                      Nothing new found — everything discovered is already a shortcut.
                    </div>
                  )}
                </div>
              </section>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-700/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-300 hover:text-white rounded-lg hover:bg-gray-800/60"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-5 py-2 text-sm font-semibold text-white rounded-lg bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
