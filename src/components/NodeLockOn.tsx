'use client'
/**
 * NodeLockOn — bind THIS Merlin node to an endeavor. The config-free onboarding act.
 *
 * Posts to /api/node/register, which registers UP to Core and persists the bus
 * binding (channel + minted node token) so the heartbeat + command-poll loop runs.
 * Once locked, the node is "beaming": green in the endeavor's MerlinControl block and
 * answering over its bus channel.
 *
 * Crucially, this needs NO human login — node registration authenticates with
 * NODE_REGISTER_KEY, not user credentials. Locking a machine onto an endeavor is the
 * primary Merlin action; signing in as a person is separate. Used on both the
 * signed-in /connect summary AND the /connect/[slug] detail page.
 */
import { useCallback, useEffect, useState } from 'react'
import { Zap, PlugZap, Loader2, AlertCircle } from 'lucide-react'

type NodeStatus = { boundEndeavor: string; busChannel: string; hasToken: boolean }

export function NodeLockOn({ slug, name, domain }: { slug: string; name: string; domain: string }) {
  const [status, setStatus] = useState<NodeStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/node/register', { method: 'GET' })
      if (res.ok) setStatus((await res.json()) as NodeStatus)
    } catch {
      /* node status is non-critical */
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const lockedHere = status?.boundEndeavor === slug && status?.hasToken

  const lockOn = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/node/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endeavor: slug, angelsUrl: `https://${domain}` }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : `register failed (${res.status})`)
      } else {
        await refresh()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'register failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border-t pt-3" style={{ borderColor: '#22cc8822' }}>
      {lockedHere ? (
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2 text-sm" style={{ color: '#22cc88' }}>
            <Zap className="h-4 w-4" />
            This machine is locked on · beaming to <code className="font-mono text-xs" style={{ color: '#aabbcc' }}>#{status?.busChannel}</code>
          </span>
          <button
            onClick={lockOn}
            disabled={busy}
            className="rounded border px-2.5 py-1 text-xs hover:bg-white/5 disabled:opacity-50"
            style={{ borderColor: '#ffffff20', color: '#7788aa' }}
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Re-register'}
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs" style={{ color: '#7788aa' }}>
            {status?.boundEndeavor && status.boundEndeavor !== slug
              ? `This node is bound to "${status.boundEndeavor}" — re-lock onto ${name}?`
              : `Make this machine a Merlin node for ${name}.`}
          </span>
          <button
            onClick={lockOn}
            disabled={busy}
            className="inline-flex shrink-0 items-center gap-1.5 rounded border px-3 py-1.5 text-sm hover:bg-white/5 disabled:opacity-50"
            style={{ borderColor: '#f5a62344', color: '#f5a623' }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
            Lock this node on
          </button>
        </div>
      )}
      {error ? (
        <p className="mt-2 text-xs" style={{ color: '#cc4444' }}>
          <AlertCircle className="mr-1 inline h-3 w-3" />
          {error}
        </p>
      ) : null}
    </div>
  )
}
