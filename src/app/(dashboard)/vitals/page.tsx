import { redirect } from 'next/navigation'

/** Merged into the unified Pathfinder tab (Vitals view). */
export default function VitalsRedirect() {
  redirect('/pathfinder?view=vitals')
}
