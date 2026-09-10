import type { Metadata } from 'next'
import Link from 'next/link'
import { SUPPORT_EMAIL } from '@/lib/legal/contact'

/**
 * The privacy policy — App Store guideline 5.1.1(i).
 *
 * ── THIS PAGE IS A COMPLIANCE ARTEFACT, NOT MARKETING ────────────────────────
 * App Review opens it for every app carrying the HealthKit entitlement, and it
 * is checked against two other documents that must all say the same thing:
 *
 *   1. `native/Onyx/Support/PrivacyInfo.xcprivacy` — the manifest compiled into
 *      the binary. Three collected types (Health, Fitness, EmailAddress), each
 *      Linked, none used for tracking, all for App Functionality;
 *      `NSPrivacyTracking` false and `NSPrivacyTrackingDomains` empty.
 *   2. The App Privacy questionnaire in App Store Connect (`docs/APP_STORE.md`
 *      §3), which is answered FROM that manifest.
 *
 * The table below is the third copy, and it is deliberately written in the
 * manifest's own vocabulary — "Linked to you", "not used for tracking", "App
 * Functionality" — so a reviewer comparing the three is comparing like with
 * like. If the manifest ever changes, this table changes in the same commit.
 *
 * It is a SERVER component with no `'use client'`: nothing here reads a
 * session, so it prerenders to static HTML and answers 200 with no JavaScript
 * and no round trip. That matters — the reviewer's first request to this
 * domain is this page.
 */
export const metadata: Metadata = {
  // `absolute`, because the root layout's template appends "— Helix", and this
  // is one of the two pages whose branding is checked against the listing.
  title: { absolute: 'Privacy Policy — Onyx' },
  description:
    'What Onyx collects, why, where it goes, and how to delete it. Health and fitness data is used only to compute the figures shown in the app — never sold, never shared, never used for advertising.',
}

/** Kept beside the table it describes: one edit changes both. */
const LAST_UPDATED = '10 September 2026'

const COLLECTED: Array<{ what: string; examples: string; why: string }> = [
  {
    what: 'Health',
    examples:
      'Heart rate, resting heart rate, heart-rate variability, respiratory rate, blood oxygen, wrist temperature, sleep stages and duration, body mass, body-fat percentage and the other body-composition readings your scale writes.',
    why: 'To compute the readiness score, the recovery battery, the stress index and the body trends the app draws. Nothing else reads it.',
  },
  {
    what: 'Fitness',
    examples:
      'Steps, distance, active and resting energy, exercise and stand minutes, VO₂ max, and the strength sessions, sets, loads and cardio bouts you log in the app itself.',
    why: 'To compute training load, the weekly volume targets, progression and the energy balance. Nothing else reads it.',
  },
  {
    what: 'Email address',
    examples: 'The address you sign up with.',
    why: 'To identify your account and to send you a sign-in confirmation or a password reset. It is not used for marketing, and there is no mailing list.',
  },
]

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-10 first:mt-0">
      <h2 id={id} className="text-text font-bold text-lg tracking-tight">
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-muted text-sm leading-relaxed">{children}</div>
    </section>
  )
}

