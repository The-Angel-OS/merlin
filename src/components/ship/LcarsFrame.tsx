'use client'
/**
 * LcarsFrame — the iconic LCARS curved-corner panel used to wrap any child
 * content in a Federation-style bezel. Top-left elbow + color bar + label.
 */
import { ReactNode } from 'react'

export function LcarsFrame({
  children,
  title,
  corner = 'var(--lcars-amber)',
  accent = 'var(--lcars-blue-deep)',
  right,
  className = '',
}: {
  children: ReactNode
  title: string
  corner?: string
  accent?: string
  right?: ReactNode
  className?: string
}) {
  return (
    <div className={`relative ${className}`}>
      {/* Top row: curved elbow + title bar */}
      <div className="flex items-stretch gap-1">
        {/* Elbow — pseudo curved corner */}
        <div
          className="relative h-6 w-16 shrink-0"
          style={{
            background: corner,
            borderTopLeftRadius: 24,
            borderBottomLeftRadius: 0,
          }}
        >
          <div
            className="absolute right-0 top-0 h-3 w-3"
            style={{ background: 'var(--background)', borderBottomLeftRadius: 12 }}
          />
        </div>

        {/* Title bar */}
        <div
          className="flex flex-1 items-center justify-between px-3 font-mono text-[10px] uppercase tracking-[0.25em] text-black"
          style={{ background: corner }}
        >
          <span>{title}</span>
          {right}
        </div>
      </div>

      {/* Body */}
      <div className="flex items-stretch gap-1">
        {/* Left rail */}
        <div
          className="w-16 shrink-0"
          style={{
            background: accent,
          }}
        />
        {/* Content */}
        <div className="flex-1 border border-white/10 bg-[#0a0a14]/60 p-4 backdrop-blur-sm">
          {children}
        </div>
      </div>

      {/* Bottom cap */}
      <div className="flex items-stretch gap-1">
        <div
          className="h-3 w-16 shrink-0"
          style={{
            background: accent,
            borderBottomLeftRadius: 18,
          }}
        />
        <div className="h-1 flex-1" style={{ background: `${accent}66` }} />
      </div>
    </div>
  )
}
