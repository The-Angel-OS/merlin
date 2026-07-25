import { NextResponse, type NextRequest } from 'next/server'

/**
 * Public-hostname gate.
 *
 * Merlin's admin/API is fully open on localhost + LAN (trusted — Ken's laptop).
 * But merlin.payloadnuke.com is a public Cloudflare tunnel with no Access gate,
 * which exposed the whole UI (cameras, keys, leo, sentinel, logs) and a few
 * unauthenticated APIs (system, keys, cameras) to anyone with the URL.
 *
 * This gate fires ONLY on tunnel traffic and requires a valid Payload session
 * (the `payload-token` cookie the admin login already issues) — reusing Core's
 * exact auth. It is deliberately non-breaking for the machine mesh:
 *   - The destructive machine APIs already validate their own keys
 *     (backup=BACKUP_OPS_KEY, node/skill+snap=x-node-key, stream). Any request
 *     already carrying such a key header is passed straight through and the
 *     route does the real validation — so no existing caller needs changing.
 *   - Static assets + the login/health paths stay open so login itself works.
 *
 * Verify the Host assumption once:  curl -I https://merlin.payloadnuke.com/keys
 * → should 307 to /admin/login. If it doesn't, cloudflared is rewriting Host;
 * the cf-ray fallback below already covers that case.
 */

const PUBLIC_HOST = 'merlin.payloadnuke.com'

// Always reachable on the public host. The Payload auth endpoints must be open
// or the admin login flow can't authenticate (you can't log in if the login call
// itself is gated) — they're Payload's own access-controlled REST, not the
// unauthenticated custom routes this gate exists to protect.
const OPEN_PREFIXES = [
  '/admin',
  '/favicon',
  '/_next',
  '/api/health',
  '/api/access',
  '/api/users/login',
  '/api/users/logout',
  '/api/users/first-register',
  '/api/users/forgot-password',
  '/api/users/reset-password',
  '/api/users/refresh-token',
  '/api/users/me',
]

// Headers that mean "this is a keyed machine call" — let the route validate the
// actual key. Presence, not correctness, is enough here (wrong keys 401/403 downstream).
const MACHINE_HEADERS = ['x-node-key', 'x-ops-key', 'authorization']

function isTunnel(req: NextRequest): boolean {
  // Host match is primary; cf-ray is only set by the Cloudflare edge, so it
  // catches the tunnel even if cloudflared rewrites Host to localhost.
  return req.headers.get('host') === PUBLIC_HOST || req.headers.has('cf-ray')
}

// Ask Payload itself whether the cookie is a live session, rather than
// re-verifying its JWT signature here — edge-runtime secret matching proved
// fragile and mis-rejected valid tokens (redirect loop). /api/users/me is an
// OPEN_PREFIX, so this same-origin subrequest doesn't recurse through the gate.
async function hasValidSession(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get('payload-token')?.value
  if (!token) return false
  try {
    // Loopback, not req.nextUrl.origin — over the tunnel that origin is the
    // public URL, which would round-trip out through Cloudflare (and in dev hit
    // prod). ponytail: the appliance is always :3000.
    const res = await fetch('http://127.0.0.1:3000/api/users/me', {
      headers: { cookie: `payload-token=${token}` },
    })
    if (!res.ok) return false
    const data = (await res.json()) as { user?: unknown }
    return Boolean(data?.user)
  } catch {
    return false
  }
}

export async function middleware(req: NextRequest) {
  if (!isTunnel(req)) return NextResponse.next() // localhost / LAN — untouched

  const { pathname } = req.nextUrl
  if (OPEN_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next()

  // Machine mesh: keyed calls pass; the target route validates the key itself.
  if (MACHINE_HEADERS.some((h) => req.headers.has(h))) return NextResponse.next()

  if (await hasValidSession(req)) return NextResponse.next()

  // Unauthenticated human on the public host.
  if (pathname.startsWith('/api')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const login = new URL('/admin/login', req.url)
  login.searchParams.set('redirect', pathname)
  return NextResponse.redirect(login)
}

// ponytail: match everything except static output; the isTunnel() check inside
// is what actually scopes the gate, so the matcher just trims obvious noise.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
