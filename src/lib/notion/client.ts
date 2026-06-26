import { Client } from '@notionhq/client'

let _notion: Client | null = null

export function getNotionClient(): Client {
  if (!_notion) {
    const token = process.env.NOTION_TOKEN
    if (!token) throw new Error('NOTION_TOKEN not set')
    _notion = new Client({ auth: token })
  }
  return _notion
}
