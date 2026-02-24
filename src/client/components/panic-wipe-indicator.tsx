import { useEffect, useState } from 'react'
import { initPanicWipe } from '@/lib/panic-wipe'

/**
 * Full-screen red flash overlay shown during panic wipe.
 * Mounted at root layout level — provides visual confirmation
 * that the wipe is executing.
 */
export function PanicWipeIndicator() {
  const [wiping, setWiping] = useState(false)

  useEffect(() => {
    const cleanup = initPanicWipe(() => setWiping(true))
    return cleanup
  }, [])

  if (!wiping) return null

  return (
    <div
      className="fixed inset-0 z-[9999] bg-red-600 opacity-80 pointer-events-none"
      role="alert"
      aria-live="assertive"
      data-testid="panic-wipe-overlay"
    />
  )
}
