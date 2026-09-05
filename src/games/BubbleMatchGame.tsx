import { ArrowLeft, ArrowRight, CheckCircle, Sparkle } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'

import type { GameWord } from './engine'
import { WordArtwork } from '../learning/WordArtwork'
import {
  createGameResult,
  createGameRounds,
  createGameRoundState,
  gameScopeLabel,
  recordGameAnswer,
  type GameRound,
  type GameRoundState,
  type GameAttempt,
} from './engine'

type BubbleMatchGameProps = {
  words: readonly GameWord[]
  rounds?: number
  seed?: number
  onReturnToLearning: () => void
  onBackToHub: () => void
  onAttempt?: (attempt: GameAttempt) => void
}

type BubbleMatchSessionProps = Omit<BubbleMatchGameProps, 'words'> & {
  gameRounds: readonly GameRound[]
}

/** A semantic game-round key remounts the session atomically when config changes. */
export function BubbleMatchGame({ words, rounds = 3, seed = 20260818, onReturnToLearning, onBackToHub, onAttempt }: BubbleMatchGameProps) {
  const gameRounds = createGameRounds(words, seed, rounds)
  const configurationKey = JSON.stringify(gameRounds)

  return (
    <BubbleMatchSession
      key={configurationKey}
      gameRounds={gameRounds}
      rounds={rounds}
      seed={seed}
      onReturnToLearning={onReturnToLearning}
      onBackToHub={onBackToHub}
      onAttempt={onAttempt}
    />
  )
}

function BubbleMatchSession({ gameRounds, onReturnToLearning, onBackToHub, onAttempt }: BubbleMatchSessionProps) {
  const [roundIndex, setRoundIndex] = useState(0)
  const [state, setState] = useState<GameRoundState>(() => createGameRoundState(gameRounds[0]))
  const [completedRounds, setCompletedRounds] = useState<readonly GameRoundState[]>([])
  const [finished, setFinished] = useState(false)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const current = gameRounds[roundIndex]
  const isCorrect = state.status === 'complete'
  const wrongAttempts = state.attempts.filter((attempt) => attempt.outcome === 'missed').length

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true })
  }, [finished])

  function answer(wordId: string) {
    if (isCorrect) return
    const next = recordGameAnswer(state, wordId)
    onAttempt?.({ wordId: current.target.id, outcome: wordId === current.target.id ? 'correct' : 'missed' })
    setState(next)
    if (next.status === 'complete' && roundIndex + 1 >= gameRounds.length) {
      setCompletedRounds((previous) => Object.freeze([...previous, next]))
      setFinished(true)
    }
  }

  function nextRound() {
    setCompletedRounds((previous) => Object.freeze([...previous, state]))
    const nextIndex = roundIndex + 1
    setRoundIndex(nextIndex)
    setState(createGameRoundState(gameRounds[nextIndex]))
  }

  if (finished) {
    const result = createGameResult(completedRounds)
    return (
      <section className="bubble-game bubble-game--complete" aria-labelledby="bubble-game-title">
        <div className="bubble-game__complete-badge"><CheckCircle aria-hidden="true" weight="fill" /></div>
        <p className="demo-disclaimer">{gameScopeLabel(gameRounds[0].scope)}</p>
        <h2 ref={titleRef} id="bubble-game-title" data-route-heading tabIndex={-1}>本局完成</h2>
        <p className="bubble-game__result">答对 {result.correctRounds} / {result.rounds} 轮</p>
        <p>你完成了这一轮看图找词小游戏，可以回到学习继续巩固。</p>
        <button className="bubble-game__return" type="button" onClick={onReturnToLearning}>
          回到学习 <ArrowRight aria-hidden="true" weight="bold" />
        </button>
      </section>
    )
  }

  return (
    <section className="bubble-game" aria-labelledby="bubble-game-title">
      <header className="bubble-game__header">
        <div>
          <button className="bubble-game__back" type="button" onClick={onBackToHub}>
            <ArrowLeft aria-hidden="true" weight="bold" /> 返回游戏中心
          </button>
          <p className="demo-disclaimer">{gameScopeLabel(current.scope)}</p>
          <h2 ref={titleRef} id="bubble-game-title" data-route-heading tabIndex={-1}>泡泡找单词</h2>
          <p>第 {roundIndex + 1} / {gameRounds.length} 轮</p>
        </div>
        <Sparkle className="bubble-game__sparkle" aria-hidden="true" weight="fill" />
      </header>

      <div className="bubble-game__stage">
        <figure className="bubble-game__target" data-testid="bubble-target" data-word-id={current.target.id}>
          <WordArtwork revealTerm={false} wordId={current.target.id} meaningZh={current.target.meaningZh} image={current.target.image} term={current.target.term} />
          <figcaption>找到和“{current.target.meaningZh}”对应的英文单词</figcaption>
        </figure>
        <div className="bubble-game__choices" aria-label="英文单词泡泡">
          {current.choices.map((choice, index) => {
            const correctChoice = isCorrect && choice.id === current.target.id
            return (
              <button
                key={choice.id}
                className={`bubble-game__choice bubble-game__choice--${index + 1}${correctChoice ? ' bubble-game__choice--correct' : ''}`}
                type="button"
                data-word-id={choice.id}
                aria-label={correctChoice ? `${choice.term}，正确答案` : choice.term}
                disabled={isCorrect}
                onClick={() => answer(choice.id)}
              >
                {choice.term}
              </button>
            )
          })}
        </div>
      </div>

      {wrongAttempts > 0 && !isCorrect && <p className="bubble-game__feedback" role="status" aria-live="polite">再试一次，看看图片的小细节吧！</p>}
      {isCorrect && <div className="bubble-game__next-row"><p className="bubble-game__feedback bubble-game__feedback--correct" role="status">找对啦，真棒！</p><button className="bubble-game__next" type="button" onClick={nextRound}>下一题 <ArrowRight aria-hidden="true" weight="bold" /></button></div>}
      <p className="bubble-game__note">每次作答都会进入真实学习记录，用于安排后续复习。</p>
    </section>
  )
}
