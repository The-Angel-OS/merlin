'use client'
/**
 * BarMeter — LCARS-style segmented bar meter.
 *
 * 20 segments fill based on `value` (0-100). The value animates smoothly
 * toward a target that drifts randomly every ~2s to simulate a live system
 * readout. Useful for shields, power, coolant, hull integrity, etc.
 */
import { useEffect, useState } from 'react'

export function BarMeter({
  label,
  color = 'var(--lcars-amber)',
  segments = 20,
  min = 40,
  max = 100,
  targetSeed,
  unit = '%',
}: {
  label: string
  color?: string
  segments?: number
  min?: number
  max?: number
  targetSeed?: number
  unit?: string
}) {
  const [value, setValue] = useState(() => min + Math.random() * (max - min))
  const [target, setTarget] = useState(() => min + Math.random() * (max - min))

  // Drift target
  useEffect(() => {
    const id = setInterval(
      () => {
        setTarget(min + Math.random() * (max - min))
      },
      1800 + (targetSeed ?? 0) * 300,
    )
    return () => clearInterval(id)
  }, [min, max, targetSeed])

  // Smooth value toward target
  useEffect(() => {
    let raf = 0
    const tick = () => {
      setValue((v) => {
        const delta = target - v
        if (Math.abs(delta) < 0.1) return v
        return v + delta * 0.04
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target])

  const filled = Math.round((value / 100) * segments)

  return (
    <div className="flex items-center gap-2 font-mono text-[10px] uppercase">
      <div className="w-20 shrink-0 tracking-widest text-white/60">{label}</div>
      <div className="flex flex-1 gap-[2px]">
        {Array.from({ length: segments }, (_, i) => {
          const on = i < filled
          return (
            <div
              key={i}
              className="h-3 flex-1 rounded-[1px] transition-colors"
              style={{
                background: on ? color : 'rgba(255,255,255,0.06)',
                boxShadow: on ? `0 0 4px ${color}` : 'none',
              }}
            />
          )
        })}
      </div>
      <div
        className="w-12 shrink-0 text-right tabular-nums"
        style={{ color }}
      >
        {value.toFixed(0)}
        {unit}
      </div>
    </div>
  )
}
