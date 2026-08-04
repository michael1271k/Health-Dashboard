import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MarkdownView } from '@/components/reports/MarkdownView'

/**
 * A render smoke test, not a snapshot. The splitter is unit-tested on its own;
 * what this pins is that every branch of the renderer actually mounts — an
 * invalid nesting or a bad component override in the react-markdown map throws
 * at render time and nothing else in the suite would catch it.
 */
describe('MarkdownView', () => {
  it('draws a banner box as a card rather than a code block', () => {
    render(<MarkdownView md={'╔════╗\n║ W01 · CUT · FMT v2 ║\n╚════╝'} />)
    expect(screen.getByText('W01')).toBeTruthy()
    expect(screen.getByText('CUT')).toBeTruthy()
    expect(document.querySelector('pre')).toBeNull()
  })

  it('draws text bars natively and keeps the author\'s own number', () => {
    const { container } = render(<MarkdownView md={'Protein ████████████░░░░ 81%'} />)
    expect(screen.getByText('81%')).toBeTruthy()
    expect(container.querySelectorAll('div[style*="width"]').length).toBeGreaterThan(0)
  })

  it('renders a bare pipe table as a real table', () => {
    render(<MarkdownView md={'Date | Wt\n07-19 | 64.8\n07-25 | 64.2'} />)
    expect(document.querySelectorAll('table')).toHaveLength(1)
    expect(document.querySelectorAll('tbody tr')).toHaveLength(2)
  })

  it('badges a status lead and keeps the sentence after it', () => {
    render(<MarkdownView md={'🟢 QUICK VERDICT — the cut is on rails'} />)
    expect(screen.getByText('QUICK VERDICT')).toBeTruthy()
    expect(screen.getByText('the cut is on rails')).toBeTruthy()
  })

  it('keeps unrecognised column-aligned text preformatted', () => {
    const md = 'ANCHOR A · DIARY     2,400   ← ADOPTED\nANCHOR B · DRIFT     2,310'
    render(<MarkdownView md={md} />)
    expect(document.querySelector('pre')?.textContent).toBe(md)
  })

  it('renders ordinary markdown unchanged', () => {
    render(<MarkdownView md={'## Heading\n\nA sentence.\n\n- one\n- two'} />)
    expect(screen.getByRole('heading', { level: 2 }).textContent).toContain('Heading')
    expect(document.querySelectorAll('li')).toHaveLength(2)
  })

  it('survives empty input', () => {
    const { container } = render(<MarkdownView md="" />)
    expect(container.textContent).toBe('')
  })
})
