'use client'
/**
 * /connect/[slug] — Endeavor detail + sign-in.
 *
 * Probes /.well-known/angel-os on the Endeavor's subdomain, shows its
 * manifest (capabilities, category, public profile), and runs the Payload
 * auth handshake on submit.
 */

import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useConnection } from '@/hooks/useConnection'
import { probeEndeavor, type EndeavorManifest } from '@/lib/federation'
import {
  ArrowLeft, Radio, ShieldCheck, AlertCircle, LogIn, Sparkles,
} from 'lucide-react'

export default function EndeavorDetailPage() {
  const params = useParams<{ slug: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const slug = params?.slug ?? ''
  const overrideDomain = searchParams?.get('domain') || undefined

  const { directory, login, sessions } = useConnection()
  const [manifest, setManifest] = useState<EndeavorManifest | null>(null)
  const [probeError, setProbeError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)

  const fromDirectory = directory?.endeavors.find(e => e.slug === slug)
  const domain = overrideDomain ?? fromDirectory?.domain ?? `${slug}.spacesangels.com`
  const alreadySignedIn = sessions.some(s => s.slug === slug)

  // Probe the Endeavor on mount.
  useEffect(() => {
    let cancelled = false
    setProbeError(null)
    probeEndeavor({ domain })
      .then(m => { if (!cancelled) setManifest(m) })
      .catch(err => {
        if (!cancelled) setProbeError(err instanceof Error ? err.message : String(err))
      })
    return () => { cancelled = true }
  }, [domain])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setLoginError(null)
    try {
      await login({ slug, domain, email, password })
      router.push('/')
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl p-6">
      <Link
        href="/connect"
        className="mb-6 inline-flex items-center gap-1.5 text-xs hover:text-white"
        style={{ color: '#7788aa' }}
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Federation
      </Link>

      <header className="mb-8">
        <div className="mb-2 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded" style={{ background: '#99ccff22', color: '#99ccff' }}>
            <Radio className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: '#eef2ff' }}>
              {manifest?.endeavorName ?? fromDirectory?.name ?? slug}
            </h1>
            <div className="font-mono text-xs" style={{ color: '#7788aa' }}>{domain}</div>
          </div>
        </div>
        {manifest?.publicProfile?.about ? (
          <p className="mt-3 text-sm" style={{ color: '#aabbcc' }}>
            {manifest.publicProfile.about}
          </p>
        ) : null}
      </header>

      {/* ─── Manifest / probe status ─────────────────────────────────── */}
      <section className="mb-6 rounded-lg border p-4" style={{ borderColor: '#ffffff15' }}>
        {probeError ? (
          <div className="flex items-start gap-2 text-sm" style={{ color: '#f5a623' }}>
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-medium">Could not reach {domain}</div>
              <div className="mt-1 text-xs" style={{ color: '#7788aa' }}>
                {probeError}. You may still be able to sign in below if you know the credentials.
              </div>
            </div>
          </div>
        ) : manifest ? (
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: '#22cc88' }}>
              <ShieldCheck className="h-3.5 w-3.5" />
              Endeavor verified · Federation {manifest.federationVersion}
            </div>
            {manifest.capabilities?.length ? (
              <div className="flex flex-wrap gap-1.5">
                {manifest.capabilities.map(c => (
                  <span
                    key={c}
                    className="rounded border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
                    style={{ borderColor: '#99ccff33', color: '#99ccff' }}
                  >
                    {c}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="text-xs" style={{ color: '#7788aa' }}>
            Probing {domain}…
          </div>
        )}
      </section>

      {/* ─── Sign-in form ────────────────────────────────────────────── */}
      <section className="rounded-lg border p-5" style={{ borderColor: '#ffffff15' }}>
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold" style={{ color: '#eef2ff' }}>
          <LogIn className="h-4 w-4" style={{ color: '#99ccff' }} />
          Sign in to {manifest?.endeavorName ?? slug}
          {alreadySignedIn ? (
            <span
              className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
              style={{ background: '#22cc8822', color: '#22cc88' }}
            >
              Session exists
            </span>
          ) : null}
        </h2>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wider" style={{ color: '#7788aa' }}>
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="username"
              className="w-full rounded border bg-black/20 px-3 py-2 text-sm outline-none focus:border-white/30"
              style={{ borderColor: '#ffffff20', color: '#eef2ff' }}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wider" style={{ color: '#7788aa' }}>
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full rounded border bg-black/20 px-3 py-2 text-sm outline-none focus:border-white/30"
              style={{ borderColor: '#ffffff20', color: '#eef2ff' }}
            />
          </div>

          {loginError ? (
            <div className="rounded border p-2 text-xs" style={{ borderColor: '#cc444444', color: '#cc4444' }}>
              {loginError}
            </div>
          ) : null}

          <div className="flex items-center justify-between pt-2">
            <p className="text-xs" style={{ color: '#7788aa' }}>
              <Sparkles className="mr-1 inline h-3 w-3" style={{ color: '#cc99cc' }} />
              Signs in directly to this Endeavor
            </p>
            <button
              type="submit"
              disabled={submitting}
              className="rounded border px-4 py-2 text-sm font-medium hover:bg-white/5 disabled:opacity-50"
              style={{ borderColor: '#22cc8844', color: '#22cc88' }}
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
