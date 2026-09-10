import Link from 'next/link'

/**
 * The chrome for the two pages App Review opens before it ever installs the
 * binary — `/privacy` (5.1.1(i)) and `/support` (1.5).
 *
 * ── WHY A ROUTE GROUP AND NOT A COMPONENT ────────────────────────────────────
 * `(legal)` does not appear in a URL, so both pages keep the exact paths the
 * App Store Connect fields name, and Next gives them one shared shell for free.
 * A `<LegalPage>` wrapper would have been the same markup with an import in
 * each file and a prop to thread the title through.
 *
 * ── AND WHY IT DOES NOT REUSE `LaunchSurface` ────────────────────────────────
 * That component is a 384px card centred in the viewport under a lockup, which
 * is right for a sign-in form and wrong for two thousand words of policy. It
 * also says HELIX, and these are the two pages whose branding a reviewer checks
 * against the listing.
 *
 * The app chrome is suppressed here — see `PUBLIC_ROUTES` in `lib/nav-items`.
 * Every tab in the bottom bar is gated, so on a page opened with no session
 * they are five taps that each bounce to sign-in.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-white/[0.06]">
        <div className="mx-auto max-w-2xl px-6 py-8">
          <Link
            href="/"
            className="font-heading text-2xl font-black tracking-[0.12em] text-text
                       hover:opacity-80 transition-opacity"
          >
            ONYX
          </Link>
          <p className="text-muted text-xs tracking-wide mt-1.5">
            Training, fuel and recovery.
          </p>
        </div>
      </header>

      {/* `prose`-free on purpose: this app has no typography plugin, and the
          two pages below carry their own spacing so nothing here depends on a
          dependency that is not installed. */}
      <div className="mx-auto max-w-2xl px-6 py-10">{children}</div>

      <footer className="border-t border-white/[0.06] mt-8">
        <nav
          aria-label="Legal and support"
          className="mx-auto max-w-2xl px-6 py-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted"
        >
          <Link href="/privacy" className="hover:text-text transition-colors">Privacy</Link>
          <Link href="/support" className="hover:text-text transition-colors">Support</Link>
          <Link href="/delete-account" className="hover:text-text transition-colors">Delete account</Link>
          <span className="ml-auto">Onyx</span>
        </nav>
      </footer>
    </div>
  )
}
