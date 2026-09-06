import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { VocabularyWordContract } from '../../shared/contracts'
import type { WordPlanetApi } from '../app/api/client'
import { toPublicMatchedGameWord } from '../data/publicMatchedGameWord'
import { BubbleMatchGame } from './BubbleMatchGame'
import { GameHub } from './GameHub'

const sourceWords: VocabularyWordContract[] = ['apple', 'pear', 'cat', 'dog'].map((term, index) => ({
  id: term, bookId: 'g3-upper', unit: 1, order: index + 1, term, meaningZh: `中文${index + 1}`,
  ipaUk: '/test/', ipaUs: '/test/', image: { src: `/${term}.webp`, alt: term, license: 'reviewed' },
  source: { title: 'public source', url: 'https://example.test', page: 1 }, sourceConfidence: 'public-secondary',
}))
const gameWords = sourceWords.map((word) => toPublicMatchedGameWord(word, 3, 'upper'))
const recorder = { record: vi.fn().mockResolvedValue('synced' as const) }

function api(overrides: Partial<WordPlanetApi> = {}): WordPlanetApi {
  return {
    getBooks: vi.fn().mockResolvedValue({ books: [{ id: 'g3-upper', label: '三年级上册', grade: 3, semester: 'upper', status: 'source-matched', verifiedWordCount: 0, availableWordCount: 4 }] }),
    getWords: vi.fn().mockResolvedValue({ bookId: 'g3-upper', words: sourceWords }),
    ...overrides,
  }
}

describe('BubbleMatchGame', () => {
  it('preserves same-frame misses, counts first answers separately, and completes each round only once', async () => {
    const user = userEvent.setup()
    const onAttempt = vi.fn(), onComplete = vi.fn(), onReplay = vi.fn(), onNextChallenge = vi.fn()
    const props = { words: gameWords, rounds: 2, seed: 3, onAttempt, onComplete, onReplay, onNextChallenge, onReturnToLearning: vi.fn(), onBackToHub: vi.fn() }
    const view = render(<BubbleMatchGame {...props} />)
    const target = screen.getByTestId('bubble-target').dataset.wordId!
    const wrong = screen.getAllByRole('button').find(button => button.dataset.wordId && button.dataset.wordId !== target)!
    const correct = screen.getAllByRole('button').find(button => button.dataset.wordId === target)!
    act(() => { wrong.click(); correct.click(); correct.click() })
    expect(onAttempt).toHaveBeenCalledTimes(2)
    expect(onComplete).not.toHaveBeenCalled()
    const next = screen.getByRole('button', { name: '下一题' })
    act(() => { next.click(); next.click() })
    expect(screen.getByText('第 2 / 2 轮')).toBeVisible()
    const secondTarget = screen.getByTestId('bubble-target').dataset.wordId!
    const final = screen.getAllByRole('button').find(button => button.dataset.wordId === secondTarget)!
    act(() => { final.click(); final.click() })
    expect(onAttempt).toHaveBeenCalledTimes(3)
    expect(screen.getByText('完成 2 / 2 轮')).toBeVisible()
    expect(screen.getByText('首次答对 1 / 2 轮')).toBeVisible()
    expect(onComplete).toHaveBeenCalledExactlyOnceWith({ completedRounds: 2, totalRounds: 2, firstTryCorrect: 1 })
    view.rerender(<BubbleMatchGame {...props} />)
    expect(onComplete).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: '再玩一次' }))
    await user.click(screen.getByRole('button', { name: '下一关' }))
    expect(onReplay).toHaveBeenCalledOnce(); expect(onNextChallenge).toHaveBeenCalledOnce()
  })

  it('records each visible answer and completes a real sourced round', async () => {
    const user = userEvent.setup()
    const onAttempt = vi.fn()
    render(<BubbleMatchGame words={gameWords} rounds={1} seed={3} onAttempt={onAttempt} onReturnToLearning={vi.fn()} onBackToHub={vi.fn()} />)
    const target = screen.getByTestId('bubble-target').getAttribute('data-word-id')!
    const wrong = screen.getAllByRole('button').find((button) => button.dataset.wordId && button.dataset.wordId !== target)!
    await user.click(wrong)
    expect(onAttempt).toHaveBeenLastCalledWith({ wordId: target, outcome: 'missed' })
    const correct = screen.getAllByRole('button').find((button) => button.dataset.wordId === target)!
    await user.click(correct)
    expect(onAttempt).toHaveBeenLastCalledWith({ wordId: target, outcome: 'correct' })
    expect(screen.getByRole('heading', { name: '本局完成' })).toBeVisible()
  })
})

