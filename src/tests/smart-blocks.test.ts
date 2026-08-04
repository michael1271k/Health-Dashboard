import { describe, it, expect } from 'vitest'
import {
  splitSmartBlocks, parseTextBar, parseStatusLead, withSeparator,
  type HeroBlock, type BarsBlock, type MdBlock, type CodeBlock,
} from '@/lib/reports/smartBlocks'

const kinds = (md: string) => splitSmartBlocks(md).map((b) => b.kind)

describe('parseTextBar', () => {
  it('reads label, fill and the author\'s own percentage', () => {
    const b = parseTextBar('Protein   ████████████░░░░  78%')!
    expect(b.label).toBe('Protein')
    expect(b.pct).toBe(78)
    expect(b.trailing).toBe('78%')
    expect(b.ratio).toBeCloseTo(12 / 16, 5)
  })

  it('counts ▒ as a half step', () => {
    expect(parseTextBar('x ██▒▒░░░░')!.ratio).toBeCloseTo((2 + 1) / 8, 5)
  })

  it('keeps a non-percentage trailing label intact', () => {
    const b = parseTextBar('Calories ████████░░ 2,140 / 2,300 kcal')!
    expect(b.trailing).toBe('2,140 / 2,300 kcal')
    expect(b.pct).toBeNull()
  })

  it('needs a real run — one shading glyph is not a bar', () => {
    expect(parseTextBar('▓ PART 1 — WEIGHT & METABOLIC VERIFICATION')).toBeNull()
    expect(parseTextBar('nothing here')).toBeNull()
  })
})

describe('parseStatusLead', () => {
  it('reads a shouted lead with a separator', () => {
    const s = parseStatusLead('🟢 QUICK VERDICT — the cut is on rails')!
    expect(s).toMatchObject({ tone: 'good', label: 'QUICK VERDICT', rest: 'the cut is on rails' })
  })

  it('maps warn and bad emoji', () => {
    expect(parseStatusLead('⚠ PROTOCOL FLAGS: two')!.tone).toBe('warn')
    expect(parseStatusLead('🔴 HARD STOP')!.tone).toBe('bad')
  })

  it('takes a lead with no separator at all', () => {
    expect(parseStatusLead('✅ ALL CLEAR')).toMatchObject({ label: 'ALL CLEAR', rest: '' })
  })

  it('refuses a sentence that merely opens with an emoji', () => {
    expect(parseStatusLead('🟢 the cut is on rails and looking good')).toBeNull()
    expect(parseStatusLead('📉 weight trending down nicely')).toBeNull()
  })

  it('refuses an unknown emoji even when the label shouts', () => {
    expect(parseStatusLead('🦴 BONE MINERAL')).toBeNull()
  })
})

describe('splitSmartBlocks — hero', () => {
  const banner = [
    '⬢ HELIX OS · WEEKLY TELEMETRY & PERFORMANCE AUDIT',
    '╔══════════════════════════════════════════════╗',
    '║ W01 · 2026-07-19 → 07-25 · CUT / RE-ENTRY · SENTINEL-7 · FMT v2 ║',
    '╚══════════════════════════════════════════════╝',
    '',
    'Some ordinary prose follows.',
  ].join('\n')

  it('turns the box into a hero with a headline and chips', () => {
    const blocks = splitSmartBlocks(banner)
    const hero = blocks.find((b) => b.kind === 'hero') as HeroBlock
    expect(hero).toBeTruthy()
    expect(hero.headline).toBe('W01')
    expect(hero.chips).toEqual(['2026-07-19 → 07-25', 'CUT / RE-ENTRY', 'SENTINEL-7', 'FMT v2'])
  })

  it('leaves the prose around it as markdown', () => {
    const blocks = splitSmartBlocks(banner)
    expect(blocks[blocks.length - 1]).toMatchObject({ kind: 'md', text: 'Some ordinary prose follows.' })
  })

  it('does not claim an unterminated box', () => {
    const md = '╔════════════\n║ dangling\n\nprose'
    expect(kinds(md)).not.toContain('hero')
  })

  it('reads a box inside a fence too', () => {
    const md = '```\n╔═════╗\n║ W02 · CUT ║\n╚═════╝\n```'
    const hero = splitSmartBlocks(md)[0] as HeroBlock
    expect(hero.kind).toBe('hero')
    expect(hero.headline).toBe('W02')
  })
})

