import { describe, it, expect } from 'vitest'
import { safePath } from '@/lib/native/deepLink'

/**
 * A custom URL scheme is callable by ANYTHING on the device that can open a URL
 * — another app, a Safari page, a QR code. The string reaching `safePath` is
 * untrusted input that merely happens to usually come from our own widget, so
 * these are security tests, not formatting ones.
 */
describe('safePath', () => {
  it('extracts the path a widget asked for', () => {
    expect(safePath('helix://open?path=/nutrition')).toBe('/nutrition')
    expect(safePath('helix://open?path=/nutrition/nutrients')).toBe('/nutrition/nutrients')
    expect(safePath('helix://open?path=/')).toBe('/')
  })

  it('accepts a route below an allowed root', () => {
    expect(safePath('helix://open?path=/workout/exercises')).toBe('/workout/exercises')
    expect(safePath('helix://open?path=/day/2026-08-14')).toBe('/day/2026-08-14')
  })

  it('rejects a scheme that is not ours', () => {
    expect(safePath('https://evil.example/nutrition')).toBeNull()
    expect(safePath('javascript:alert(1)')).toBeNull()
    expect(safePath('capacitor://localhost/nutrition')).toBeNull()
  })

  /**
   * `//evil.example` is a PROTOCOL-RELATIVE URL. It starts with a slash, so a
   * naive `startsWith('/')` check passes it — and a router treats it as an
   * external origin and navigates the webview off the app entirely.
   */
  it('rejects a protocol-relative path', () => {
    expect(safePath('helix://open?path=//evil.example')).toBeNull()
    expect(safePath('helix://open?path=//evil.example/nutrition')).toBeNull()
  })

  it('rejects a route the app does not have', () => {
    expect(safePath('helix://open?path=/admin')).toBeNull()
    expect(safePath('helix://open?path=/api/widget/snapshot')).toBeNull()
  })

  it('rejects a relative or absent path', () => {
    expect(safePath('helix://open?path=nutrition')).toBeNull()
    expect(safePath('helix://open')).toBeNull()
    expect(safePath('')).toBeNull()
    expect(safePath(null)).toBeNull()
    expect(safePath(undefined)).toBeNull()
  })

  it('does not throw on a malformed URL', () => {
    expect(() => safePath('helix://%%%')).not.toThrow()
  })

  it('keeps a query string on an allowed route', () => {
    expect(safePath('helix://open?path=%2Fday%2F2026-08-14%3Ftab%3Dsleep')).toBe('/day/2026-08-14?tab=sleep')
  })
})
