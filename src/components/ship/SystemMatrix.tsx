'use client'
/**
 * SystemMatrix — a grid of pulsing cells representing subsystem health.
 *
 * Each cell independently cycles through random colored states (green=OK,
 * amber=warn, red=fault, blue=scan) with staggered timing. Creates a lively
 * "big board" status wall effect.
 */
import { useEffect, useState } from 'react'

type CellState = 'ok' | 'warn' | 'fault' | 'scan' | 'idle'

const COLORS: Record<CellState, string> = {
  ok: 'var(--lcars-green)',
  warn: 'var(--lcars-amber)',
  fault: 'var(--lcars-red)',
  scan: 'var(--lcars-blue)',
  idle: 'rgba(255,255,255,0.08)',
}

const WEIGHTS: Array<[CellState, number]> = [
  ['ok', 0.55],
  ['scan', 0.2],
  ['warn', 0.12],
  ['idle', 0.1],
  ['fault', 0.03],
]

function pick(): CellState {
  const r = Math.random()
  let acc = 0
  for (const [s, w] of WEIGHTS) {
    acc += w
    if (r < acc) return s
  }
  return 'ok'
}

export function SystemMatrix({
  rows = 6,
  cols = 12,
  label = 'SUBSYSTEM INTEGRITY',
}: {
  rows?: number
  cols?: number
  label?: string
}) {
  const total = rows * cols
  const [cells, setCells] = useState<CellState[]>(() => Array.from({ length: total }, pick))

  useEffect(() => {
    const id = setInterval(() => {
      setCells((prev) => {
        // Flip ~8% of cells each tick
        const next = prev.slice()
        const flipCount = Math.max(1, Math.floor(total * 0.08))
        for (let i = 0; i < flipCount; i++) {
          next[Math.floor(Math.random() * total)] = pick()
        }
        return next
      })
    }, 600)
    return () => clearInterval(id)
  }, [total])

  return (
    <div>
      <div className="mb-2 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.2em] text-white/50">
        <span>{label}</span>
        <span style={{ color: 'var(--lcars-green)' }}>
          {cells.filter((c) => c === 'ok').length}/{total} NOMINAL
        </span>
      </div>
      <div
        className="grid gap-[3px]"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      >
        {cells.map((c, i) => (
          <div
            key={i}
            className="aspect-square rounded-[2px] transition-all duration-500"
            style={{
              background: COLORS[c],
              boxShadow: c === 'idle' ? 'none' : `0 0 6px ${COLORS[c]}`,
              opacity: c === 'idle' ? 0.3 : 0.85,
            }}
          />
        ))}
      </div>
    </div>
  )
}