describe('splitSmartBlocks — bars', () => {
  it('groups a consecutive run into one chart', () => {
    const md = [
      'Protein  ████████████░░░░  78%',
      'Carbs    ██████░░░░░░░░░░  38%',
      'Fat      ████████████████ 100%',
    ].join('\n')
    const blocks = splitSmartBlocks(md)
    expect(blocks).toHaveLength(1)
    expect((blocks[0] as BarsBlock).bars.map((b) => b.label)).toEqual(['Protein', 'Carbs', 'Fat'])
  })

  it('keeps the prose on either side', () => {
    const md = 'Adherence this week:\n\nProtein ████░░░░ 50%\n\nGood enough.'
    expect(kinds(md)).toEqual(['md', 'bars', 'md'])
  })
})

describe('splitSmartBlocks — tables', () => {
  it('gives a bare pipe table the alignment row GFM needs', () => {
    const md = 'Date | Wt | BF%\n2026-07-19 | 64.8 | 17.9\n2026-07-25 | 64.2 | 17.6'
    const block = splitSmartBlocks(md)[0] as MdBlock
    expect(block.kind).toBe('md')
    expect(block.text.split('\n')[1]).toBe('--- | --- | ---')
  })

  it('leaves a table that already has one alone', () => {
    const rows = ['| a | b |', '| --- | --- |', '| 1 | 2 |']
    expect(withSeparator(rows)).toBe(rows.join('\n'))
  })

  it('bounds a leading-pipe table correctly', () => {
    expect(withSeparator(['| a | b |', '| 1 | 2 |']).split('\n')[1]).toBe('| --- | --- |')
  })

  it('does NOT send a padded table to the monospace path', () => {
    // Column-padded rows are aligned by construction; the table rule has to win.
    const md = '| Date       | Wt   |\n| 2026-07-19 | 64.8 |\n| 2026-07-25 | 64.2 |'
    expect(kinds(md)).toEqual(['md'])
  })

  it('ignores a lone line that happens to hold pipes', () => {
    expect(kinds('a | b and nothing else')).toEqual(['md'])
  })
})

describe('splitSmartBlocks — preformatted fallback', () => {
  it('keeps a column-aligned ledger as code', () => {
    const md = [
      'ANCHOR A · DIARY (blueprint primary)     2,400   ← ADOPTED',
      'ANCHOR B · TDEE FROM WEIGHT DRIFT        2,310',
    ].join('\n')
    expect(kinds(md)).toEqual(['code'])
  })

  it('does not preformat a single wide-spaced sentence', () => {
    expect(kinds('one line   with wide spacing')).toEqual(['md'])
  })

  it('keeps unrecognised box art verbatim', () => {
    const md = '┌────┬────┐\n│ a  │ b  │\n└────┴────┘'
    const block = splitSmartBlocks(md)[0] as CodeBlock
    expect(block.kind).toBe('code')
    expect(block.text).toBe(md)
  })

  it('an ordinary report of plain prose is untouched', () => {
    const md = '## Heading\n\nA sentence.\n\n- a bullet\n- another'
    expect(kinds(md)).toEqual(['md'])
  })

  it('returns nothing for empty input', () => {
    expect(splitSmartBlocks('')).toEqual([])
    expect(splitSmartBlocks('   \n  ')).toEqual([])
  })
})

describe('splitSmartBlocks — two-column tables', () => {
  it('reads a bare two-column table', () => {
    const md = 'Metric | Value\nVolume | 35,372 kg\nSets | 92'
    const block = splitSmartBlocks(md)[0] as MdBlock
    expect(block.kind).toBe('md')
    expect(block.text.split('\n')[1]).toBe('--- | ---')
  })

  it('does NOT read two prose lines that happen to share a pipe', () => {
    const md = [
      'The deficit held all week | and the scale agreed with the prediction.',
      'Steps were at the lower edge | which is the only thing worth fixing.',
    ].join('\n')
    expect(kinds(md)).toEqual(['md'])
    expect((splitSmartBlocks(md)[0] as MdBlock).text).toBe(md)
  })
})
