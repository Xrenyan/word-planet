import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { demoWords } from '../test/fixtures/gameWords'
import { MemoryFlipGame } from './MemoryFlipGame'

describe('MemoryFlipGame', () => {
  it('keeps ordinary memory mismatches out of vocabulary misses and reports a truthful run once', async () => {
    const user = userEvent.setup()
    const onAttempt = vi.fn(), onComplete = vi.fn(), onReplay = vi.fn(), onNextChallenge = vi.fn()
    const props = { words: demoWords, groups: 2 as const, seed: 5, onAttempt, onComplete, onReplay, onNextChallenge, onBackToHub: vi.fn(), onReturnToLearning: vi.fn() }
    const view = render(<MemoryFlipGame {...props} />)
    const cards = screen.getAllByRole('button', { name: /未翻开的记忆卡片/ })
    expect(cards).toHaveLength(6)
    expect(screen.queryByRole('button', { name: '再玩一次' })).not.toBeInTheDocument()
    const wordIds = [...new Set(cards.map(card => card.dataset.wordId!))]
    const first = cards.filter(card => card.dataset.wordId === wordIds[0])
    const second = cards.filter(card => card.dataset.wordId === wordIds[1])
    await user.click(first[0]); await user.click(first[1]); await user.click(second[0])
    expect(onAttempt).not.toHaveBeenCalled()
    expect(onComplete).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '继续翻牌' }))
    for (const group of [first, second]) {
      for (const card of group.slice(0, 2)) await user.click(card)
      act(() => { group[2].click(); group[2].click() })
    }
    expect(onAttempt).toHaveBeenCalledTimes(2)
    expect(onAttempt.mock.calls.every(([attempt]) => attempt.outcome === 'correct')).toBe(true)
    expect(onComplete).toHaveBeenCalledExactlyOnceWith({ completedRounds: 2, totalRounds: 2, firstTryCorrect: 0 })
    view.rerender(<MemoryFlipGame {...props} onComplete={onComplete} />)
    expect(onComplete).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: '再玩一次' }))
    await user.click(screen.getByRole('button', { name: '下一关' }))
    expect(onReplay).toHaveBeenCalledOnce(); expect(onNextChallenge).toHaveBeenCalledOnce()
  })

  it('starts with real concealed button cards and accessible unpressed state', () => {
    render(<MemoryFlipGame words={demoWords.slice(0, 2)} seed={3} onBackToHub={vi.fn()} onReturnToLearning={vi.fn()} />)

    const cards = screen.getAllByRole('button', { name: /未翻开的记忆卡片/ })
    expect(cards).toHaveLength(6)
    expect(cards.every((card) => card.getAttribute('aria-pressed') === 'false')).toBe(true)
    expect(screen.queryByText(/planet|cat/)).not.toBeInTheDocument()
    expect(screen.getByText(/没有倒计时/)).toBeVisible()
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
  })

  it('keeps a nonmatching trio open until the explicit continue action, then closes only those cards', async () => {
    const user = userEvent.setup()
    render(<MemoryFlipGame words={demoWords.slice(0, 2)} seed={5} onBackToHub={vi.fn()} onReturnToLearning={vi.fn()} />)
    const allCards = screen.getAllByRole('button', { name: /未翻开的记忆卡片/ })
    const chosen = allCards.filter((card) => card.getAttribute('data-word-id') === demoWords[0].id).slice(0, 2)
    const other = allCards.find((card) => card.getAttribute('data-word-id') === demoWords[1].id)!
    await user.click(chosen[0])
    await user.click(chosen[1])
    await user.click(other)

    expect(screen.getByRole('status')).toHaveTextContent('还不是同一组')
    expect(screen.getByRole('button', { name: '继续翻牌' })).toHaveFocus()
    expect(chosen[0]).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: '继续翻牌' }))
    expect(screen.getAllByRole('button', { name: /未翻开的记忆卡片/ })).toHaveLength(6)
    expect(document.activeElement).toBe(chosen[0])
    expect(document.activeElement).toBeEnabled()
    expect(document.activeElement).toBeVisible()
    expect(document.activeElement?.isConnected).toBe(true)
  })

  it('gives repeated pointer and keyboard activation a real deselect action', async () => {
    const user = userEvent.setup()
    render(<MemoryFlipGame words={demoWords.slice(0, 2)} seed={4} onBackToHub={vi.fn()} onReturnToLearning={vi.fn()} />)
    const card = screen.getAllByRole('button', { name: /未翻开的记忆卡片/ })[0]

    await user.click(card)
    expect(card).toHaveAttribute('aria-pressed', 'true')
    await user.click(card)
    expect(card).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('status')).toHaveTextContent('盖回去')
    card.focus()
    await user.keyboard('{Enter}')
    expect(card).toHaveAttribute('aria-pressed', 'true')
    await user.keyboard(' ')
    expect(card).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('已配对 0 / 2 组')).toBeVisible()
  })

  it('matches only the three different card types for one word and never counts a matched triple twice', async () => {
    const user = userEvent.setup()
    render(<MemoryFlipGame words={demoWords.slice(0, 2)} seed={7} onBackToHub={vi.fn()} onReturnToLearning={vi.fn()} />)
    const cards = screen.getAllByRole('button', { name: /未翻开的记忆卡片/ })
    const firstWordCards = cards.filter((card) => card.getAttribute('data-word-id') === demoWords[0].id)
    for (const card of firstWordCards) await user.click(card)

    expect(screen.getByRole('status')).toHaveTextContent('配成一组啦')
    expect(screen.getByText('已配对 1 / 2 组')).toBeVisible()
    const matched = screen.getAllByRole('button', { name: /已配对/ })
    expect(matched).toHaveLength(3)
    expect(matched.every((card) => card.hasAttribute('disabled'))).toBe(true)
    expect(document.activeElement).not.toBe(document.body)
    expect(document.activeElement).toBeEnabled()
    expect(document.activeElement).toBeVisible()
    expect(document.activeElement?.isConnected).toBe(true)
    expect(document.activeElement).not.toHaveAttribute('data-word-id', demoWords[0].id)
    await user.click(matched[0])
    expect(screen.getByText('已配对 1 / 2 组')).toBeVisible()
  })

  it('finishes only after every triple, reports actual count and offers real returns', async () => {
    const user = userEvent.setup()
    const onBackToHub = vi.fn()
    const onReturnToLearning = vi.fn()
    render(<MemoryFlipGame words={demoWords.slice(0, 2)} seed={13} onBackToHub={onBackToHub} onReturnToLearning={onReturnToLearning} />)
    await user.click(screen.getByRole('button', { name: '返回游戏中心' }))
    expect(onBackToHub).toHaveBeenCalledOnce()

    for (const word of demoWords.slice(0, 2)) {
      const deck = screen.getByLabelText('记忆翻翻乐卡片')
      const cards = within(deck).getAllByRole('button').filter((card) => card.getAttribute('data-word-id') === word.id && !card.hasAttribute('disabled'))
      for (const card of cards) await user.click(card)
    }

    expect(screen.getByRole('heading', { name: '翻翻乐完成' })).toHaveFocus()
    expect(document.activeElement?.isConnected).toBe(true)
    expect(document.activeElement).toBeVisible()
    expect(screen.getByText('完成 2 / 2 组')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '回到学习' }))
    expect(onReturnToLearning).toHaveBeenCalledOnce()
  })

  it('atomically resets revealed and matched state when mounted props change', async () => {
    const user = userEvent.setup()
    const view = render(<MemoryFlipGame words={demoWords.slice(0, 2)} seed={2} onBackToHub={vi.fn()} onReturnToLearning={vi.fn()} />)
    await user.click(screen.getAllByRole('button', { name: /未翻开的记忆卡片/ })[0])
    view.rerender(<MemoryFlipGame words={demoWords.slice(2)} seed={4} onBackToHub={vi.fn()} onReturnToLearning={vi.fn()} />)

    expect(screen.getAllByRole('button', { name: /未翻开的记忆卡片/ })).toHaveLength(6)
    expect(screen.getByText('已配对 0 / 2 组')).toBeVisible()
    expect(screen.queryByText(/planet|cat/)).not.toBeInTheDocument()
  })
})
