import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Bot,
  Clock,
  LogOut,
  MapPin,
  RefreshCw,
  Users,
  WifiOff,
} from 'lucide-react'
import { QrDisplay, QrCountdown, useRotatingQr } from '../../components/campus/QrDisplay'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Field'
import { robotApi, type DeviceActiveSession } from '../../api/device'
import {
  deviceStorage,
  DEVICE_UNAUTHORIZED_EVENT,
  type DeviceCredential,
} from '../../lib/deviceApi'
import { getErrorMessage } from '../../lib/api'
import { cn } from '../../lib/utils'
import type { DeviceSelf } from '../../types/campus'

/**
 * The robot.
 *
 * ── It is an account, not a device ─────────────────────────────────────────
 *
 * Nothing here assumes a tablet, a kiosk, or any particular hardware. This is a
 * route in the ordinary web app; what makes it a robot is the credential it
 * holds. Put it on a wall-mounted screen, a spare laptop, or a phone propped
 * against a lectern — the platform is irrelevant and the code below never asks
 * what it is running on.
 *
 * ── Four states, and why each exists ───────────────────────────────────────
 *
 *   PAIRING  A credential has never been entered, or was cleared. The only
 *            state that ever asks a human for anything.
 *
 *   IDLE     Paired, authenticated, and no session is open. This is where the
 *            screen spends most of the day, which is why it is designed rather
 *            than left as an empty div.
 *
 *   PICKING  More than one session matches. A device bound to a room usually
 *            skips this, but two sessions can share a room, and an unbound
 *            device sees the whole university — so somebody has to choose, and
 *            guessing on their behalf would put the wrong course's code on a
 *            wall.
 *
 *   SHOWING  One session, its code, rotating every 25 seconds.
 *
 * A single session auto-selects. Making somebody tap through a list of one, in
 * front of a lecture hall, would be a worse default than any of the above.
 *
 * ── It cannot open attendance ──────────────────────────────────────────────
 *
 * There is no button for it and no endpoint behind one. A person opens the
 * session; this screen displays the code for what they opened.
 */

type Phase = 'BOOTING' | 'PAIRING' | 'READY'

export function RobotConsole() {
  const [phase, setPhase] = useState<Phase>('BOOTING')
  const [device, setDevice] = useState<DeviceSelf | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  /**
   * Exchange the stored credential for a fresh token.
   *
   * Called on boot and again whenever a request comes back 401 — the access
   * token lives fifteen minutes and a robot nobody is watching has to renew it
   * without help. Falling back to the pairing screen every quarter of an hour
   * would make the thing undeployable.
   */
  const authenticate = useCallback(async (credential: DeviceCredential) => {
    try {
      const result = await robotApi.authenticate(
        credential.deviceKeyId,
        credential.secret
      )

      deviceStorage.setToken(result.token)
      deviceStorage.setCredential(credential)
      setDevice(result.device)
      setAuthError(null)
      setPhase('READY')

      return true
    } catch (caught) {
      setAuthError(getErrorMessage(caught))
      return false
    }
  }, [])

  useEffect(() => {
    const credential = deviceStorage.getCredential()

    if (!credential) {
      setPhase('PAIRING')
      return
    }

    void authenticate(credential).then((ok) => {
      // A stored credential that no longer works means the device was revoked
      // or its secret rotated. Ask for a new one rather than retrying forever.
      if (!ok) setPhase('PAIRING')
    })
  }, [authenticate])

  // Silent renewal. The credential is still on the device, so this costs the
  // operator nothing and the screen never goes blank mid-lecture.
  useEffect(() => {
    const handle = () => {
      const credential = deviceStorage.getCredential()

      if (credential) void authenticate(credential)
    }

    window.addEventListener(DEVICE_UNAUTHORIZED_EVENT, handle)
    return () => window.removeEventListener(DEVICE_UNAUTHORIZED_EVENT, handle)
  }, [authenticate])

  const unpair = () => {
    deviceStorage.clear()
    setDevice(null)
    setSelectedId(null)
    setPhase('PAIRING')
  }

  if (phase === 'BOOTING') {
    return (
      <RobotShell>
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-16 w-16 animate-pulse items-center justify-center rounded-2xl bg-slate-800">
            <Bot className="h-9 w-9 text-slate-400" />
          </div>
          <p className="text-slate-400">Starting up…</p>
        </div>
      </RobotShell>
    )
  }

  if (phase === 'PAIRING') {
    return <PairingScreen error={authError} onPair={authenticate} />
  }

  return (
    <SessionScreen
      device={device}
      selectedId={selectedId}
      onSelect={setSelectedId}
      onUnpair={unpair}
    />
  )
}

function RobotShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-900 p-6 text-white">
      {children}
    </div>
  )
}

function PairingScreen({
  error,
  onPair,
}: {
  error: string | null
  onPair: (credential: DeviceCredential) => Promise<boolean>
}) {
  const [form, setForm] = useState({ deviceKeyId: '', secret: '' })
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    await onPair({ deviceKeyId: form.deviceKeyId.trim(), secret: form.secret })
    setBusy(false)
  }

  return (
    <RobotShell>
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl gradient-primary">
            <Bot className="h-9 w-9 text-white" />
          </div>
          <h1 className="mt-4 text-2xl font-bold">Pair this screen</h1>
          <p className="mt-2 text-sm text-slate-400">
            Enter the credential from Robot Devices in the university console.
            It is asked for once.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">
              Device key id
            </label>
            <Input
              required
              autoFocus
              autoComplete="off"
              spellCheck={false}
              value={form.deviceKeyId}
              onChange={(event) =>
                setForm({ ...form, deviceKeyId: event.target.value })
              }
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">
              Device secret
            </label>
            <Input
              required
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={form.secret}
              onChange={(event) => setForm({ ...form, secret: event.target.value })}
            />
          </div>

          {error && (
            <p className="rounded-lg bg-danger-500/10 px-4 py-3 text-sm text-danger-200">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" loading={busy}>
            Pair this screen
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          This screen only displays codes for sessions a member of staff has
          already opened. It cannot start attendance.
        </p>
      </div>
    </RobotShell>
  )
}

function SessionScreen({
  device,
  selectedId,
  onSelect,
  onUnpair,
}: {
  device: DeviceSelf | null
  selectedId: string | null
  onSelect: (id: string | null) => void
  onUnpair: () => void
}) {
  const { data, error, refetch, isLoading } = useQuery({
    queryKey: ['robot', 'active-sessions'],
    queryFn: robotApi.activeSessions,
    // A lecture starting is the event this screen exists to react to, and
    // nobody is going to press refresh.
    refetchInterval: 20_000,
  })

  const sessions = data?.sessions ?? []

  // One session needs no decision; the picker is for the genuinely ambiguous
  // case. Re-run whenever the list changes so a lecture ending hands over
  // cleanly to the next one.
  const selected =
    sessions.find((session) => session.id === selectedId) ??
    (sessions.length === 1 ? sessions[0] : null)

  // Depends on `data` rather than the derived array: `sessions` is rebuilt on
  // every render when the query has no data yet, which would make this effect
  // run continuously.
  useEffect(() => {
    if (!selectedId) return

    const stillOpen = (data?.sessions ?? []).some(
      (session) => session.id === selectedId
    )

    if (!stillOpen) onSelect(null)
  }, [data, selectedId, onSelect])

  return (
    <div className="flex min-h-screen flex-col bg-slate-900 text-white">
      <header className="flex items-center justify-between gap-4 border-b border-slate-800 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800">
            <Bot className="h-5 w-5 text-primary-400" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {device?.name ?? 'Robot'}
            </p>
            <p className="truncate text-xs text-slate-500">
              {device?.room ? `Room ${device.room}` : 'Serving every room'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => void refetch()}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label="Refresh"
            title="Refresh"
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </button>
          <button
            onClick={onUnpair}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-danger-400"
            aria-label="Unpair this screen"
            title="Unpair this screen"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center p-4 sm:p-6">
        {error ? (
          <Offline message={getErrorMessage(error)} onRetry={() => void refetch()} />
        ) : selected ? (
          <ShowingCode
            session={selected}
            onBack={sessions.length > 1 ? () => onSelect(null) : undefined}
          />
        ) : sessions.length > 1 ? (
          <Picker sessions={sessions} onPick={onSelect} />
        ) : (
          <Idle room={device?.room ?? null} expiredCount={data?.expiredCount ?? 0} />
        )}
      </main>
    </div>
  )
}

function Idle({
  room,
  expiredCount,
}: {
  room: string | null
  expiredCount: number
}) {
  return (
    <div className="max-w-lg text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-800">
        <Clock className="h-10 w-10 text-slate-500" />
      </div>
      <h1 className="mt-6 text-3xl font-bold">No lecture right now</h1>
      <p className="mt-3 text-slate-400">
        {room
          ? `Waiting for attendance to be opened in ${room}.`
          : 'Waiting for attendance to be opened anywhere in the university.'}
      </p>
      <p className="mt-6 text-sm text-slate-500">
        A code appears here as soon as an instructor opens a session. This screen
        cannot start one itself.
      </p>

      {expiredCount > 0 && (
        <p className="mt-6 rounded-lg bg-warning-500/10 px-4 py-3 text-sm text-warning-200">
          {expiredCount} session{expiredCount === 1 ? '' : 's'} finished but
          {expiredCount === 1 ? ' is' : ' are'} still marked open. Codes are
          withheld for them; somebody should check the attendance worker.
        </p>
      )}
    </div>
  )
}

function Picker({
  sessions,
  onPick,
}: {
  sessions: DeviceActiveSession[]
  onPick: (id: string) => void
}) {
  return (
    <div className="w-full max-w-2xl">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold">Which lecture?</h1>
        <p className="mt-2 text-slate-400">
          More than one session is open here. Pick the one this screen is for.
        </p>
      </div>

      <div className="space-y-3">
        {sessions.map((session) => (
          <button
            key={session.id}
            onClick={() => onPick(session.id)}
            className="flex w-full items-center justify-between gap-4 rounded-xl border border-slate-700 bg-slate-800 p-5 text-left transition-colors hover:border-primary-500 hover:bg-slate-700"
          >
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold">
                {session.lecture?.courseCode ??
                  session.course?.courseCode ??
                  session.title}
              </p>
              <p className="truncate text-sm text-slate-400">
                {session.lecture?.courseName ??
                  session.course?.courseName ??
                  'Ad-hoc session'}
              </p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                {session.room && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {session.room}
                  </span>
                )}
                {session.lecture && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {session.lecture.startTime}–{session.lecture.endTime}
                  </span>
                )}
                {session.lecture?.instructor && (
                  <span>{session.lecture.instructor}</span>
                )}
              </div>
            </div>

            <div className="shrink-0 text-right">
              <p className="text-2xl font-bold">{session.attendanceCount}</p>
              <p className="text-xs text-slate-500">scanned</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function ShowingCode({
  session,
  onBack,
}: {
  session: DeviceActiveSession
  onBack?: () => void
}) {
  const [size, setSize] = useState(360)

  useEffect(() => {
    const resize = () =>
      setSize(Math.min(620, Math.max(220, Math.floor(window.innerHeight * 0.42))))

    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  const { token, secondsLeft, error } = useRotatingQr(() =>
    robotApi.qr(session.id)
  )

  if (error) {
    return (
      <Offline
        message={getErrorMessage(error)}
        onRetry={() => window.location.reload()}
      />
    )
  }

  return (
    <div className="flex w-full flex-col items-center gap-6 text-center">
      <div>
        <h1 className="text-3xl font-bold sm:text-5xl">
          {session.lecture?.courseCode ??
            session.course?.courseCode ??
            session.title}
        </h1>
        <p className="mt-2 text-slate-400 sm:text-xl">
          {session.lecture?.courseName ??
            session.course?.courseName ??
            'Scan to register your attendance'}
        </p>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-2xl">
        <QrDisplay token={token} size={size} />
      </div>

      <QrCountdown seconds={secondsLeft} />

      <div className="flex flex-wrap items-center justify-center gap-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-slate-800 px-5 py-2.5 text-lg">
          <Users className="h-5 w-5 text-slate-400" />
          <span className="font-semibold">{session.attendanceCount}</span>
          <span className="text-slate-400">scanned in</span>
        </span>

        {session.room && (
          <span className="inline-flex items-center gap-2 rounded-full bg-slate-800 px-5 py-2.5 text-slate-400">
            <MapPin className="h-4 w-4" />
            {session.room}
          </span>
        )}
      </div>

      {onBack && (
        <button
          onClick={onBack}
          className="text-sm text-slate-500 underline-offset-4 hover:text-slate-300 hover:underline"
        >
          Show a different lecture
        </button>
      )}
    </div>
  )
}

function Offline({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div className="max-w-md text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-danger-500/10">
        <WifiOff className="h-8 w-8 text-danger-400" />
      </div>
      <h1 className="mt-6 text-2xl font-bold">Cannot reach the server</h1>
      <p className="mt-3 text-sm text-slate-400">{message}</p>
      <Button className="mt-6" variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}
