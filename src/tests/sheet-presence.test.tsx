import { describe, it, expect, afterEach } from 'vitest'
import { useState } from 'react'
import { render, cleanup, act, waitFor, fireEvent } from '@testing-library/react'
import { MotionProvider } from '@/components/providers/MotionProvider'
import { Sheet } from '@/components/ui/Sheet'

/**
 * THE FREEZE.
 *
 * Symptom: open a dashboard tile's sheet, close it, and every tap in the app is
 * dead — tabs, tiles, everything. Only a force-quit recovers.
 *
 * Nothing in the app sets `pointer-events`, `position: fixed` or `aria-hidden`
 * on <body>, so it was never CSS: a real DOM node was eating the taps. The
 * Sheet's root is `fixed inset-0 z-[80]` and the nav is z-50, so ONE stuck sheet
 * root covers the entire application — and because its backdrop has already
 * finished fading to `opacity: 0`, it is completely invisible while doing it.
 *
 * The cause, measured rather than guessed: `onClose` was reachable ONLY through
 * `animate(...).finished.then(...)`, and `seize()` calls `.stop()` — which
 * leaves that promise permanently unsettled, neither resolved nor rejected. Any
 * interrupt therefore orphaned the only path out of the sheet.
 *
 * `seize()` runs on pointerdown anywhere in the header, so the interrupt is a
 * finger touching the sheet during the 0.28s it takes to close. The last test
 * here is that exact sequence; before the fix it left `onClose` uncalled after a
 * second and a half, with the dialog still mounted.
 *
 * These assertions are all about ABSENCE, which is the whole point — the failure
 * mode is a node nobody can see. Counting `[role="dialog"]` is the only way to
 * observe it, so that count is the contract.
 */

const SETTLE = { timeout: 2000 }

/** Mirrors the dashboard: ONE Sheet, many bodies, switched by a key. */
function Host() {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <MotionProvider>
      <button data-testid="open-a" onClick={() => setOpen('a')}>A</button>
      <button data-testid="open-b" onClick={() => setOpen('b')}>B</button>
      <button data-testid="close" onClick={() => setOpen(null)}>close</button>
      <Sheet open={open !== null} onClose={() => setOpen(null)} title={open ?? ''}>
        <p data-testid="body">{open}</p>
      </Sheet>
    </MotionProvider>
  )
}

const dialogs = () => document.querySelectorAll('[role="dialog"]').length
const settleFor = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)))

afterEach(() => {
  cleanup()
  document.body.style.overflow = ''
  document.body.classList.remove('helix-overlay-open')
})

describe('Sheet leaves nothing behind', () => {
  it('mounts exactly one dialog when opened', async () => {
    const { getByTestId } = render(<Host />)
    fireEvent.click(getByTestId('open-a'))
    await waitFor(() => expect(dialogs()).toBe(1), SETTLE)
  })

  /**
   * Tapping a second dashboard tile before the first sheet has finished leaving.
   * One <Sheet> instance, two bodies, an exit still in flight.
   */
  it('keeps exactly one dialog when a second sheet opens during the first exit', async () => {
    const { getByTestId } = render(<Host />)

    fireEvent.click(getByTestId('open-a'))
    await waitFor(() => expect(dialogs()).toBe(1), SETTLE)

    fireEvent.click(getByTestId('close'))
    await settleFor(30)                       // inside the exit, not after it
    fireEvent.click(getByTestId('open-b'))

    await waitFor(() => expect(getByTestId('body')).toHaveTextContent('b'), SETTLE)
    await settleFor(600)
    expect(dialogs()).toBe(1)
  })

  it('leaves zero dialogs after that second sheet is closed', async () => {
    const { getByTestId } = render(<Host />)

    fireEvent.click(getByTestId('open-a'))
    await waitFor(() => expect(dialogs()).toBe(1), SETTLE)
    fireEvent.click(getByTestId('close'))
    await settleFor(30)
    fireEvent.click(getByTestId('open-b'))
    await waitFor(() => expect(getByTestId('body')).toHaveTextContent('b'), SETTLE)

    fireEvent.click(getByTestId('close'))
    await waitFor(() => expect(dialogs()).toBe(0), SETTLE)
  })

  /**
   * The close BUTTON, not the state. This is the path that went through
   * `animate(...).finished`, so it is the one that could orphan its own close.
   */
  it('closes from the X and leaves no dialog behind', async () => {
    const { getByTestId, getByLabelText } = render(<Host />)

    fireEvent.click(getByTestId('open-a'))
    await waitFor(() => expect(dialogs()).toBe(1), SETTLE)

    fireEvent.click(getByLabelText('Close'))
    await waitFor(() => expect(dialogs()).toBe(0), SETTLE)
  })

  /**
   * THE FREEZE ITSELF.
   *
   * Tap the X, then touch the sheet before it has finished leaving. The header
   * owns the drag handle, so that touch calls `seize()` → `.stop()` on the
   * closing animation, and the promise that animation was carrying — the only
   * call to `onClose` in the component — never settles.
   *
   * Before the fix this ended with the dialog still mounted after 1.5s and
   * `onClose` never called: a full-screen invisible element at z-80 over an app
   * whose nav is z-50. Force-quit.
   */
  it('closes even when touched mid-close', async () => {
    const { getByTestId, getByLabelText } = render(<Host />)

    fireEvent.click(getByTestId('open-a'))
    await waitFor(() => expect(dialogs()).toBe(1), SETTLE)

    const close = getByLabelText('Close')
    fireEvent.click(close)
    await settleFor(40)

    // The drag handle's pointerdown target: the header that wraps the X.
    fireEvent.pointerDown(close.parentElement!.parentElement!, { pointerId: 1, clientY: 10 })

    await waitFor(() => expect(dialogs()).toBe(0), SETTLE)
  })

  /**
   * Two dismissals in flight at once — the same orphaning, self-inflicted.
   */
  it('survives a dismiss interrupted by a second dismiss', async () => {
    const { getByTestId, getByLabelText } = render(<Host />)

    fireEvent.click(getByTestId('open-a'))
    await waitFor(() => expect(dialogs()).toBe(1), SETTLE)

    const close = getByLabelText('Close')
    act(() => { close.click(); close.click() })

    await waitFor(() => expect(dialogs()).toBe(0), SETTLE)
  })

  it('restores the body after the last sheet closes', async () => {
    const { getByTestId } = render(<Host />)

    fireEvent.click(getByTestId('open-a'))
    await waitFor(() => expect(document.body.style.overflow).toBe('hidden'), SETTLE)
    expect(document.body.classList.contains('helix-overlay-open')).toBe(true)

    fireEvent.click(getByTestId('close'))
    await waitFor(() => expect(dialogs()).toBe(0), SETTLE)
    expect(document.body.style.overflow).toBe('')
    expect(document.body.classList.contains('helix-overlay-open')).toBe(false)
  })
})
