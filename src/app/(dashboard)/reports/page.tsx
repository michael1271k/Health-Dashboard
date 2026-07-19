import { redirect } from 'next/navigation'

/** Merged into the unified Progression tab (Timeline view). */
export default function ReportsRedirect() {
  redirect('/progression')
}
