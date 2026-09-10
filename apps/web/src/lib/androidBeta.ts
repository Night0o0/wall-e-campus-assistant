/**
 * The Android beta download link.
 *
 * The web console is for staff; students use the Android app, distributed as a
 * beta through Firebase App Distribution. The landing page carries a link to
 * that distribution's tester-invite URL, which is configured — never
 * hardcoded — through a Vite environment variable so it can be repointed at a
 * new distribution without a code change.
 *
 * The value reaches the page from configuration, so it is treated as untrusted:
 * a mistyped or hostile value must not turn into a `javascript:` or `data:`
 * link that every visitor is invited to click. The same allow-by-scheme rule
 * the course-material links use applies here — https only, no embedded
 * credentials — which is what makes a bad value a hidden button rather than an
 * open redirect dressed up as a download.
 */

/**
 * Returns the download URL if the configured value is a safe external link, or
 * `null` if it is missing or unsafe (so the caller hides the button).
 *
 * Exported for the tests, which assert on the policy rather than on rendering.
 */
export const resolveAndroidBetaDownloadUrl = (
  value: string | undefined | null,
): string | null => {
  if (!value) return null

  const trimmed = value.trim()
  if (!trimmed) return null

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }

  // https only. A `javascript:` or `data:` value would run in the visitor's
  // page rather than open a download, and http would be downgradeable in
  // transit — an invite link is opened by every prospective tester.
  if (url.protocol !== 'https:') return null

  // Credentials in a URL are never legitimate here and are a classic way to
  // make a hostile host look like a familiar one.
  if (url.username || url.password) return null

  return trimmed
}

/**
 * The configured Android beta link, read from the Vite environment, resolved
 * through {@link resolveAndroidBetaDownloadUrl}. `null` when unset or unsafe.
 */
export const androidBetaDownloadUrl = (): string | null =>
  resolveAndroidBetaDownloadUrl(
    import.meta.env.VITE_ANDROID_BETA_DOWNLOAD_URL as string | undefined,
  )
