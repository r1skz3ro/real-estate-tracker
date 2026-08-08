import { useEffect, useRef } from 'react'

const AUTO_READ_MS = 1000

// Native IntersectionObserver — armed only while the section still has unread events, so it tears
// itself down once the invalidated query comes back read.
export function useAutoRead(
  ref: React.RefObject<HTMLElement | null>,
  active: boolean,
  onRead: () => void,
) {
  const done = useRef(false)
  useEffect(() => {
    const el = ref.current
    if (!el || !active) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting)
        timer = setTimeout(() => {
          if (done.current) return
          done.current = true
          onRead()
        }, AUTO_READ_MS)
      else clearTimeout(timer)
    })
    observer.observe(el)
    return () => {
      clearTimeout(timer)
      observer.disconnect()
    }
  }, [ref, active, onRead])
}
