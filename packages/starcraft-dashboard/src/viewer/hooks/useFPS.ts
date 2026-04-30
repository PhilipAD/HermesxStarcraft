import { useRef, useEffect } from 'react'
import { useDashboardStore } from '../store'

export function useFPS() {
  const frameCount = useRef(0)
  const lastTime = useRef(performance.now())
  const rafId = useRef<number>(0)
  const { setFPS } = useDashboardStore.getState()

  useEffect(() => {
    const tick = () => {
      frameCount.current++
      const now = performance.now()
      const elapsed = now - lastTime.current
      
      if (elapsed >= 1000) {
        const fps = Math.round((frameCount.current * 1000) / elapsed)
        setFPS(fps)
        frameCount.current = 0
        lastTime.current = now
      }
      
      rafId.current = requestAnimationFrame(tick)
    }
    
    rafId.current = requestAnimationFrame(tick)
    
    return () => cancelAnimationFrame(rafId.current)
  }, [setFPS])
}
