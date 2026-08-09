import '@testing-library/jest-dom'

/**
 * jsdom implements no media queries at all, so `window.matchMedia` is simply
 * absent. Anything that asks the environment a question about itself — reduced
 * motion, reduced transparency, coarse pointer — throws on first render.
 *
 * Shimmed rather than guarded at each call site: a component should be able to
 * ask, and the honest default for a test environment is "no preference set".
 * Individual tests can override `window.matchMedia` to assert the other branch.
 */
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},      // deprecated, still probed by some libraries
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}
