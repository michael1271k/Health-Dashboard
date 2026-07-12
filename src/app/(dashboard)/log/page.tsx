import { redirect } from 'next/navigation'

// Logging is unified into /workout. Keep this route as a redirect
// so any bookmarks / PWA shortcuts still work.
export default function LogPage() {
  redirect('/workout')
}