describe('GameHub', () => {
  it.each([
    { name: '泡泡找单词', result: '本局完成', target: 'bubble-target' },
    { name: '拼写小火车', result: '小火车到站啦', target: 'train-target' },
    { name: '记忆翻翻乐', result: '翻翻乐完成', target: null },
  ])('returns from a completed $name game to the hub and starts its next unfinished challenge', async ({ name, result, target }) => {
    const user = userEvent.setup()
    render(<GameHub api={api()} progressRecorder={recorder} onReturnToLearning={vi.fn()} />)
    await screen.findByText('4 个单词 · 随机出题')
    await user.click(screen.getByRole('button', { name: `开始${name}` }))

    if (target) {
      for (let round = 0; round < 2; round += 1) {
        const id = screen.getByTestId(target).getAttribute('data-word-id')!
        if (name === '泡泡找单词') {
          await user.click(screen.getAllByRole('button').find(button => button.dataset.wordId === id)!)
          if (round === 0) await user.click(screen.getByRole('button', { name: '下一题' }))
        } else {
          await user.type(screen.getByLabelText('输入英文单词'), `${sourceWords.find(word => word.id === id)!.term}{enter}`)
          await user.click(screen.getByRole('button', { name: round === 0 ? '下一站' : '看看结果' }))
        }
      }
    } else {
      const wordIds = [...new Set(screen.getAllByRole('button', { name: /未翻开的记忆卡片/ }).map(card => card.dataset.wordId))]
      for (const wordId of wordIds) {
        const cards = screen.getAllByRole('button', { name: /未翻开的记忆卡片/ }).filter(card => card.dataset.wordId === wordId)
        for (const card of cards) await user.click(card)
      }
    }

    expect(screen.getByRole('heading', { name: result })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '返回游戏中心' }))
    expect(screen.getByRole('heading', { name: '游戏星岛' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: `开始${name}` }))
    expect(screen.getByRole('heading', { name })).toHaveFocus()
    expect(screen.queryByRole('heading', { name: result })).not.toBeInTheDocument()
    if (name === '泡泡找单词') expect(screen.getByText('第 1 / 4 轮')).toBeVisible()
    if (name === '拼写小火车') {
      expect(screen.getByLabelText('输入英文单词')).toHaveValue('')
      expect(screen.getByText('第 1 / 3 轮')).toBeVisible()
    }
    if (name === '记忆翻翻乐') expect(screen.getByText('已配对 0 / 3 组')).toBeVisible()
  })

  it('keeps routine saves quiet while the child receives answer feedback', async () => {
    const user = userEvent.setup()
    let finishSave!: (status: 'saved') => void
    const progressRecorder = { record: () => new Promise<'saved'>(resolve => { finishSave = resolve }) }
    render(<GameHub api={api()} progressRecorder={progressRecorder} onReturnToLearning={vi.fn()} />)
    await screen.findByText('4 个单词 · 随机出题')
    await user.click(screen.getByRole('button', { name: '开始泡泡找单词' }))
    const target = screen.getByTestId('bubble-target').getAttribute('data-word-id')!
    await user.click(screen.getAllByRole('button').find(button => button.dataset.wordId === target)!)
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent('找对啦')
    await act(async () => finishSave('saved'))
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent('找对啦')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it.each(['memory-only', 'rejected'] as const)('warns when a %s answer cannot be durably saved', async (failure) => {
    const user = userEvent.setup()
    const progressRecorder = { record: failure === 'rejected' ? vi.fn().mockRejectedValue(new Error('storage unavailable')) : vi.fn().mockResolvedValue('memory-only' as const) }
    render(<GameHub api={api()} progressRecorder={progressRecorder} onReturnToLearning={vi.fn()} />)
    await screen.findByText('4 个单词 · 随机出题')
    await user.click(screen.getByRole('button', { name: '开始泡泡找单词' }))
    const target = screen.getByTestId('bubble-target').getAttribute('data-word-id')!
    await user.click(screen.getAllByRole('button').find(button => button.dataset.wordId === target)!)
    expect(await screen.findByRole('alert')).toHaveTextContent('没能保存')
    await user.click(screen.getByRole('button', { name: '返回游戏中心' }))
    expect(screen.getByRole('alert')).toHaveTextContent('没能保存')
  })

  it('never falls back to sample words when the real service fails', async () => {
    render(<GameHub api={api({ getBooks: vi.fn().mockRejectedValue(new Error('offline')) })} progressRecorder={recorder} onReturnToLearning={vi.fn()} />)
    expect(await screen.findByText('单词还没准备好')).toBeVisible()
    expect(screen.getByRole('button', { name: '开始泡泡找单词' })).toBeDisabled()
    expect(screen.queryByText(/功能演示/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '再试一次' })).toBeEnabled()
  })

  it('loads real sourced words and records game outcomes through the server recorder', async () => {
    const user = userEvent.setup()
    const progressRecorder = { record: vi.fn().mockResolvedValue('synced' as const) }
    render(<GameHub api={api()} progressRecorder={progressRecorder} onReturnToLearning={vi.fn()} />)
    expect(await screen.findByText('4 个单词 · 随机出题')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '开始泡泡找单词' }))
    const target = screen.getByTestId('bubble-target').getAttribute('data-word-id')!
    const correct = screen.getAllByRole('button').find((button) => button.dataset.wordId === target)!
    await user.click(correct)
    expect(progressRecorder.record).toHaveBeenCalledWith(expect.objectContaining({ profileId: 'local-child', wordId: target, outcome: 'correct', source: 'game' }))
  })
})
