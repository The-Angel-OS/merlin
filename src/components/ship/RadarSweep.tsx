'use client'
/**
 * RadarSweep — a pure-SVG rotating radar scope with procedurally generated
 * contacts. 100% client-side; no backend, no data dependencies.
 *
 * Visual: 4 concentric range rings, crosshair grid, a sweep wedge that spins
 * at `sweepSeconds` RPM, and up to `contactCount` blips that fade in when the
 * sweep passes over them and slowly fade out. All motion is requestAnimationFrame
 * driven so it stays smooth under React.
 */
import { useEffect, useRef, useState } from 'react'

interface Contact {
  id: number
  /** Radians, 0 = north, increases clockwise */
  bearing: number
  /** 0..1, fraction of scope radius */
  range: number
  /** 0..1, brightness at the moment the sweep touched it */
  intensity: number
  /** Last time (ms) the sweep touched it */
  lastHitAt: number
}

export function RadarSweep({
  size = 320,
  sweepSeconds = 4,
  contactCount = 7,
  color = 'var(--lcars-amber)',
  label = 'SENSOR SWEEP · FWD',
}: {
  size?: number
  sweepSeconds?: number
  contactCount?: number
  color?: string
  label?: string
}) {
  const sweepRef = useRef<SVGGElement>(null)
  const rafRef = useRef<number>(0)
  const startRef = useRef<number>(0)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [, force] = useState(0)

  // Seed contacts once
  useEffect(() => {
    const seed: Contact[] = Array.from({ length: contactCount }, (_, i) => ({
      id: i,
      bearing: Math.random() * Math.PI * 2,
      range: 0.25 + Math.random() * 0.7,
      intensity: 0,
      lastHitAt: 0,
    }))
    setContacts(seed)
  }, [contactCount])

  // Animation loop
  useEffect(() => {
    let running = true
    const tick = (t: number) => {
      if (!running) return
      if (!startRef.current) startRef.current = t
      const elapsed = (t - startRef.current) / 1000
      const angle = ((elapsed / sweepSeconds) * Math.PI * 2) % (Math.PI * 2)
      if (sweepRef.current) {
        sweepRef.current.setAttribute('transform', `rotate(${(angle * 180) / Math.PI})`)
      }
      // For each contact, check if sweep just passed over it
      setContacts((prev) =>
        prev.map((c) => {
          const delta = Math.abs(((c.bearing - angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI)
          // If sweep is within ~3° of contact, refresh intensity
          if (delta > Math.PI - 0.05) {
            // Contacts occasionally drift a hair to keep it alive
            const drifted =
              Math.random() < 0.08
                ? {
                    bearing: (c.bearing + (Math.random() - 0.5) * 0.1 + Math.PI * 2) % (Math.PI * 2),
                    range: Math.max(0.2, Math.min(0.95, c.range + (Math.random() - 0.5) * 0.03)),
                  }
                : {}
            return { ...c, ...drifted, intensity: 1, lastHitAt: t }
          }
          // Fade over ~2s
          const age = (t - c.lastHitAt) / 2000
          return { ...c, intensity: Math.max(0, 1 - age) }
        }),
      )
      force((n) => (n + 1) % 1000)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      running = false
      cancelAnimationFrame(rafRef.current)
    }
  }, [sweepSeconds])

  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - 8

  // Contact screen coords: bearing 0 = north (up = -y)
  const contactXY = (c: Contact) => {
    const rad = c.range * r
    return {
      x: cx + Math.sin(c.bearing) * rad,
      y: cy - Math.cos(c.bearing) * rad,
    }
  }

  return (
    <div className="relative inline-block" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="block"
        aria-hidden
      >
        <defs>
          <radialGradient id="radarGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={color} stopOpacity="0.15" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </radialGradient>
          <linearGradient id="sweepGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={color} stopOpacity="0.7" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Background glow */}
        <circle cx={cx} cy={cy} r={r} fill="url(#radarGlow)" />

        {/* Range rings */}
        {[0.25, 0.5, 0.75, 1].map((k, i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r * k}
            fill="none"
            stroke={color}
            strokeOpacity={0.25}
            strokeWidth={1}
          />
        ))}

        {/* Crosshair */}
        <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} stroke={color} strokeOpacity={0.18} />
        <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} stroke={color} strokeOpacity={0.18} />

        {/* Bearing ticks every 30° */}
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i * Math.PI) / 6
          const x1 = cx + Math.sin(a) * (r - 6)
          const y1 = cy - Math.cos(a) * (r - 6)
          const x2 = cx + Math.sin(a) * r
          const y2 = cy - Math.cos(a) * r
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeOpacity={0.4} />
        })}

        {/* Rotating sweep wedge (origin at center) */}
        <g transform={`translate(${cx} ${cy})`}>
          <g ref={sweepRef}>
            <path
              d={`M 0 0 L 0 ${-r} A ${r} ${r} 0 0 1 ${Math.sin(Math.PI / 6) * r} ${-Math.cos(Math.PI / 6) * r} Z`}
              fill="url(#sweepGrad)"
            />
            <line x1={0} y1={0} x2={0} y2={-r} stroke={color} strokeWidth={1.5} strokeOpacity={0.9} />
          </g>
        </g>

        {/* Contacts */}
        {contacts.map((c) => {
          const { x, y } = contactXY(c)
          if (c.intensity <= 0.02) return null
          return (
            <g key={c.id} opacity={c.intensity}>
              <circle cx={x} cy={y} r={2 + c.intensity * 4} fill={color} />
              <circle cx={x} cy={y} r={2 + c.intensity * 8} fill="none" stroke={color} strokeOpacity={0.4} />
            </g>
          )
        })}

        {/* Center dot */}
        <circle cx={cx} cy={cy} r={2} fill={color} />
      </svg>

      {/* Label */}
      <div
        className="absolute bottom-1 left-1/2 -translate-x-1/2 font-mono text-[9px] uppercase tracking-[0.2em]"
        style={{ color }}
      >
        {label}
      </div>
    </div>
  )
}
