/**
 * GET /api/probe?domain=<host> — Merlin's same-origin Endeavor manifest proxy.
 *
 * The Connect screen probes an Endeavor's `/.well-known/angel-os` manifest to
 * show "Endeavor verified". Fetching that https URL directly from the browser
 * fails ("Failed to fetch") — Merlin is served over http on the LAN, so it's a
 * mixed-content / CORS cross-origin request — which produced the FALSE
 * "Could not reach …" banner even while the header pill + node lock-on were
 * beaming to the very same Endeavor (they go through Merlin's SERVER). This
 * route fetches the manifest server-side (no CORS), so the banner reflects
 * reality. Same pattern as /api/directory.
 */
import { NextResponse } from 'next/server'
import { FEDERATION_DEFAULTS } from '@/lib/federation'

const TIMEOUT_MS = 10_000

export async function GET(req: Request) {
  const domain = new URL(req.url).searchParams.get('domain')?.trim()
  if (!domain || !/^[a-z0-9.-]+$/i.test(domain)) {
    return NextResponse.json({ error: 'invalid domain' }, { status: 400 })
  }

  const url = `https://${domain}${FEDERATION_DEFAULTS.wellKnownPath}`
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: ctrl.signal,
    })
    if (!res.ok) {
      return NextResponse.json({ error: `${domain} returned HTTP ${res.status}` }, { status: 502 })
    }
    return NextResponse.json(await res.json())
  } catch (err) {
    return NextResponse.json(
      { error: `${domain} unreachable`, detail: String(err) },
      { status: 502 },
    )
  } finally {
    clearTimeout(t)
  }
}
