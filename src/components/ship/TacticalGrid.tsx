'use client'
/**
 * TacticalGrid — SVG top-down tactical plot.
 *
 * Ship at center. Contacts drift along straight-line vectors, wrap around
 * when they exit the bounds. Each contact is classified (friend/foe/neutral)
 * and rendered with a distinct shape + color + trailing line.
 */
import { useEffect, useRef, useState } from 'react'

type Allegiance = 'friend' | 'foe' | 'neutral'

interface Track {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  allegiance: Allegiance
  callsign: string
}

const COLORS: Record<Allegiance, string> = {
  friend: 'var(--lcars-blue)',
  foe: 'var(--lcars-red)',
  neutral: 'var(--lcars-amber)',
}

function randomTrack(id: number, w: number, h: number): Track {
  const roles: Allegiance[] = ['friend', 'friend', 'neutral', 'foe']
  const role = roles[Math.floor(Math.random() * roles.length)]
  return {
    id,
    x: Math.random() * w,
    y: Math.random() * h,
    vx: (Math.random() - 0.5) * 0.25,
    vy: (Math.random() - 0.5) * 0.25,
    allegiance: role,
    callsign: `${role[0].toUpperCase()}-${(id + 100).toString(16).toUpperCase()}`,
  }
}

export function TacticalGrid({
  width = 480,
  height = 280,
  trackCount = 9,
}: {
  width?: number
  height?: number
  trackCount?: number
}) {
  const [tracks, setTracks] = useState<Track[]>([])
  const rafRef = useRef(0)

  useEffect(() => {
    setTracks(Array.from({ length: trackCount }, (_, i) => randomTrack(i, width, height)))
  }, [trackCount, width, height])

  useEffect(() => {
    let running = true
    const tick = () => {
      if (!running) return
      setTracks((prev) =>
        prev.map((t) => {
          let { x, y } = t
          x += t.vx
          y += t.vy
          if (x < 0) x = width
          if (x > width) x = 0
          if (y < 0) y = height
          if (y > height) y = 0
          return { ...t, x, y }
        }),
      )
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      running = false
      cancelAnimationFrame(rafRef.current)
    }
  }, [width, height])

  const cx = width / 2
  const cy = height / 2

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block rounded-md border border-white/10 bg-[#05050a]"
    >
      {/* Grid */}
      <defs>
        <pattern id="tacGrid" width="32" height="32" patternUnits="userSpaceOnUse">
          <path d="M 32 0 L 0 0 0 32" fill="none" stroke="rgba(153,204,255,0.08)" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width={width} height={height} fill="url(#tacGrid)" />

      {/* Concentric range circles */}
      {[60, 120, 180].map((r) => (
        <circle
          key={r}
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="rgba(153,204,255,0.12)"
          strokeDasharray="2 4"
        />
      ))}

      {/* Crosshair */}
      <line x1={0} y1={cy} x2={width} y2={cy} stroke="rgba(153,204,255,0.12)" />
      <line x1={cx} y1={0} x2={cx} y2={height} stroke="rgba(153,204,255,0.12)" />

      {/* Own ship */}
      <g>
        <circle cx={cx} cy={cy} r={7} fill="var(--lcars-amber)" opacity={0.25} />
        <circle cx={cx} cy={cy} r={3.5} fill="var(--lcars-amber)" />
        <text
          x={cx + 8}
          y={cy - 6}
          fill="var(--lcars-amber)"
          fontSize="9"
          fontFamily="monospace"
        >
          SELF
        </text>
      </g>

      {/* Tracks */}
      {tracks.map((t) => {
        const color = COLORS[t.allegiance]
        // velocity indicator line
        const lx = t.x + t.vx * 40
        const ly = t.y + t.vy * 40
        return (
          <g key={t.id}>
            <line x1={t.x} y1={t.y} x2={lx} y2={ly} stroke={color} strokeOpacity={0.5} />
            {t.allegiance === 'foe' ? (
              // Red diamond for hostile
              <polygon
                points={`${t.x},${t.y - 5} ${t.x + 5},${t.y} ${t.x},${t.y + 5} ${t.x - 5},${t.y}`}
                fill={color}
                stroke={color}
              />
            ) : t.allegiance === 'friend' ? (
              // Blue circle for friendly
              <circle cx={t.x} cy={t.y} r={4} fill="none" stroke={color} strokeWidth={1.5} />
            ) : (
              // Amber square for neutral
              <rect x={t.x - 4} y={t.y - 4} width={8} height={8} fill="none" stroke={color} strokeWidth={1.5} />
            )}
            <text x={t.x + 7} y={t.y + 3} fill={color} fontSize="8" fontFamily="monospace">
              {t.callsign}
            </text>
          </g>
        )
      })}

      {/* Label */}
      <text x={10} y={16} fill="rgba(255,255,255,0.4)" fontSize="9" fontFamily="monospace" letterSpacing="2">
        TACTICAL PLOT · XY
      </text>
    </svg>
  )
}
