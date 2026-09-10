import { describe, expect, it } from 'vitest'
import { resolveAndroidBetaDownloadUrl } from './androidBeta'

/**
 * The Android beta link policy.
 *
 * The value is configuration, not code, so it is treated as untrusted: a valid
 * https invite link passes through, and anything else — missing, malformed, or
 * a dangerous scheme — resolves to null so the button hides.
 */
describe('resolveAndroidBetaDownloadUrl', () => {
  it('accepts a valid https Firebase App Distribution invite link', () => {
    const url = 'https://appdistribution.firebase.dev/i/abc123def456'
    expect(resolveAndroidBetaDownloadUrl(url)).toBe(url)
  })

  it('accepts any https host and trims surrounding whitespace', () => {
    // The link is not host-locked (Firebase domains vary), so https is the gate.
    expect(
      resolveAndroidBetaDownloadUrl('  https://appdistribution.firebase.google.com/x  '),
    ).toBe('https://appdistribution.firebase.google.com/x')
  })

  it('treats a missing value as no button', () => {
    expect(resolveAndroidBetaDownloadUrl(undefined)).toBeNull()
    expect(resolveAndroidBetaDownloadUrl(null)).toBeNull()
    expect(resolveAndroidBetaDownloadUrl('')).toBeNull()
    expect(resolveAndroidBetaDownloadUrl('   ')).toBeNull()
  })

  it('refuses unsafe schemes and non-URLs', () => {
    expect(resolveAndroidBetaDownloadUrl('javascript:alert(1)')).toBeNull()
    expect(resolveAndroidBetaDownloadUrl('JavaScript:alert(1)')).toBeNull()
    expect(
      resolveAndroidBetaDownloadUrl('data:text/html,<script>alert(1)</script>'),
    ).toBeNull()
    expect(resolveAndroidBetaDownloadUrl('not a url')).toBeNull()
    expect(resolveAndroidBetaDownloadUrl('ftp://example.com/app.apk')).toBeNull()
  })

  it('refuses http (downgradeable) and credentialed URLs', () => {
    expect(resolveAndroidBetaDownloadUrl('http://appdistribution.firebase.dev/i/x')).toBeNull()
    expect(
      resolveAndroidBetaDownloadUrl('https://user:pass@appdistribution.firebase.dev/i/x'),
    ).toBeNull()
  })
})
