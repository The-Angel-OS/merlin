'use client'
import { useCallback, useEffect, useState } from 'react'
import { Cpu, Download, Play, RefreshCw, CheckCircle2, CircleSlash, Loader2, Printer, Boxes } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getResources, installOllamaAction, startOllamaAction, pullModelAction } from './actions'

type Ollama = { installed: boolean; running: boolean; version: string; models: string[]; url: string; binary: string }

export default function ResourcesPage() {
  const [ollama, setOllama] = useState<Ollama | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [model, setModel] = useState('llama3.2')
  const [note, setNote] = useState('')

  const refresh = useCallback(async () => {
    const d = await getResources()
    setOllama(d.ollama)
  }, [])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => void refresh(), 15000)
    return () => clearInterval(id)
  }, [refresh])

  const run = async (key: string, fn: () => Promise<unknown>, msg: string) => {
    setBusy(key)
    setNote(msg)
    try {
      const r = (await fn()) as { ok?: boolean; output?: string; error?: string; alreadyRunning?: boolean }
      setNote(r?.ok ? `${msg} ✓` : `${msg} failed: ${r?.error || r?.output || 'unknown'}`)
      await refresh()
    } finally {
      setBusy(null)
    }
  }

  const Status = ({ ok, label }: { ok: boolean; label: string }) => (
    <span className={`inline-flex items-center gap-1 text-[10px] font-mono ${ok ? 'text-lcars-green' : 'text-muted-foreground'}`}>
      {ok ? <CheckCircle2 className="size-3" /> : <CircleSlash className="size-3" />} {label}
    </span>
  )

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-lcars-blue mb-1">── System · Resources</div>
        <h1 className="text-2xl font-mono font-semibold">Holon Resources</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Detect, install, and configure the resources this node shares. Install-and-forget.
        </p>
      </div>

      {/* ── Ollama (local compute) ───────────────────────────────────────── */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="size-4 text-lcars-blue" />
            <span className="text-sm font-mono font-semibold">Ollama</span>
            <span className="text-[10px] text-muted-foreground">local model compute</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void refresh()} title="Refresh"><RefreshCw className="size-3.5" /></Button>
        </div>

        {ollama ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Status ok={ollama.installed} label={ollama.installed ? 'installed' : 'not installed'} />
              <Status ok={ollama.running} label={ollama.running ? `running ${ollama.version}` : 'stopped'} />
              <span className="text-[10px] font-mono text-muted-foreground">{ollama.url}</span>
            </div>

            <div className="text-[10px] font-mono text-muted-foreground">
              Models: {ollama.models.length ? ollama.models.join(', ') : '— none pulled —'}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!ollama.installed ? (
                <Button size="sm" disabled={!!busy} onClick={() => run('install', installOllamaAction, 'Installing Ollama (winget)')}>
                  {busy === 'install' ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <Download className="size-3.5 mr-1.5" />}
                  Install
                </Button>
              ) : !ollama.running ? (
                <Button size="sm" disabled={!!busy} onClick={() => run('start', startOllamaAction, 'Starting Ollama')}>
                  {busy === 'start' ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <Play className="size-3.5 mr-1.5" />}
                  Start
                </Button>
              ) : null}
              <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="model e.g. llama3.2" className="w-44" />
              <Button
                size="sm"
                variant="outline"
                disabled={!!busy || !ollama.running || !model.trim()}
                onClick={() => run('pull', () => pullModelAction(model), `Pulling ${model}`)}
              >
                {busy === 'pull' ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <Download className="size-3.5 mr-1.5" />}
                Pull model
              </Button>
            </div>
            {note ? <div className="text-[10px] font-mono text-muted-foreground">{note}</div> : null}
          </>
        ) : (
          <div className="text-xs font-mono text-muted-foreground">Detecting…</div>
        )}
      </Card>

      {/* ── Future fulfillment modules (the same detect→install→configure pattern) ── */}
      <Card className="p-4 opacity-70">
        <div className="flex items-center gap-2 mb-1">
          <Boxes className="size-4 text-muted-foreground" />
          <span className="text-sm font-mono font-semibold">Fulfillment modules</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Same install-and-forget pattern, coming as modules: <Printer className="inline size-3" /> 3D printers,
          CNC machines, and other holon-fulfillment hardware this node can detect, configure, and share.
        </p>
      </Card>
    </div>
  )
}
