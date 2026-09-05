import { render, screen } from '@testing-library/react'
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
  it.each(['memory-only', 'rejected'] as const)('warns when a %s answer cannot be durably saved', async (failure) => {
    const user = userEvent.setup()
    const progressRecorder = { record: failure === 'rejected' ? vi.fn().mockRejectedValue(new Error('storage unavailable')) : vi.fn().mockResolvedValue('memory-only' as const) }
    render(<GameHub api={api()} progressRecorder={progressRecorder} onReturnToLearning={vi.fn()} />)
    await screen.findByText('4 个单元词 · 每局随机选词')
    await user.click(screen.getByRole('button', { name: '开始泡泡找单词' }))
    const target = screen.getByTestId('bubble-target').getAttribute('data-word-id')!
    await user.click(screen.getAllByRole('button').find(button => button.dataset.wordId === target)!)
    expect(await screen.findByRole('alert')).toHaveTextContent('未能保存到此设备')
    await user.click(screen.getByRole('button', { name: '返回游戏中心' }))
    expect(screen.getByRole('alert')).toHaveTextContent('未能保存到此设备')
  })

  it('never falls back to sample words when the real service fails', async () => {
    render(<GameHub api={api({ getBooks: vi.fn().mockRejectedValue(new Error('offline')) })} progressRecorder={recorder} onReturnToLearning={vi.fn()} />)
    expect(await screen.findByText('教材游戏暂不可用')).toBeVisible()
    expect(screen.getByRole('button', { name: '开始泡泡找单词' })).toBeDisabled()
    expect(screen.queryByText(/功能演示/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新读取' })).toBeEnabled()
  })

  it('loads real sourced words and records game outcomes through the server recorder', async () => {
    const user = userEvent.setup()
    const progressRecorder = { record: vi.fn().mockResolvedValue('synced' as const) }
    render(<GameHub api={api()} progressRecorder={progressRecorder} onReturnToLearning={vi.fn()} />)
    expect(await screen.findByText('4 个单元词 · 每局随机选词')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '开始泡泡找单词' }))
    const target = screen.getByTestId('bubble-target').getAttribute('data-word-id')!
    const correct = screen.getAllByRole('button').find((button) => button.dataset.wordId === target)!
    await user.click(correct)
    expect(progressRecorder.record).toHaveBeenCalledWith(expect.objectContaining({ profileId: 'local-child', wordId: target, outcome: 'correct', source: 'game' }))
  })
})
