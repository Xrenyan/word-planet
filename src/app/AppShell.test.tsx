import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from './App'

afterEach(cleanup)

describe('AppShell', () => {
  it('exposes the six approved primary destinations with the active route announced', () => {
    render(<App />)

    expect(screen.getAllByRole('link')).toHaveLength(6)
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
      '今天',
      '教材',
      '练习',
      '游戏',
      '错词',
      '默写',
    ])
    expect(screen.getByRole('link', { name: '今天' })).toHaveAttribute('aria-current', 'page')
  })

  it('uses one primary navigation landmark and lets the skip control focus main content', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getAllByRole('navigation', { name: '主导航' })).toHaveLength(1)
    expect(screen.getByRole('banner')).toBeVisible()
    const main = screen.getByRole('main')
    expect(main).toBeVisible()

    await user.click(screen.getByRole('button', { name: '跳到主要内容' }))

    expect(main).toHaveFocus()
  })

  it.each(['{Enter}', ' '])('moves focus to main content when the skip control receives %s', async (key) => {
    const user = userEvent.setup()
    render(<App />)
    const main = screen.getByRole('main')
    const skipControl = screen.getByRole('button', { name: '跳到主要内容' })

    skipControl.focus()
    await user.keyboard(key)

    expect(main).toHaveFocus()
  })

  it('gives the mascot an accessible alternative', () => {
    render(<App />)

    expect(screen.getByRole('img', { name: '词宝，词星球的学习伙伴' })).toBeVisible()
  })
})

describe('TodayDashboard', () => {
  it('starts by connecting to the curriculum service without inventing progress', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: '今天的学习' })).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('正在读取教材')
    expect(screen.queryByText(/连续学习|已学习|\d+%/)).not.toBeInTheDocument()
  })
})

describe('App', () => {
  it('changes active route when a primary navigation link is used', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('link', { name: '教材' }))

    expect(screen.getByRole('link', { name: '教材' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', { name: '教材' })).toBeVisible()
  })

  it('changes active route when a primary navigation link receives Space', async () => {
    const user = userEvent.setup()
    render(<App />)
    const textbook = screen.getByRole('link', { name: '教材' })

    textbook.focus()
    await user.keyboard(' ')

    expect(textbook).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', { name: '教材' })).toBeVisible()
  })
})
