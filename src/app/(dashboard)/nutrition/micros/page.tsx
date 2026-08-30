import { redirect } from 'next/navigation'

/**
 * The old address of the Nutrients page.
 *
 * ── WHY A REDIRECT AND NOT A DELETED ROUTE ───────────────────────────────────
 * `/nutrition/micros` is not only in browser history. It is baked into the
 * shipped iOS widget — `HelixLink` hands it to `helix://open?path=…`, and that
 * binary is on the phone whether or not this deploy renames anything. A widget
 * face that opens a 404 is a broken widget until the next App Store build.
 *
 * Two characters of route, and the deep-link allow-list keeps working
 * unchanged. Delete it once no shipped build points here.
 */
export default function MicrosRedirect() {
  redirect('/nutrition/nutrients')
}
