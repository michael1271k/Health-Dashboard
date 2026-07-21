import { redirect } from 'next/navigation'

/** Journey merged into the unified Pathfinder tab (Timeline view). */
export default function WeeklyRedirect() {
  redirect('/pathfinder')
}
