import { Download } from 'lucide-react'
import { resolveAndroidBetaDownloadUrl } from '../lib/androidBeta'

/**
 * The Android beta download entry point on the public landing page.
 *
 * Staff use the web console; students use the Android app, which ships as a
 * Firebase App Distribution beta. This renders a link to that distribution's
 * tester-invite URL — configured through `VITE_ANDROID_BETA_DOWNLOAD_URL`, not
 * hardcoded — and nothing at all when that value is missing or unsafe, so a
 * misconfigured deployment simply omits the button rather than showing a broken
 * or dangerous one.
 *
 * The link is opened in a new tab with `rel="noopener noreferrer"`, the safe
 * default for any external destination the site does not control.
 *
 * `rawUrl` defaults to the configured value and is a parameter only so the
 * tests can exercise the render without stubbing the whole environment.
 */
export function AndroidBetaDownload({
  rawUrl = import.meta.env.VITE_ANDROID_BETA_DOWNLOAD_URL as string | undefined,
}: {
  rawUrl?: string
}) {
  const href = resolveAndroidBetaDownloadUrl(rawUrl)

  // Missing or unsafe configuration hides the button entirely.
  if (!href) return null

  return (
    <div className="mt-8 border-t border-slate-200 pt-6">
      <p className="text-sm font-medium text-slate-900">Student on Android?</p>
      <p className="mt-1 text-xs text-slate-500">
        Students sign in on the mobile app. You can install the current Android
        beta below.
      </p>

      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Download the Leornian Android beta (opens in a new tab)"
        className={
          // Matches the shared Button's `secondary` variant + `md` size so the
          // link reads as one of the page's buttons without redesigning it.
          'mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg ' +
          'border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 ' +
          'h-10 transition-colors hover:bg-slate-50 ' +
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ' +
          'focus-visible:outline-slate-400'
        }
      >
        <Download className="h-4 w-4" />
        Download Android beta
      </a>

      <ul className="mt-3 space-y-1 text-xs text-slate-500">
        <li>This is an Android beta release.</li>
        <li>
          You may need to sign in with a Google account and accept the tester
          invitation.
        </li>
        <li>
          Android may ask for permission to install the downloaded test
          application.
        </li>
      </ul>
    </div>
  )
}
