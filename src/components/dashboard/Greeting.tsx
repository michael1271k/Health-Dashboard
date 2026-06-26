'use client'

/**
 * Dynamic greeting based on local hour.
 * Morning 05–11, Afternoon 12–16, Evening 17–21, Night 22–04.
 */
function getTimeOfDay(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Morning'
  if (hour >= 12 && hour < 17) return 'Afternoon'
  if (hour >= 17 && hour < 22) return 'Evening'
  return 'Night'
}

export function Greeting() {
  const hour = new Date().getHours()
  const period = getTimeOfDay(hour)

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-text">
        Hello Michael, Good {period}
      </h1>
    </div>
  )
}
