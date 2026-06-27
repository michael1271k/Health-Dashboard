import { redirect } from 'next/navigation'

// Logging is unified into /workout (Phase 5). Keep this route as a redirect
// so any bookmarks / PWA shortcuts still work.
export default function LogPage() {
  redirect('/workout')
}
