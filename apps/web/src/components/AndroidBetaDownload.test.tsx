import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { AndroidBetaDownload } from './AndroidBetaDownload'

/**
 * The Android beta download entry point.
 *
 * What matters: a valid configured link renders a secure external link with the
 * required tester guidance; a missing or unsafe value renders nothing; and the
 * component reads the configured environment variable by default.
 */

// jsdom has no auto-cleanup unless vitest globals are on; register it manually.
afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

const VALID = 'https://appdistribution.firebase.dev/i/abc123'

describe('AndroidBetaDownload', () => {
  it('renders a secure external link for a valid configured URL', () => {
    render(<AndroidBetaDownload rawUrl={VALID} />)

    const link = screen.getByRole('link', { name: /download the leornian android beta/i })
    expect(link.getAttribute('href')).toBe(VALID)
    expect(link.getAttribute('target')).toBe('_blank')
    // Exact secure rel: both noopener and noreferrer.
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(link.textContent).toMatch(/download android beta/i)
  })

  it('explains the beta, the tester invitation, and the install permission', () => {
    render(<AndroidBetaDownload rawUrl={VALID} />)

    expect(screen.getByText(/android beta release/i)).toBeTruthy()
    expect(screen.getByText(/google account and accept the tester invitation/i)).toBeTruthy()
    expect(screen.getByText(/permission to install the downloaded test application/i)).toBeTruthy()
  })

  it('renders nothing when the URL is missing', () => {
    const { container } = render(<AndroidBetaDownload rawUrl={undefined} />)
    expect(container.firstChild).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('renders nothing for unsafe schemes', () => {
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'http://appdistribution.firebase.dev/i/x',
      'not a url',
    ]) {
      const { container } = render(<AndroidBetaDownload rawUrl={bad} />)
      expect(container.firstChild).toBeNull()
      cleanup()
    }
  })

  it('reads VITE_ANDROID_BETA_DOWNLOAD_URL from the environment by default', () => {
    vi.stubEnv('VITE_ANDROID_BETA_DOWNLOAD_URL', VALID)

    render(<AndroidBetaDownload />)

    expect(screen.getByRole('link', { name: /android beta/i }).getAttribute('href')).toBe(VALID)
  })

  it('hides itself when the environment variable is unset', () => {
    vi.stubEnv('VITE_ANDROID_BETA_DOWNLOAD_URL', '')

    const { container } = render(<AndroidBetaDownload />)
    expect(container.firstChild).toBeNull()
  })

  it('renders as a full-width block that adapts to any viewport', () => {
    // The link fills its column (w-full) rather than assuming a fixed width, so
    // it lays out correctly on both the narrow mobile form and the wide desktop
    // split-screen. Assert the responsive utility rather than a pixel size,
    // which jsdom does not compute.
    render(<AndroidBetaDownload rawUrl={VALID} />)

    const link = screen.getByRole('link', { name: /android beta/i })
    expect(link.className).toContain('w-full')
    // Guidance is a list, so it wraps naturally on small screens.
    expect(within(link.closest('div') as HTMLElement).getAllByRole('listitem').length).toBe(3)
  })
})
