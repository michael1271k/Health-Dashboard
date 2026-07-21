import { redirect } from 'next/navigation'

/** Merged into the unified Pathfinder tab (Analytics view). */
export default function ChartsRedirect() {
  redirect('/pathfinder?view=analytics')
}
