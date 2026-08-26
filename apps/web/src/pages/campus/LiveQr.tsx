import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Maximize2, Users } from 'lucide-react'
import { QrDisplay, QrCountdown, useRotatingQr } from '../../components/campus/QrDisplay'
import { Button } from '../../components/ui/Button'
import { attendanceApi, sessionsApi } from '../../api/campus'
import { getErrorMessage } from '../../lib/api'

/**
 * The projected code, staff side.
 *
 * Deliberately not inside DashboardLayout: this goes on a projector in front of
 * a lecture hall, and a sidebar full of admin links is both noise and a small
 * privacy leak in a room of two hundred people. It is its own full-bleed route.
 *
 * This page uses the staff token against /api/sessions/:id/qr. When
 * QR_ENDPOINT_STAFF_ONLY is turned on, staff keep projecting codes and students
 * lose the ability to mint their own codes, which is the purpose of the guard.
 */
export function LiveQr() {
  const { id = '' } = useParams()
  const [fullscreen, setFullscreen] = useState(false)

  const { data: session } = useQuery({
    queryKey: ['campus', 'session', id],
    queryFn: () => sessionsApi.get(id),
    enabled: Boolean(id),
  })

  const { data: attendance = [] } = useQuery({
    queryKey: ['campus', 'session', id, 'attendance'],
    queryFn: () => attendanceApi.bySession(id),
    enabled: Boolean(id),
    refetchInterval: 10_000,
  })

  const isOpen = session?.status !== 'CLOSED'

  const { token, secondsLeft, error } = useRotatingQr(
    () => sessionsApi.qr(id),
    { enabled: Boolean(id) && isOpen }
  )

  // Bigger on a projector, smaller on a phone held up at the front of the room.
  const [size, setSize] = useState(360)

  useEffect(() => {
    const resize = () =>
      setSize(Math.min(560, Math.max(240, Math.floor(window.innerHeight * 0.45))))

    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  const attended = attendance.filter((row) => row.status !== 'ABSENT').length

  return (
    <div className="flex min-h-screen flex-col bg-slate-900 text-white">
      <header className="flex items-center justify-between gap-4 p-4 sm:p-6">
        <Link to={`/sessions/${id}`}>
          <Button variant="ghost" icon={ArrowLeft} className="!text-slate-300">
            Back to session
          </Button>
        </Link>

        <button
          onClick={() => {
            setFullscreen((current) => !current)
            if (!document.fullscreenElement) {
              void document.documentElement.requestFullscreen?.()
            } else {
              void document.exitFullscreen?.()
            }
          }}
          className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          aria-label="Toggle full screen"
          title={fullscreen ? 'Exit full screen' : 'Full screen'}
        >
          <Maximize2 className="h-5 w-5" />
        </button>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-6 p-4 text-center">
        <div>
          <h1 className="text-2xl font-bold sm:text-4xl">
            {session?.course?.courseCode ?? session?.title ?? 'Attendance'}
          </h1>
          <p className="mt-2 text-slate-400 sm:text-lg">
            {session?.course?.courseName ?? 'Scan to register your attendance'}
          </p>
        </div>

        {!isOpen ? (
          <div className="rounded-xl bg-slate-800 px-8 py-10">
            <p className="text-xl font-medium">This session is closed</p>
            <p className="mt-2 text-slate-400">
              Nobody can scan into it any more.
            </p>
          </div>
        ) : error ? (
          <div className="max-w-md rounded-xl bg-danger-500/10 px-8 py-10 text-danger-200">
            <p className="font-medium">The code could not be refreshed</p>
            <p className="mt-2 text-sm">{getErrorMessage(error)}</p>
          </div>
        ) : (
          <>
            <div className="rounded-2xl bg-white p-4 shadow-2xl">
              <QrDisplay token={token} size={size} />
            </div>
            <QrCountdown seconds={secondsLeft} />
          </>
        )}

        <div className="flex items-center gap-2 rounded-full bg-slate-800 px-5 py-2.5 text-lg">
          <Users className="h-5 w-5 text-slate-400" />
          <span className="font-semibold">{attended}</span>
          <span className="text-slate-400">scanned in</span>
        </div>

        {session?.room && (
          <p className="text-sm text-slate-500">Room {session.room}</p>
        )}
      </main>
    </div>
  )
}
