'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Time (ms) inside a looping animation, updated every frame — but only while
 * the element is on screen. With "reduce motion" it stays at `still`.
 */
export function useLoop(loopMs: number, still: number) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [t, setT] = useState(still)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const el = ref.current
    let raf = 0
    let t0 = 0
    let running = false
    const tick = (now: number) => {
      if (!t0) t0 = now
      setT((now - t0) % loopMs)
      raf = requestAnimationFrame(tick)
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !running) {
          running = true
          t0 = 0
          raf = requestAnimationFrame(tick)
        } else if (!e.isIntersecting && running) {
          running = false
          cancelAnimationFrame(raf)
        }
      },
      { threshold: 0.2 }
    )
    if (el) io.observe(el)
    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [loopMs])
  return { ref, t }
}

/** True once the element has scrolled into view (stays true). */
export function useInView<T extends Element>() {
  const ref = useRef<T | null>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setSeen(true)
      return
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true)
          io.disconnect()
        }
      },
      { threshold: 0.35 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return { ref, seen }
}

/** First n letters of a text (by characters, not UTF-16 units). */
export function lettersOf(text: string, n: number): [string, string] {
  const chars = Array.from(text)
  const k = Math.max(0, Math.min(chars.length, Math.floor(n)))
  return [chars.slice(0, k).join(''), chars.slice(k).join('')]
}
