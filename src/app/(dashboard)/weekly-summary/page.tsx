import { redirect } from 'next/navigation'

/** Merged into the unified Weekly Insights tab. */
export default function WeeklySummaryRedirect() {
  redirect('/insights')
}
