'use client'
/**
 * Ticker — scrolling telemetry feed. Lines bubble up from the bottom with
 * a fade-in, get pushed up, and fade out the top. Pure CSS animation.
 */
import { useEffect, useState } from 'react'

type LineSeed = { ts: string; tag: string; msg: string; tone: 'ok' | 'info' | 'warn' | 'fault' }

const LINES: readonly LineSeed[] = [
  { ts: '0000', tag: 'SENSORS', msg: 'scan cycle complete · 0 anomalies', tone: 'ok' },
  { ts: '0000', tag: 'COMMS', msg: 'federation heartbeat received · spacesangels.com · 42ms', tone: 'ok' },
  { ts: '0000', tag: 'PWR', msg: 'main bus nominal · 98.4% efficiency', tone: 'ok' },
  { ts: '0000', tag: 'LEO', msg: 'constitutional check passed · privacy posture GREEN', tone: 'ok' },
  { ts: '0000', tag: 'MEDIA', msg: 'stream session · Xanadu 1080p · LAN client 192.168.0.x', tone: 'info' },
  { ts: '0000', tag: 'SHIELDS', msg: 'harmonic resonance holding at 1.21 GW', tone: 'ok' },
  { ts: '0000', tag: 'NIMU', msg: 'soulquest index updated · 3 new entries', tone: 'info' },
  { ts: '0000', tag: 'MERLIN', msg: 'knowledge graph reindex · 1442 nodes', tone: 'info' },
  { ts: '0000', tag: 'WARN', msg: 'thermal gradient rising on deck 7 · compensating', tone: 'warn' },
  { ts: '0000', tag: 'DOCK', msg: 'mass inventory sync · DCIM · 0 conflicts', tone: 'ok' },
  { ts: '0000', tag: 'NAV', msg: 'course lock: Tampa Bay sector · holding pattern', tone: 'info' },
  { ts: '0000', tag: 'TAC', msg: 'all tracks classified · 3 friendlies · 1 neutral', tone: 'ok' },
] as const

type Line = LineSeed & { id: number }

const TONE_COLOR: Record<string, string> = {
  ok: 'var(--lcars-green)',
  info: 'var(--lcars-blue)',
  warn: 'var(--lcars-amber)',
  fault: 'var(--lcars-red)',
}

function stardate(): string {
  const d = new Date()
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  const s = d.getSeconds().toString().padStart(2, '0')
  return `${h}${m}.${s}`
}

export function Ticker({ max = 12 }: { max?: number }) {
  const [items, setItems] = useState<Line[]>([])

  useEffect(() => {
    let id = 0
    const push = () => {
      const src = LINES[Math.floor(Math.random() * LINES.length)]
      const next: Line = { ...src, id: id++, ts: stardate() }
      setItems((prev) => [next, ...prev].slice(0, max))
    }
    push()
    const iv = setInterval(push, 1400)
    return () => clearInterval(iv)
  }, [max])

  return (
    <div className="font-mono text-[10px] leading-relaxed">
      {items.map((it, idx) => (
        <div
          key={it.id}
          className="flex items-baseline gap-2 border-l-2 pl-2 transition-opacity"
          style={{
            borderColor: TONE_COLOR[it.tone],
            opacity: 1 - idx / max,
          }}
        >
          <span className="text-white/40">{it.ts}</span>
          <span className="w-16 shrink-0 uppercase" style={{ color: TONE_COLOR[it.tone] }}>
            {it.tag}
          </span>
          <span className="text-white/80">{it.msg}</span>
        </div>
      ))}
    </div>
  )
}
