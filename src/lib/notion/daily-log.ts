import { getNotionClient } from './client'

export interface DailyLogEntry {
  date: string             // YYYY-MM-DD
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  sleepHours: number
  steps: number
  score: number
  batteryPct: number
  notionPageId?: string    // if set, we'll update instead of create
}

export interface WeeklyReportEntry {
  periodStart: string      // YYYY-MM-DD
  periodEnd: string        // YYYY-MM-DD
  contentMd: string        // Markdown report body
}

/**
 * Upsert a Daily Log page to Notion.
 * Returns the Notion page ID, or null if NOTION_DAILY_LOG_DB_ID is not configured.
 */
export async function pushDailyLogToNotion(entry: DailyLogEntry): Promise<string | null> {
  const dbId = process.env.NOTION_DAILY_LOG_DB_ID
  if (!dbId) return null

  try {
    const notion = getNotionClient()

    const properties = {
      Date:      { date: { start: entry.date } },
      Calories:  { number: Math.round(entry.calories) },
      Protein:   { number: Math.round(entry.proteinG) },
      Carbs:     { number: Math.round(entry.carbsG) },
      Fat:       { number: Math.round(entry.fatG) },
      Sleep:     { number: entry.sleepHours },
      Steps:     { number: entry.steps },
      Score:     { number: entry.score },
      Battery:   { number: entry.batteryPct },
    }

    if (entry.notionPageId) {
      // Update existing page
      await notion.pages.update({
        page_id: entry.notionPageId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        properties: properties as unknown as any,
      })
      return entry.notionPageId
    }

    // Create new page
    const page = await notion.pages.create({
      parent: { database_id: dbId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      properties: properties as unknown as any,
    })
    return page.id
  } catch (err) {
    console.error('[notion/daily-log] Notion write failed (non-fatal):', err)
    return null
  }
}

/**
 * Push a weekly report to the Notion Reports DB.
 * Returns the Notion page ID, or null if not configured.
 */
export async function pushWeeklyReportToNotion(entry: WeeklyReportEntry): Promise<string | null> {
  const dbId = process.env.NOTION_REPORTS_DB_ID
  if (!dbId) return null

  try {
    const notion = getNotionClient()

    const properties = {
      Title:       { title: [{ text: { content: `Weekly Report ${entry.periodStart} → ${entry.periodEnd}` } }] },
      PeriodStart: { date: { start: entry.periodStart } },
      PeriodEnd:   { date: { start: entry.periodEnd } },
    }

    // Split content into 2000-char Notion blocks (API limit per block)
    const chunks: string[] = []
    let remaining = entry.contentMd
    while (remaining.length > 0) {
      chunks.push(remaining.slice(0, 2000))
      remaining = remaining.slice(2000)
    }

    const children = chunks.map((chunk) => ({
      type: 'paragraph' as const,
      paragraph: {
        rich_text: [{ type: 'text' as const, text: { content: chunk } }],
      },
    }))

    const page = await notion.pages.create({
      parent: { database_id: dbId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      properties: properties as unknown as any,
      children,
    })
    return page.id
  } catch (err) {
    console.error('[notion/weekly-report] Notion write failed (non-fatal):', err)
    return null
  }
}
