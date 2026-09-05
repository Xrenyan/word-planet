import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { AppErrorBoundary } from './AppErrorBoundary'

it('preserves a usable recovery screen if a page module fails', () => {
  const spy = vi.spyOn(console,'error').mockImplementation(() => {})
  function FailedPage(): never { throw new Error('loading failed') }
  render(<AppErrorBoundary><FailedPage /></AppErrorBoundary>)
  expect(screen.getByRole('heading',{name:'页面暂时没有打开'})).toBeVisible()
  expect(screen.getByRole('button',{name:'重新加载页面'})).toBeEnabled()
  spy.mockRestore()
})
