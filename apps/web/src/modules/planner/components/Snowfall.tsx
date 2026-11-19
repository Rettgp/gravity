import { useEffect, useRef } from 'react'

type Flake = { x: number; y: number; r: number; vy: number; phase: number; sway: number; o: number; c: string }

/**
 * Lightweight canvas snowfall; pauses when the tab is hidden, static under reduced motion.
 * Pass `confetti` colors to draw tumbling paper bits instead of snow.
 */
export function Snowfall({ density = 1, confetti }: { density?: number; confetti?: string[] }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let flakes: Flake[] = []
    let w = 0
    let h = 0
    let raf = 0
    let last = performance.now()

    const make = (y?: number): Flake => ({
      x: Math.random() * w,
      y: y ?? Math.random() * h,
      r: 0.8 + Math.random() * 2.6,
      vy: 18 + Math.random() * 42,
      phase: Math.random() * Math.PI * 2,
      sway: 10 + Math.random() * 30,
      o: confetti ? 0.7 + Math.random() * 0.3 : 0.35 + Math.random() * 0.6,
      c: confetti ? confetti[Math.floor(Math.random() * confetti.length)]! : 'rgb(255, 252, 246)',
    })

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const count = Math.round(Math.min(160, (w * h) / 9000) * density)
      flakes = Array.from({ length: count }, () => make())
    }

    const draw = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000)
      last = t
      ctx.clearRect(0, 0, w, h)
      for (const f of flakes) {
        if (!reduce) {
          f.y += f.vy * dt
          f.phase += dt * 0.8
          if (f.y > h + 5) Object.assign(f, make(-5))
        }
        const x = f.x + Math.sin(f.phase) * f.sway
        ctx.globalAlpha = f.o
        ctx.fillStyle = f.c
        if (confetti) {
          ctx.save()
          ctx.translate(x, f.y)
          ctx.rotate(f.phase * 3)
          ctx.scale(1, Math.cos(f.phase * 4)) // flip like a falling paper bit
          ctx.fillRect(-f.r * 1.4, -f.r * 0.7, f.r * 2.8, f.r * 1.4)
          ctx.restore()
        } else {
          ctx.beginPath()
          ctx.arc(x, f.y, f.r, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      if (!reduce) raf = requestAnimationFrame(draw)
    }

    const onVis = () => {
      cancelAnimationFrame(raf)
      if (!document.hidden) {
        last = performance.now()
        raf = requestAnimationFrame(draw)
      }
    }

    resize()
    raf = requestAnimationFrame(draw)
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [density, confetti])

  return <canvas ref={ref} className="snow-canvas" aria-hidden />
}
