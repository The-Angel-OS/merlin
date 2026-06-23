'use client'
import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Share2, Lock, Check, AlertTriangle } from 'lucide-react'

type FlagKey = 'stats' | 'media' | 'cameras' | 'ingest' | 'leo' | 'compute' | 'retrieval' | 'tunnel'

interface SharesConfig {
  profile: string
  shares: Record<FlagKey, boolean>
}
interface Availability {
  hasSharedRoots: boolean
  tunnelConfigured: boolean
  ollamaAvailable: boolean
}

// Display metadata (kept client-side so we never import the fs-touching lib).
const TIERS: Array<{ tier: number; title: string; blurb: string; keys: FlagKey[] }> = [
  { tier: 0, title: 'Presence', blurb: 'Name, online status, telemetry. Identity only — always safe.', keys: ['stats'] },
  { tier: 1, title: 'Content', blurb: 'Files this node contributes to the endeavor.', keys: ['media', 'cameras', 'ingest'] },
  { tier: 2, title: 'Compute & control', blurb: 'Lend cycles or let the endeavor reach in. Higher trust.', keys: ['leo', 'compute', 'retrieval', 'tunnel'] },
]
const LABELS: Record<FlagKey, { label: string; help: string }> = {
  stats: { label: 'Telemetry', help: 'CPU, memory, uptime heartbeat' },
  media: { label: 'Media library', help: 'Browse shared drives (needs a shared root)' },
  cameras: { label: 'Cameras / sentinel', help: 'Submit camera + sentinel snapshots' },
  ingest: { label: 'Ingest', help: 'Contribute via the inventory pipeline' },
  leo: { label: 'LEO console', help: "Let the endeavor talk to this node's brain" },
  compute: { label: 'LLM compute', help: 'Lend local Ollama models (needs Ollama)' },
  retrieval: { label: 'Distributed retrieval', help: 'Index / search shard for the endeavor' },
  tunnel: { label: 'Reverse tunnel', help: 'Expose the bulk/streaming path publicly' },
}

/** A resource-availability warning for a flag the owner enabled but can't yet fulfil. */
function unmetNote(key: FlagKey, a: Availability | null): string | null {
  if (!a) return null
  if (key === 'media' && !a.hasSharedRoots) return 'No shared root yet — mark a drive shared in Media.'
  if (key === 'compute' && !a.ollamaAvailable) return 'Ollama not detected on this machine.'
  if (key === 'tunnel' && !a.tunnelConfigured) return 'No tunnel running — start cloudflared.'
  return null
}

export default function SharesPage() {
  const [config, setConfig] = useState<SharesConfig | null>(null)
  const [avail, setAvail] = useState<Availability | null>(null)
  const [presets, setPresets] = useState<Array<{ name: string; blurb: string }>>([])
  const [envLocked, setEnvLocked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const load = () =>
    fetch('/api/shares')
      .then((r) => r.json())
      .then((d) => {
        setConfig(d.config)
        setAvail(d.availability)
        setPresets(d.presets || [])
        setEnvLocked(!!d.envLocked)
      })
      .catch(() => {})

  useEffect(() => {
    void load()
  }, [])

  const post = async (body: object, note: string) => {
    if (envLocked) return
    setBusy(true)
    try {
      const res = await fetch('/api/shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => r.json())
      if (res.config) {
        setConfig(res.config)
        setMsg(`✓ ${note}`)
      } else {
        setMsg(`✗ ${res.error || 'failed'}`)
      }
    } catch {
      setMsg('✗ failed')
    }
    setBusy(false)
    setTimeout(() => setMsg(''), 3000)
  }

  const toggle = (key: FlagKey) =>
    config && post({ shares: { [key]: !config.shares[key] } }, `${LABELS[key].label} ${!config.shares[key] ? 'on' : 'off'}`)
  const applyPreset = (name: string) => post({ profile: name }, `preset: ${name}`)

  if (!config) {
    return <div className="text-sm text-muted-foreground">Loading sharing config…</div>
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-lcars-amber">
          ── Resource sharing · what this node offers
        </div>
        <h1 className="flex items-center gap-2 font-mono text-2xl font-semibold">
          <Share2 className="size-5" /> Sharing
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Presence is always on. Everything below is an explicit grant pushed up to the endeavor.
          Active profile: <code className="text-lcars-amber">{config.profile}</code>
        </p>
      </div>

      {envLocked && (
        <Card className="border-lcars-amber/40 bg-lcars-amber/5">
          <CardContent className="flex items-center gap-2 py-2 font-mono text-xs text-lcars-amber">
            <Lock className="size-3.5" /> Locked by env preconfig (MERLIN_PROFILE / MERLIN_SHARES_JSON). Read-only.
          </CardContent>
        </Card>
      )}

      {msg && (
        <Card className="border-lcars-amber/40 bg-lcars-amber/5">
          <CardContent className="py-2 font-mono text-xs text-lcars-amber">{msg}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Presets</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <Button
              key={p.name}
              variant={config.profile === p.name ? 'lcars' : 'outline'}
              size="sm"
              disabled={busy || envLocked}
              onClick={() => applyPreset(p.name)}
              title={p.blurb}
            >
              {p.name}
            </Button>
          ))}
        </CardContent>
      </Card>

      {TIERS.map((tier) => (
        <Card key={tier.tier}>
          <CardHeader>
            <CardTitle className="flex items-baseline gap-2">
              <span className="font-mono text-[10px] uppercase tracking-widest text-lcars-amber">Tier {tier.tier}</span>
              <span>{tier.title}</span>
            </CardTitle>
            <p className="text-[11px] text-muted-foreground">{tier.blurb}</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {tier.keys.map((key) => {
              const on = config.shares[key]
              const warn = on ? unmetNote(key, avail) : null
              return (
                <div
                  key={key}
                  className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{LABELS[key].label}</div>
                    <div className="text-[11px] text-muted-foreground">{LABELS[key].help}</div>
                    {warn && (
                      <div className="mt-0.5 flex items-center gap-1 text-[11px] text-lcars-amber">
                        <AlertTriangle className="size-3 shrink-0" /> {warn}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={`${LABELS[key].label} ${on ? 'on' : 'off'}`}
                    disabled={busy || envLocked}
                    onClick={() => toggle(key)}
                    className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-mono font-medium transition-colors ${
                      on
                        ? 'bg-lcars-green/15 text-lcars-green'
                        : 'border border-border/60 text-muted-foreground hover:text-foreground'
                    } ${busy || envLocked ? 'cursor-not-allowed opacity-60' : ''}`}
                  >
                    {on ? (
                      <span className="flex items-center gap-1">
                        <Check className="size-3" /> On
                      </span>
                    ) : (
                      'Off'
                    )}
                  </button>
                </div>
              )
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
