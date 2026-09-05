import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'scrollTo', {
    configurable: true,
    value: vi.fn(),
  })
}

afterEach(() => {
  cleanup()
})
beforeEach(() => {
  if (typeof localStorage !== 'undefined') localStorage.clear()
  if (typeof window !== 'undefined') window.history.replaceState(null, '', window.location.pathname)
})
