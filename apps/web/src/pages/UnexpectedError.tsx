import { AlertTriangle } from 'lucide-react'
import { Link } from 'react-router-dom'

export function UnexpectedError({
  onReset,
}: {
  onReset?: () => void
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 text-center card-shadow">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-danger-50">
          <AlertTriangle className="h-7 w-7 text-danger-600" />
        </div>
        <h1 className="mt-4 text-2xl font-semibold text-slate-900">Unexpected error</h1>
        <p className="mt-2 text-sm text-slate-500">
          This screen crashed before it could finish rendering. You can try again
          or return to the main dashboard.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={onReset}
            className="rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-700"
          >
            Try again
          </button>
          <Link
            to="/"
            className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  )
}
