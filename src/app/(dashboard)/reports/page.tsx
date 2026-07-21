import { redirect } from 'next/navigation'

/** Merged into the unified Pathfinder tab (Timeline view). */
export default function ReportsRedirect() {
  redirect('/pathfinder')
}
