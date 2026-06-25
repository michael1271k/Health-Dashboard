// Netlify Scheduled Function — prevents Supabase free tier from pausing
// Runs every 6 hours
// Schedule: "0 */6 * * *"

export default async function keepAlive() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.error('[keep-alive] Missing Supabase env vars')
    return
  }

  try {
    // Lightweight query — just ping the API
    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    })
    console.info('[keep-alive] Supabase ping status:', response.status)
  } catch (error) {
    console.error('[keep-alive] Ping failed:', error)
  }
}

export const config = {
  schedule: '0 */6 * * *',
}
