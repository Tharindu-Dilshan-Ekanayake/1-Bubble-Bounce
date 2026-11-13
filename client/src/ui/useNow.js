import { useEffect, useState } from 'react'

/**
 * Current time, refreshed every `intervalMs`. For countdowns: only the component that
 * shows the timer re-renders, at the rate it actually needs.
 */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

export default useNow