export default function PrivacyPage() {
  return (
    <article>
      <h1 className="text-text font-black text-3xl tracking-tight">Privacy Policy</h1>
      <p className="text-muted text-sm mt-2">Last updated {LAST_UPDATED}</p>

      <p className="text-muted text-sm leading-relaxed mt-6">
        Onyx is a training, nutrition and recovery system. It reads health and fitness data,
        combines it with the sessions and meals you log, and turns both into a small number of
        figures you can act on the same morning. This page says exactly what that involves.
      </p>

      <p className="text-text text-sm leading-relaxed mt-4 font-semibold">
        Onyx does not sell your data, does not share it with anyone, does not use it for
        advertising, and contains no advertising or analytics SDK of any kind.
      </p>

      <Section id="collect" title="What Onyx collects">
        <p>
          Three categories, and no others. Each is <strong className="text-text">linked to you</strong>{' '}
          — it is stored against your account — and{' '}
          <strong className="text-text">none of it is used for tracking</strong>. Every one is
          collected for <strong className="text-text">App Functionality</strong>: the app cannot
          produce its figures without it.
        </p>

        <div className="overflow-x-auto -mx-6 px-6">
          <table className="w-full min-w-[34rem] text-left border-separate border-spacing-0 text-sm">
            <caption className="sr-only">
              Data Onyx collects, what it includes, and what it is used for
            </caption>
            <thead>
              <tr className="text-text">
                <th scope="col" className="pb-2 pr-4 font-semibold align-bottom">Category</th>
                <th scope="col" className="pb-2 pr-4 font-semibold align-bottom">What it includes</th>
                <th scope="col" className="pb-2 font-semibold align-bottom">What it is used for</th>
              </tr>
            </thead>
            <tbody>
              {COLLECTED.map((row) => (
                <tr key={row.what} className="align-top">
                  <th
                    scope="row"
                    className="py-3 pr-4 border-t border-white/[0.06] text-text font-semibold whitespace-nowrap"
                  >
                    {row.what}
                  </th>
                  <td className="py-3 pr-4 border-t border-white/[0.06]">{row.examples}</td>
                  <td className="py-3 border-t border-white/[0.06]">{row.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p>
          Onyx collects no contact details beyond your email address, no identifiers, no location,
          no contacts, no photos, no browsing history, no purchase history, no diagnostics and no
          usage data.
        </p>
      </Section>

      <Section id="health" title="Apple Health">
        <p>
          On iPhone and Apple Watch, Onyx asks for <strong className="text-text">read</strong>{' '}
          access to the Health categories above. You can decline, and every screen still works —
          the figures that depend on a reading you have not shared simply say so rather than
          guessing.
        </p>
        <p>
          Health data obtained through HealthKit is used only to provide the features described
          here. It is never used for advertising or marketing, never sold, never shared with a
          data broker, and never disclosed to a third party. Onyx does not write your Health data
          to iCloud.
        </p>
        <p>
          You can withdraw Health access at any time in{' '}
          <span className="text-text">Settings → Privacy &amp; Security → Health → Onyx</span> on
          your device. Doing so stops new readings arriving; readings already stored are removed
          when you delete your account.
        </p>
      </Section>

      <Section id="where" title="Where your data is stored">
        <p>
          In two places, and no others: on the devices you have signed in on, and in a single
          private database hosted by{' '}
          <a
            href="https://supabase.com/privacy"
            className="text-text underline underline-offset-4 hover:opacity-80"
            target="_blank"
            rel="noopener noreferrer"
          >
            Supabase
          </a>
          , which Onyx uses purely as infrastructure to hold your rows and sync them between your
          phone, your watch and the web app.
        </p>
        <p>
          Every row carries your user id, and the database enforces row-level security: a request
          signed as you can read and write your rows and nobody else&apos;s. Data in transit is
          encrypted with TLS; data at rest is encrypted by the host.
        </p>
        <p>
          Onyx talks to no other server. There is no analytics endpoint, no crash-reporting
          service, no advertising network and no third-party API in the data path.
        </p>
      </Section>

      <Section id="device" title="What stays on the device">
        <p>
          Onyx keeps a full local database on the phone so the app works with no signal, and reads
          a small number of system values to maintain it. Apple requires these to be declared, and
          they are, in the app&apos;s privacy manifest:
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong className="text-text">User defaults</strong> — your display preferences and the
            values the Home Screen widgets read. Shared between the app, its widgets and the watch
            app; never sent anywhere.
          </li>
          <li>
            <strong className="text-text">File timestamps</strong> and{' '}
            <strong className="text-text">available disk space</strong> — read by the local
            database when it opens a file and before it writes. Never sent anywhere.
          </li>
        </ul>
        <p>
          The widgets and the watch app read that same local database and make no network requests
          of their own.
        </p>
      </Section>

      <Section id="tracking" title="Tracking">
        <p>
          None. Onyx does not track you across apps or websites, does not build an advertising
          profile, does not use the Advertising Identifier, and does not present the App Tracking
          Transparency prompt because it has nothing to ask for. The app&apos;s privacy manifest
          declares no tracking domains.
        </p>
      </Section>

      <Section id="third-parties" title="Third-party code">
        <p>
          Onyx bundles three open-source libraries: GRDB (the local database), supabase-swift (the
          client for your own database) and swift-crypto. None of them collects data, and each
          ships its own privacy manifest. There is no advertising SDK, no analytics SDK and no
          attribution SDK in the app.
        </p>
      </Section>

      <Section id="retention" title="Keeping and deleting your data">
        <p>
          Your data is kept for as long as your account exists, because the app&apos;s whole value
          is the history — a baseline needs the weeks behind it.
        </p>
        <p>
          You can delete your account and everything in it at any time. In the app it is{' '}
          <strong className="text-text">Settings → Delete account</strong>. On the web it is{' '}
          <Link href="/delete-account" className="text-text underline underline-offset-4 hover:opacity-80">
            onyx&nbsp;/&nbsp;delete-account
          </Link>
          . Either one removes every row belonging to you — sessions, sets, nights, meals,
          weigh-ins and readings — and then the account record itself. It is immediate, permanent,
          and there is no backup to restore from.
        </p>
        <p>
          If you would rather someone did it for you, write to{' '}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="text-text underline underline-offset-4 hover:opacity-80"
          >
            {SUPPORT_EMAIL}
          </a>{' '}
          from the address on the account.
        </p>
      </Section>

      <Section id="rights" title="Your rights">
        <p>
          You can export everything the app holds for a week as a plain-text report from{' '}
          <strong className="text-text">Reports</strong>, and you can delete everything as
          described above. If you are in the UK, the EEA or a jurisdiction with comparable law, the
          same two controls cover access, portability and erasure; write to{' '}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="text-text underline underline-offset-4 hover:opacity-80"
          >
            {SUPPORT_EMAIL}
          </a>{' '}
          for anything they do not.
        </p>
      </Section>

      <Section id="children" title="Children">
        <p>
          Onyx is not directed at children and does not knowingly collect data from anyone under
          13. If you believe a child has created an account, write to{' '}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="text-text underline underline-offset-4 hover:opacity-80"
          >
            {SUPPORT_EMAIL}
          </a>{' '}
          and it will be deleted.
        </p>
      </Section>

      <Section id="changes" title="Changes to this policy">
        <p>
          If this policy changes, the date at the top changes with it, and a change that widens
          what is collected will be announced in the app before it takes effect.
        </p>
      </Section>

      <Section id="contact" title="Contact">
        <p>
          Questions about this policy, or about anything on it:{' '}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="text-text underline underline-offset-4 hover:opacity-80"
          >
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </article>
  )
}
