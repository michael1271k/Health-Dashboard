import type { Metadata } from 'next'
import Link from 'next/link'
import { SUPPORT_EMAIL } from '@/lib/legal/contact'

/**
 * The support page — App Store guideline 1.5.
 *
 * The bar the guideline sets is low: a URL that resolves and gives a person a
 * way to reach a human. The bar a REVIEWER sets is higher, because this is one
 * of two pages they open before installing anything, and it is where they look
 * when a screen does not behave the way they expected.
 *
 * So the answers below are the questions the app actually raises on first
 * launch — why Health is being asked for, why a figure says "—", where the
 * watch data went — rather than a generic FAQ. Each one is also true, and each
 * points at the control that resolves it.
 *
 * A SERVER component, like `/privacy`: no session is read, so it prerenders to
 * static HTML and answers with no JavaScript.
 */
export const metadata: Metadata = {
  title: { absolute: 'Support — Onyx' },
  description:
    'Help with Onyx: Apple Health permissions, syncing between iPhone, Apple Watch and the web, widgets, exports, and account deletion.',
}

const FAQ: Array<{ q: string; a: React.ReactNode }> = [
  {
    q: 'Onyx is asking for Apple Health access. What does it read, and can I say no?',
    a: (
      <>
        <p>
          It asks for <strong className="text-text">read</strong> access to heart, sleep, activity
          and body-measurement data — the inputs to the readiness score, the recovery battery and
          the energy balance.
        </p>
        <p>
          You can decline, and the app still works. A figure that depends on a reading you have not
          shared says so rather than guessing at it. You can change your mind later in{' '}
          <strong className="text-text">
            Settings → Privacy &amp; Security → Health → Onyx
          </strong>
          , and the app picks the history up on the next foreground.
        </p>
      </>
    ),
  },
  {
    q: 'A tile says “—” instead of a number.',
    a: (
      <p>
        That is the app saying it has no reading, which is different from saying zero. It happens
        when Health has not been granted, when the metric genuinely has no data for that day, or
        when a score needs a baseline it does not have yet — the readiness model wants a couple of
        weeks behind a day before it will call anything high or low. Give it the readings and the
        figure fills in.
      </p>
    ),
  },
  {
    q: 'I logged a workout on my Apple Watch and it is not on my phone.',
    a: (
      <p>
        The watch keeps its own copy and hands it over the next time both are awake and in range —
        open Onyx on the phone with the watch nearby. Sets logged offline are queued, not lost: a
        session that has not reached the server yet is marked as pending and uploads itself when
        there is a connection.
      </p>
    ),
  },
  {
    q: 'A widget is showing yesterday.',
    a: (
      <p>
        iOS decides when a widget may redraw, and it is stingier when the battery is low or the app
        has not been opened for a while. Opening Onyx refreshes every widget immediately. If one
        stays stale after that, remove it and add it again from the widget gallery.
      </p>
    ),
  },
  {
    q: 'Can I get my data out?',
    a: (
      <p>
        Yes. <strong className="text-text">Reports</strong> generates a plain-text report
        for any week — every set, every night, every meal, in full — that you can copy anywhere.
        Nothing in it is abbreviated or rounded away.
      </p>
    ),
  },
  {
    q: 'How do I delete my account?',
    a: (
      <p>
        In the app: <strong className="text-text">Settings → Delete account</strong>. On the web:{' '}
        <Link
          href="/delete-account"
          className="text-text underline underline-offset-4 hover:opacity-80"
        >
          onyx&nbsp;/&nbsp;delete-account
        </Link>
        . Either one permanently removes every row belonging to you and then the account itself. It
        is immediate and cannot be undone.
      </p>
    ),
  },
  {
    q: 'I have forgotten my password.',
    a: (
      <p>
        Write to{' '}
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="text-text underline underline-offset-4 hover:opacity-80"
        >
          {SUPPORT_EMAIL}
        </a>{' '}
        from the address on the account and a reset link will be sent back to it. There is no
        self-service reset on the{' '}
        <Link href="/auth" className="text-text underline underline-offset-4 hover:opacity-80">
          sign-in page
        </Link>{' '}
        yet.
      </p>
    ),
  },
]

export default function SupportPage() {
  return (
    <article>
      <h1 className="text-text font-black text-3xl tracking-tight">Support</h1>
      <p className="text-muted text-sm leading-relaxed mt-4">
        Something not behaving? Start here — these are the questions Onyx raises most often. If
        yours is not one of them, write to a human at the address below.
      </p>

      <div className="mt-6 rounded-2xl border border-white/[0.08] bg-white/[0.04] p-5">
        <h2 className="text-text font-bold text-sm">Contact</h2>
        <p className="text-muted text-sm leading-relaxed mt-2">
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="text-text underline underline-offset-4 hover:opacity-80"
          >
            {SUPPORT_EMAIL}
          </a>
          {' — '}every message is read, and answered within two working days.
        </p>
        <p className="text-muted text-sm leading-relaxed mt-2">
          It helps enormously to include your iOS version, the app version (
          <strong className="text-text">Settings → About → Version</strong>) and what you were doing
          when it happened.
        </p>
      </div>

      <h2 className="text-text font-bold text-lg tracking-tight mt-10">Common questions</h2>
      <dl className="mt-4 divide-y divide-white/[0.06]">
        {FAQ.map(({ q, a }) => (
          <div key={q} className="py-5 first:pt-0">
            <dt className="text-text font-semibold text-sm">{q}</dt>
            <dd className="mt-2 space-y-3 text-muted text-sm leading-relaxed">{a}</dd>
          </div>
        ))}
      </dl>

      <h2 className="text-text font-bold text-lg tracking-tight mt-10">Privacy</h2>
      <p className="text-muted text-sm leading-relaxed mt-3">
        What Onyx collects, why, where it is stored and how to remove it is set out in full on the{' '}
        <Link href="/privacy" className="text-text underline underline-offset-4 hover:opacity-80">
          privacy policy
        </Link>
        . The short version: health and fitness data is used only to produce the figures in the
        app, it is never sold, never shared and never used for advertising, and there is no
        analytics or advertising code in the app at all.
      </p>
    </article>
  )
}
