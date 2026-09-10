/**
 * The one address the public pages hand out.
 *
 * ── IT HAS TO BE A MAILBOX THAT ACTUALLY RECEIVES ────────────────────────────
 * App Review mails the support address of apps it has questions about, and a
 * bounce is a rejection under guideline 1.5 as surely as a 404 is. `onyx.fitness`
 * is the domain the demo account already lives on
 * (`scripts/seed-demo-account.mjs`), so this matches it rather than inventing a
 * second identity — but the mailbox itself is a DNS-and-inbox job that no
 * commit can do. Confirm it delivers before submitting.
 *
 * Stated here and imported, rather than typed into each page, because the same
 * address appears five times on `/privacy` and three on `/support`, and the one
 * that gets missed is always the one a reviewer clicks.
 */
export const SUPPORT_EMAIL = 'support@onyx.fitness'
