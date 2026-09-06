import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { demoWords } from '../test/fixtures/gameWords'
import { StarDeliveryGame } from './StarDeliveryGame'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('StarDeliveryGame', () => {
  it('records only accepted actions, detaches stale-round controls, and reports the completed schedule once', () => {
    const onAttempt = vi.fn(), onComplete = vi.fn(), onReplay = vi.fn(), onNextChallenge = vi.fn()
    const props = { words: demoWords, rounds: 2, seed: 71, onAttempt, onComplete, onReplay, onNextChallenge, onBackToHub: vi.fn(), onReturnToLearning: vi.fn() }
    const view = render(<StarDeliveryGame {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '开始 30 秒速递' }))
    const target = screen.getByTestId('delivery-target').dataset.wordId!
    const first = screen.getAllByRole('button').find(button => button.dataset.wordId === target)!
    act(() => { screen.getByRole('button', { name: '暂停' }).click(); first.click() })
    expect(onAttempt).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '继续' }))
    act(() => { first.click(); first.click() })
    expect(onAttempt).toHaveBeenCalledExactlyOnceWith({ wordId: target, outcome: 'correct' })
    expect(first.isConnected).toBe(false)
    fireEvent.click(first)
    expect(onAttempt).toHaveBeenCalledOnce()
    expect(onComplete).not.toHaveBeenCalled()
    const secondTarget = screen.getByTestId('delivery-target').dataset.wordId!
    const wrong = screen.getAllByRole('button').find(button => button.dataset.wordId && button.dataset.wordId !== secondTarget)!
    act(() => { wrong.click(); wrong.click() })
    expect(onAttempt).toHaveBeenCalledTimes(2)
    expect(onComplete).toHaveBeenCalledExactlyOnceWith({ completedRounds: 2, totalRounds: 2, firstTryCorrect: 1 })
    view.rerender(<StarDeliveryGame {...props} />)
    expect(onComplete).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: '再玩一次' }))
    fireEvent.click(screen.getByRole('button', { name: '下一关' }))
    expect(onReplay).toHaveBeenCalledOnce(); expect(onNextChallenge).toHaveBeenCalledOnce()
  })

  it('reports an unanswered timeout as zero completion and rejects an answer after the final tick', () => {
    vi.useFakeTimers()
    const onAttempt = vi.fn(), onComplete = vi.fn()
    render(<StarDeliveryGame words={demoWords} rounds={2} onAttempt={onAttempt} onComplete={onComplete} onBackToHub={vi.fn()} onReturnToLearning={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '开始 30 秒速递' }))
    const answer = screen.getAllByRole('button').find(button => button.dataset.wordId)!
    act(() => { vi.advanceTimersByTime(30_000); answer.click() })
    expect(onAttempt).not.toHaveBeenCalled()
    expect(onComplete).toHaveBeenCalledExactlyOnceWith({ completedRounds: 0, totalRounds: 2, firstTryCorrect: 0 })
    expect(screen.getByRole('heading', { name: '本次速递结束' })).toBeVisible()
    expect(screen.getByText('完成 0 / 2 单')).toBeVisible()
    expect(screen.queryByRole('button', { name: '再玩一次' })).not.toBeInTheDocument()
  })

  it('does not strand the current round when pause wins before a same-frame answer', () => {
    render(<StarDeliveryGame words={demoWords} rounds={2} seed={71} onBackToHub={vi.fn()} onReturnToLearning={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '开始 30 秒速递' }))
    const target = screen.getByTestId('delivery-target').getAttribute('data-word-id')!
    const answer = screen.getAllByRole('button', { name: /^(planet|cat|dog|sun)$/ }).find((button) => button.getAttribute('data-word-id') === target)!
    act(() => { screen.getByRole('button', { name: '暂停' }).click(); answer.click(); screen.getByRole('button', { name: '暂停' }).click() })
    expect(screen.getByLabelText('已作答 0 单，答对 0 单')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '继续' }))
    fireEvent.click(answer)
    expect(screen.getByText('第 2 / 2 单')).toBeVisible()
    expect(screen.getByLabelText('已作答 1 单，答对 1 单')).toBeVisible()
  })

  it('keeps answer-before-pause and repeated pause-resume transitions deterministic', () => {
    render(<StarDeliveryGame words={demoWords} rounds={3} seed={73} onBackToHub={vi.fn()} onReturnToLearning={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '开始 30 秒速递' }))
    const target = screen.getByTestId('delivery-target').getAttribute('data-word-id')!
    const answer = screen.getAllByRole('button', { name: /^(planet|cat|dog|sun)$/ }).find((button) => button.getAttribute('data-word-id') === target)!
    act(() => { answer.click(); screen.getByRole('button', { name: '暂停' }).click() })
    expect(screen.getByText('第 2 / 3 单')).toBeVisible()
    expect(screen.getByRole('button', { name: '继续' })).toBeVisible()
    act(() => { screen.getByRole('button', { name: '继续' }).click(); screen.getByRole('button', { name: '继续' }).click() })
    expect(screen.getByRole('button', { name: '暂停' })).toBeVisible()
    const nextTarget = screen.getByTestId('delivery-target').getAttribute('data-word-id')!
    fireEvent.click(screen.getAllByRole('button', { name: /^(planet|cat|dog|sun)$/ }).find((button) => button.getAttribute('data-word-id') === nextTarget)!)
    expect(screen.getByText('第 3 / 3 单')).toBeVisible()
  })

  it('orders tick and answer actions by dispatch order without double counting', () => {
    vi.useFakeTimers()
    const view = render(<StarDeliveryGame words={demoWords} rounds={2} seed={79} onBackToHub={vi.fn()} onReturnToLearning={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '开始 30 秒速递' }))
    act(() => vi.advanceTimersByTime(29_000))
    const target = screen.getByTestId('delivery-target').getAttribute('data-word-id')!
    const answer = screen.getAllByRole('button', { name: /^(planet|cat|dog|sun)$/ }).find((button) => button.getAttribute('data-word-id') === target)!
    act(() => { vi.advanceTimersByTime(1_000); answer.click() })
    expect(screen.getByText('答对 0 / 作答 0')).toBeVisible()
    view.unmount()
  })
  it('keeps exported instances labelled by unique headings and hides an empty feedback panel', () => {
    const { container } = render(<><StarDeliveryGame words={demoWords} rounds={2} onReturnToLearning={vi.fn()} onBackToHub={vi.fn()} /><StarDeliveryGame words={demoWords} rounds={2} onReturnToLearning={vi.fn()} onBackToHub={vi.fn()} /></>)
    const sections = container.querySelectorAll('section[aria-labelledby]')
    expect(sections).toHaveLength(2)
    expect(sections[0].getAttribute('aria-labelledby')).not.toBe(sections[1].getAttribute('aria-labelledby'))
    fireEvent.click(within(sections[0] as HTMLElement).getByRole('button', { name: '开始 30 秒速递' }))
    expect(within(sections[0] as HTMLElement).queryByRole('status')).not.toBeInTheDocument()
  })
  it('counts one displayed round once when the same correct control fires twice in one batch', async () => {
    const user = userEvent.setup()
    render(<StarDeliveryGame words={demoWords} rounds={3} seed={37} onBackToHub={vi.fn()} onReturnToLearning={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: '开始 30 秒速递' }))
    const target = screen.getByTestId('delivery-target').getAttribute('data-word-id')!
    const correct = screen.getAllByRole('button', { name: /^(planet|cat|dog|sun)$/ }).find((button) => button.getAttribute('data-word-id') === target)!

    act(() => { correct.click(); correct.click() })

    expect(screen.getByText('第 2 / 3 单')).toBeVisible()
    expect(screen.getByLabelText('已作答 1 单，答对 1 单')).toBeVisible()
  })

  it('counts one displayed round once for same-frame wrong clicks and ignores a detached post-complete click', async () => {
    const user = userEvent.setup()
    const view = render(<StarDeliveryGame words={demoWords} rounds={2} seed={39} onBackToHub={vi.fn()} onReturnToLearning={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: '开始 30 秒速递' }))
    const firstTarget = screen.getByTestId('delivery-target').getAttribute('data-word-id')!
    const wrong = screen.getAllByRole('button', { name: /^(planet|cat|dog|sun)$/ }).find((button) => button.getAttribute('data-word-id') !== firstTarget)!
    act(() => { wrong.click(); wrong.click() })
    expect(screen.getByText('第 2 / 2 单')).toBeVisible()
    expect(screen.getByLabelText('已作答 1 单，答对 0 单')).toBeVisible()

    const secondTarget = screen.getByTestId('delivery-target').getAttribute('data-word-id')!
    const final = screen.getAllByRole('button', { name: /^(planet|cat|dog|sun)$/ }).find((button) => button.getAttribute('data-word-id') === secondTarget)!
    act(() => { final.click(); final.click() })
    expect(screen.getByText('答对 1 / 作答 2')).toBeVisible()
    act(() => final.click())
    expect(screen.getByText('答对 1 / 作答 2')).toBeVisible()
    view.unmount()
  })

  it('keeps one answer and one final-second tick deterministic in the same batch', () => {
    vi.useFakeTimers()
    render(<StarDeliveryGame words={demoWords} rounds={2} seed={43} onBackToHub={vi.fn()} onReturnToLearning={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '开始 30 秒速递' }))
    act(() => vi.advanceTimersByTime(29_000))
    const target = screen.getByTestId('delivery-target').getAttribute('data-word-id')!
    const correct = screen.getAllByRole('button', { name: /^(planet|cat|dog|sun)$/ }).find((button) => button.getAttribute('data-word-id') === target)!

    act(() => { correct.click(); vi.advanceTimersByTime(1_000) })

    expect(screen.getByRole('heading', { name: '本次速递结束' })).toBeVisible()
    expect(screen.getByText('答对 1 / 作答 1')).toBeVisible()
    expect(screen.getByText('时间到，速递已安全停靠。')).toBeVisible()
  })

  it('waits for an explicit start, then pauses and resumes one nonnegative 30-second timer', async () => {
    vi.useFakeTimers()
    const setInterval = vi.spyOn(window, 'setInterval')
    const view = render(<StarDeliveryGame words={demoWords} rounds={20} seed={11} onBackToHub={vi.fn()} onReturnToLearning={vi.fn()} />)

    expect(screen.getByRole('heading', { name: '星际速递' })).toHaveFocus()
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    await act(() => vi.advanceTimersByTimeAsync(5_000))
    expect(screen.getByRole('button', { name: '开始 30 秒速递' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: '开始 30 秒速递' }))
    expect(screen.getByRole('timer')).toHaveTextContent('30 秒')
    expect(screen.getByRole('timer')).toHaveAttribute('aria-live', 'off')
    expect(setInterval).toHaveBeenCalledTimes(1)
    await act(() => vi.advanceTimersByTimeAsync(4_000))
    expect(screen.getByRole('timer')).toHaveTextContent('26 秒')

    fireEvent.click(screen.getByRole('button', { name: '暂停' }))
    await act(() => vi.advanceTimersByTimeAsync(9_000))
    expect(screen.getByRole('timer')).toHaveTextContent('26 秒')
    fireEvent.click(screen.getByRole('button', { name: '继续' }))
    expect(setInterval).toHaveBeenCalledTimes(2)
    await act(() => vi.advanceTimersByTimeAsync(26_000))

    expect(screen.getByRole('heading', { name: '本次速递结束' })).toHaveFocus()
    expect(screen.getByText('时间到，速递已安全停靠。')).toBeVisible()
    expect(screen.getByText('答对 0 / 作答 0')).toBeVisible()
    expect(screen.queryByText(/-1 秒/)).not.toBeInTheDocument()
    view.unmount()
    expect(setInterval).toHaveBeenCalledTimes(2)
  })

  it('advances after correct or wrong native-button answers and ends at the finite schedule', async () => {
    const user = userEvent.setup()
    render(<StarDeliveryGame words={demoWords} rounds={2} seed={19} onBackToHub={vi.fn()} onReturnToLearning={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: '开始 30 秒速递' }))

    const firstTarget = screen.getByTestId('delivery-target').getAttribute('data-word-id')!
    const firstCorrect = screen.getAllByRole('button', { name: /^(planet|cat|dog|sun)$/ }).find((button) => button.getAttribute('data-word-id') === firstTarget)!
    firstCorrect.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByText('第 2 / 2 单')).toBeVisible()

    const secondTarget = screen.getByTestId('delivery-target').getAttribute('data-word-id')!
    const secondWrong = screen.getAllByRole('button', { name: /^(planet|cat|dog|sun)$/ }).find((button) => button.getAttribute('data-word-id') !== secondTarget)!
    await user.click(secondWrong)

    expect(screen.getByRole('heading', { name: '速递完成' })).toBeVisible()
    expect(screen.getByText('全部 2 单都已作答。')).toBeVisible()
    expect(screen.getByText('答对 1 / 作答 2')).toBeVisible()
    expect(screen.getByRole('button', { name: '返回游戏中心' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '回到学习' })).toBeEnabled()
  })

  it('atomically resets to an unstarted session when mounted configuration changes', async () => {
    const user = userEvent.setup()
    const view = render(<StarDeliveryGame words={demoWords.slice(0, 2)} rounds={2} seed={3} onBackToHub={vi.fn()} onReturnToLearning={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: '开始 30 秒速递' }))
    view.rerender(<StarDeliveryGame words={demoWords.slice(2)} rounds={1} seed={4} onBackToHub={vi.fn()} onReturnToLearning={vi.fn()} />)

    expect(screen.getByRole('button', { name: '开始 30 秒速递' })).toBeEnabled()
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '星际速递' })).toHaveFocus()
  })
})
