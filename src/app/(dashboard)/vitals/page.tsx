import { redirect } from 'next/navigation'

/** Merged into the unified Progression tab. */
export default function VitalsRedirect() {
  redirect('/progression')
}
