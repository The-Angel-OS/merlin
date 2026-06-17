'use client'
/**
 * WarpField — canvas starfield warp effect for ship backgrounds.
 *
 * 300 stars fly outward from center with accelerating velocity, creating a
 * "warp speed" illusion. Used as an absolute-positioned background layer
 * behind CIC / Bridge content.
 */
import { useEffect, useRef } from 'react'

export function WarpField({
  density = 240,
  speed = 0.6,
  color = '#99ccff',
}: {
  density?: number
  speed?: number
  color?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let running = true
    let w = 0
    let h = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      w = rect.width
      h = rect.height
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.scale(dpr, dpr)
    }
    resize()
    window.addEventListener('resize', resize)

    // Seed stars in a disc around center
    type Star = { x: number; y: number; z: number; pz: number }
    const stars: Star[] = Array.from({ length: density }, () => ({
      x: (Math.random() - 0.5) * w,
      y: (Math.random() - 0.5) * h,
      z: Math.random() * w,
      pz: 0,
    }))

    const tick = () => {
      if (!running) return
      ctx.fillStyle = 'rgba(10, 10, 20, 0.35)'
      ctx.fillRect(0, 0, w, h)

      ctx.save()
      ctx.translate(w / 2, h / 2)

      for (const s of stars) {
        s.pz = s.z
        s.z -= speed * 4
        if (s.z < 1) {
          s.x = (Math.random() - 0.5) * w
          s.y = (Math.random() - 0.5) * h
          s.z = w
          s.pz = s.z
        }
        const sx = (s.x / s.z) * (w / 2)
        const sy = (s.y / s.z) * (h / 2)
        const psx = (s.x / s.pz) * (w / 2)
        const psy = (s.y / s.pz) * (h / 2)
        const size = (1 - s.z / w) * 2.2
        ctx.strokeStyle = color
        ctx.globalAlpha = Math.min(1, 1 - s.z / w)
        ctx.lineWidth = size
        ctx.beginPath()
        ctx.moveTo(psx, psy)
        ctx.lineTo(sx, sy)
        ctx.stroke()
      }
      ctx.restore()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [density, speed, color])

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
}
