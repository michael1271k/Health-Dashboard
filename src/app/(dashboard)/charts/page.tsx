import { redirect } from 'next/navigation'

/** Merged into the unified Progression tab (Analytics view). */
export default function ChartsRedirect() {
  redirect('/progression?view=analytics')
}
