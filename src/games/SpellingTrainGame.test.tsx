import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { demoWords } from '../test/fixtures/gameWords'
import { SpellingTrainGame } from './SpellingTrainGame'

function targetTerm() {
  const id = screen.getByTestId('train-target').getAttribute('data-word-id')
  return demoWords.find((word) => word.id === id)!.term
}

function visibleLetterBank() {
  return screen
    .getAllByRole('button', { name: /^(输入字母|输入空格)/ })
    .map((button) => button.textContent === '空格' ? ' ' : button.textContent!.toLowerCase())
    .join('')
}

describe('SpellingTrainGame', () => {
  it('shows the supplied target image, Chinese prompt, letter slots and accessible input without leaking the ordered answer', () => {
    render(<SpellingTrainGame words={demoWords} rounds={2} seed={5} onBackToHub={vi.fn()} onReturnToLearning={vi.fn()} />)

    const term = targetTerm()
    expect(screen.getByTestId('train-target')).toHaveTextContent(demoWords.find((word) => word.term === term)!.meaningZh)
    expect(screen.getByRole('img', { name: /词义联想/ })).toBeVisible()
    expect(screen.getAllByTestId('train-letter-slot')).toHaveLength(term.length)
    expect(screen.getByRole('heading', { name: '拼写小火车' })).toHaveFocus()
    expect(screen.queryByText(term, { exact: true })).not.toBeInTheDocument()
  })

  it('never exposes the complete answer order across valid seeds when its letters can be rearranged', () => {
    const cases = [
      { ...demoWords[0], id: 'demo-seed-sun', term: 'sun' },
      { ...demoWords[0], id: 'demo-seed-letter', term: 'letter' },
      { ...demoWords[0], id: 'demo-seed-ice-cream', term: 'ice cream' },
    ]
    const view = render(<SpellingTrainGame words={[cases[0]]} rounds={1} seed={0} onBackToHub={vi.fn()} onReturnToLearning={vi.fn()} />)

    for (const word of cases) {
      for (let seed = 0; seed < 64; seed += 1) {
        view.rerender(<SpellingTrainGame words={[word]} rounds={1} seed={seed} onBackToHub={vi.fn()} onReturnToLearning={vi.fn()} />)
        expect(visibleLetterBank(), `${word.term} leaked for seed ${seed}`).not.toBe(word.term)
      }
    }
  }, 10_000)

  it('rejects empty and inexact spelling, stays on the round, then accepts trimmed case-insensitive spelling', async () => {
    const user = userEvent.setup()
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView })
    render(<SpellingTrainGame words={demoWords} rounds={2} seed={8} onBackToHub={vi.fn()} onReturnToLearning={vi.fn()} />)
    const input = screen.getByLabelText('输入英文单词')
    const term = targetTerm()

    await user.click(screen.getByRole('button', { name: '检查拼写' }))
    expect(screen.getByRole('status')).toHaveTextContent('先写下你的答案')
    expect(input).toHaveFocus()
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'center', inline: 'nearest' })
    await user.type(input, `${term.slice(0, -1)}{enter}`)
    expect(screen.getByRole('status')).toHaveTextContent('还差一点')
    expect(screen.getByText(/第 1 \/ 2 轮/)).toBeVisible()
    expect(input).toHaveFocus()
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'center', inline: 'nearest' })
    await user.clear(input)
    await user.type(input, `  ${term.toUpperCase()}  {enter}`)
    expect(screen.getByRole('status')).toHaveTextContent('拼对啦！')
    expect(screen.getByRole('button', { name: '下一站' })).toHaveFocus()
  })

  it('supports touch letter buttons, clears stale input, ends finitely and runs real callbacks', async () => {
    const user = userEvent.setup()
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView })
    const onBackToHub = vi.fn()
    const onReturnToLearning = vi.fn()
    render(<SpellingTrainGame words={demoWords} rounds={2} seed={11} onBackToHub={onBackToHub} onReturnToLearning={onReturnToLearning} />)

    await user.click(screen.getByRole('button', { name: '返回游戏中心' }))
    expect(onBackToHub).toHaveBeenCalledOnce()
    for (let round = 0; round < 2; round += 1) {
      const term = targetTerm()
      for (const letter of term) await user.click(screen.getAllByRole('button', { name: `输入字母 ${letter.toUpperCase()}` })[0])
      await user.click(screen.getByRole('button', { name: '检查拼写' }))
      if (round === 0) {
        await user.click(screen.getByRole('button', { name: '下一站' }))
        expect(screen.getByLabelText('输入英文单词')).toHaveValue('')
        expect(screen.getByLabelText('输入英文单词')).toHaveFocus()
        expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'center', inline: 'nearest' })
      } else {
        await user.click(screen.getByRole('button', { name: '看看结果' }))
      }
    }

    expect(screen.getByRole('heading', { name: '小火车到站啦' })).toHaveFocus()
    expect(screen.getByText('拼对 2 / 2 轮')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '回到学习' }))
    expect(onReturnToLearning).toHaveBeenCalledOnce()
  })

  it('atomically resets the whole mounted session when configuration changes', async () => {
    const user = userEvent.setup()
    const view = render(<SpellingTrainGame words={demoWords.slice(0, 2)} rounds={1} seed={1} onBackToHub={vi.fn()} onReturnToLearning={vi.fn()} />)
    await user.type(screen.getByLabelText('输入英文单词'), 'wrong{enter}')
    view.rerender(<SpellingTrainGame words={demoWords.slice(2)} rounds={2} seed={9} onBackToHub={vi.fn()} onReturnToLearning={vi.fn()} />)

    expect(screen.getByText(/第 1 \/ 2 轮/)).toBeVisible()
    expect(screen.getByLabelText('输入英文单词')).toHaveValue('')
    expect(screen.queryByText('还差一点')).not.toBeInTheDocument()
    expect(['dog', 'sun']).toContain(targetTerm())
    expect(screen.getByRole('heading', { name: '拼写小火车' })).toHaveFocus()
  })
})
