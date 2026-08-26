import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { cn } from '../../lib/utils'

/**
 * A rotating attendance code on a canvas.
 *
 * ── The refresh cadence, and why it is not the expiry ──────────────────────
 *
 * A QR token expires 30 seconds after the server signs it (qr.util.ts). This
 * refreshes at 25, and the five-second margin is the whole point: it covers the
 * round trip, a slow network, and the seconds between a student raising their
 * phone and the scan landing. Refreshing at 30 would mean every cycle ends with
 * a code that is already dead on screen.
 *
 * ── Why the short expiry exists at all ─────────────────────────────────────
 *
 * A QR token is an ordinary JWT: anyone who reads one can decode its payload
 * without a secret. The 30-second life is what stops a photographed code being
 * forwarded to a friend across campus — it is the only thing standing between
 * this system and proxy attendance, which is why nothing here caches a token or
 * holds one past its refresh.
 */
export function QrDisplay({
  token,
  size = 320,
  className,
}: {
  token: string | null
  size?: number
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current

    if (!canvas || !token) return

    QRCode.toCanvas(canvas, token, {
      width: size,
      margin: 1,
      // Maximum error correction: these are read across a lecture hall, at an
      // angle, off a screen that may be reflecting a window.
      errorCorrectionLevel: 'H',
      color: { dark: '#0f172a', light: '#ffffff' },
    }).catch(() => setError('Could not render the code'))
  }, [token, size])

  if (error) {
    return (
      <div
        className="flex items-center justify-center rounded-xl bg-danger-50 p-6 text-sm text-danger-700"
        style={{ width: size, height: size }}
      >
        {error}
      </div>
    )
  }

  return (
    <div className={cn('relative', className)}>
      <canvas
        ref={canvasRef}
        className={cn(
          'rounded-xl bg-white transition-opacity',
          token ? 'opacity-100' : 'opacity-0'
        )}
        style={{ width: size, height: size }}
      />
      {!token && (
        <div
          className="absolute inset-0 animate-pulse rounded-xl bg-slate-200"
          style={{ width: size, height: size }}
        />
      )}
    </div>
  )
}

/**
 * Counts down to the next refresh.
 *
 * Shown because a code that silently swaps itself looks broken to a student
 * halfway through raising their phone — the countdown tells them whether to
 * scan now or wait two seconds for the next one.
 */
export function QrCountdown({ seconds }: { seconds: number }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-500">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success-500 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-success-600" />
      </span>
      New code in {seconds}s
    </div>
  )
}

/**
 * Fetches a token, then keeps fetching one every `intervalMs`.
 *
 * The fetcher is passed in rather than chosen here so the same display can be
 * reused by any staff-owned session view without coupling this component to a
 * specific API route.
 */
export function useRotatingQr(
  fetchToken: () => Promise<{ token: string }>,
  options: { enabled?: boolean; intervalMs?: number } = {}
) {
  const { enabled = true, intervalMs = 25_000 } = options

  const [token, setToken] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(intervalMs / 1000)
  const [error, setError] = useState<unknown>(null)

  // Held in a ref so changing the fetcher identity between renders does not
  // restart the rotation — otherwise every parent re-render would mint a new
  // code and the countdown would never reach zero.
  const fetcherRef = useRef(fetchToken)
  fetcherRef.current = fetchToken

  useEffect(() => {
    if (!enabled) {
      setToken(null)
      return
    }

    let cancelled = false

    const refresh = async () => {
      try {
        const result = await fetcherRef.current()

        if (!cancelled) {
          setToken(result.token)
          setSecondsLeft(intervalMs / 1000)
          setError(null)
        }
      } catch (caught) {
        if (!cancelled) setError(caught)
      }
    }

    void refresh()

    const rotation = setInterval(refresh, intervalMs)
    const tick = setInterval(
      () => setSecondsLeft((current) => (current > 0 ? current - 1 : 0)),
      1000
    )

    return () => {
      cancelled = true
      clearInterval(rotation)
      clearInterval(tick)
    }
  }, [enabled, intervalMs])

  return { token, secondsLeft, error }
}
