'use client'
/**
 * Global error boundary — surfaces the actual exception text so it's
 * diagnosable in the field (LG TV, LAN IP, no devtools) instead of the
 * default Next.js "Application error: a client-side exception has occurred"
 * brick wall.
 */
import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Mirror to console for remote-inspected sessions.
    console.error('[merlin] client exception:', error)
  }, [error])

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        background: '#0a0a14',
        color: '#ededed',
      }}
    >
      <div style={{ maxWidth: '640px', width: '100%' }}>
        <div style={{ color: '#f5a623', fontSize: '0.85rem', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>
          MERLIN · CLIENT EXCEPTION
        </div>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem', fontWeight: 600 }}>
          Something threw in the render tree.
        </h1>
        <pre
          style={{
            background: '#111122',
            border: '1px solid rgba(245, 166, 35, 0.25)',
            padding: '1rem',
            borderRadius: '8px',
            fontSize: '0.8rem',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: '40vh',
            overflow: 'auto',
          }}
        >
          {error.name}: {error.message}
          {error.stack ? `\n\n${error.stack}` : ''}
          {error.digest ? `\n\ndigest: ${error.digest}` : ''}
        </pre>
        <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={reset}
            style={{
              background: '#f5a623',
              color: '#0a0a14',
              border: 'none',
              padding: '0.6rem 1.2rem',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
          <button
            onClick={() => { window.location.href = '/' }}
            style={{
              background: 'transparent',
              color: '#ededed',
              border: '1px solid rgba(255,255,255,0.2)',
              padding: '0.6rem 1.2rem',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            Home
          </button>
        </div>
        <div style={{ marginTop: '1.5rem', fontSize: '0.75rem', color: '#7788aa' }}>
          If you&apos;re accessing this over a LAN IP (not localhost or HTTPS), some
          browser APIs (crypto.subtle, geolocation, service workers) are unavailable
          — that&apos;s often the cause.
        </div>
      </div>
    </div>
  )
}
