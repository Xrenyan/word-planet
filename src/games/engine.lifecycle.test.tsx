import { StrictMode, type ComponentType } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { demoWords } from '../test/fixtures/gameWords'
import { BubbleMatchGame } from './BubbleMatchGame'
import { MemoryFlipGame } from './MemoryFlipGame'
import { PlanetGuardianGame } from './PlanetGuardianGame'
import { SpellingTrainGame } from './SpellingTrainGame'
import { StarDeliveryGame } from './StarDeliveryGame'
import type { GameCompletionCallbacks, GameWord } from './engine'

type RunProps = GameCompletionCallbacks & { words: readonly GameWord[]; seed?: number; rounds?: number; onBackToHub: () => void; onReturnToLearning: () => void }
const games: { name: string; Game: ComponentType<RunProps>; rounds: number }[] = [
  { name: 'bubble', Game: BubbleMatchGame, rounds: 1 },
  { name: 'train', Game: SpellingTrainGame, rounds: 1 },
  { name: 'memory', Game: MemoryFlipGame, rounds: 1 },
  { name: 'guardian', Game: PlanetGuardianGame, rounds: 3 },
  { name: 'delivery', Game: StarDeliveryGame, rounds: 1 },
]

async function finishGame(name: string) {
  const user = userEvent.setup()
  const word = demoWords[0]
  if (name === 'memory') {
    for (const card of screen.getAllByRole('button', { name: /未翻开的记忆卡片/ })) await user.click(card)
  } else if (name === 'train') {
    await user.type(screen.getByLabelText('输入英文单词'), `${word.term}{enter}`)
    await user.click(screen.getByRole('button', { name: '看看结果' }))
  } else if (name === 'guardian') {
    await user.click(screen.getByRole('button', { name: word.term }))
    await user.click(screen.getByRole('button', { name: '点亮下一层' }))
    await user.click(screen.getByRole('button', { name: `选择中文：${word.meaningZh}` }))
    await user.click(screen.getByRole('button', { name: '点亮下一层' }))
    await user.type(screen.getByLabelText('输入守护词英文'), `${word.term}{enter}`)
    await user.click(screen.getByRole('button', { name: '查看守护结果' }))
  } else {
    if (name === 'delivery') await user.click(screen.getByRole('button', { name: '开始 30 秒速递' }))
    const answer = screen.getByRole('button', { name: word.term })
    act(() => { answer.click(); answer.click() })
  }
}

describe('game run boundaries', () => {
  it.each(games)('$name reports once in StrictMode, ignores callback replacement, and allows a genuinely new run', async ({ name, Game, rounds }) => {
    const onComplete = vi.fn(), replacement = vi.fn()
    const props = { words: [demoWords[0]], rounds: 1, onBackToHub: vi.fn(), onReturnToLearning: vi.fn() }
    const view = render(<StrictMode><Game key="run-one" {...props} onComplete={onComplete} /></StrictMode>)
    expect(onComplete).not.toHaveBeenCalled()
    await finishGame(name)
    expect(onComplete).toHaveBeenCalledOnce()
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ completedRounds: rounds, totalRounds: rounds, firstTryCorrect: rounds }))
    expect(screen.queryByRole('button', { name: '再玩一次' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '下一关' })).not.toBeInTheDocument()
    view.rerender(<StrictMode><Game key="run-one" {...props} onComplete={replacement} /></StrictMode>)
    expect(replacement).not.toHaveBeenCalled()
    view.rerender(<StrictMode><Game key="run-two" {...props} onComplete={replacement} /></StrictMode>)
    expect(replacement).not.toHaveBeenCalled()
    await finishGame(name)
    expect(replacement).toHaveBeenCalledOnce()
  })

  it.each(games.filter(game => game.name !== 'memory'))('$name prioritizes only the active challenge image', ({ name, Game }) => {
    const words = [{ ...demoWords[0], image: { ...demoWords[0].image, src: 'word-art/planet.webp' } }]
    render(<Game words={words} rounds={1} onBackToHub={vi.fn()} onReturnToLearning={vi.fn()} />)
    if (name === 'delivery') fireEvent.click(screen.getByRole('button', { name: '开始 30 秒速递' }))
    const image = document.querySelector('img')!
    expect(image).toHaveAttribute('loading', 'eager')
    expect(image).toHaveAttribute('fetchpriority', 'high')
  })

  it('does not mount hidden memory images or issue high-priority requests for the whole deck', () => {
    const words = demoWords.map(word => ({ ...word, image: { ...word.image, src: 'word-art/planet.webp' } }))
    render(<MemoryFlipGame words={words} onBackToHub={vi.fn()} onReturnToLearning={vi.fn()} />)
    expect(document.querySelectorAll('img')).toHaveLength(0)
    for (const card of screen.getAllByRole('button', { name: /未翻开的记忆卡片/ })) {
      if (card.dataset.cardId?.includes('image')) { fireEvent.click(card); break }
    }
    expect(document.querySelectorAll('img')).toHaveLength(1)
    expect(document.querySelector('img')).toHaveAttribute('fetchpriority', 'auto')
  })
})
