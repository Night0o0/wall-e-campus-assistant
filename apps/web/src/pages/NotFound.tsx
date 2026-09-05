import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'

export function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center card-shadow">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary-50">
          <Compass className="h-7 w-7 text-primary-600" />
        </div>
        <h1 className="mt-4 text-2xl font-semibold text-slate-900">Page not found</h1>
        <p className="mt-2 text-sm text-slate-500">
          The page you asked for does not exist in this web application.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-700"
        >
          Go home
        </Link>
      </div>
    </div>
  )
}
