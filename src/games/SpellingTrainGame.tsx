import { ArrowLeft, ArrowRight, Backspace, CheckCircle, Train } from '@phosphor-icons/react'
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'

import { WordArtwork } from '../learning/WordArtwork'
import { createGameRounds, type GameAttempt, type GameCompletionCallbacks, type GameRound, type GameWord } from './engine'

type SpellingTrainGameProps = GameCompletionCallbacks & {
  words: readonly GameWord[]
  rounds?: number
  seed?: number
  onReturnToLearning: () => void
  onBackToHub: () => void
  onAttempt?: (attempt: GameAttempt) => void
}

type SpellingTrainSessionProps = Omit<SpellingTrainGameProps, 'words'> & {
  gameRounds: readonly GameRound[]
}

function shuffledLetters(term: string, seed: number): readonly string[] {
  const result = [...term]
  let cursor = seed >>> 0
  for (let index = result.length - 1; index > 0; index -= 1) {
    cursor = (Math.imul(cursor ^ (cursor >>> 16), 0x45d9f3b) + index) >>> 0
    const swap = cursor % (index + 1)
    ;[result[index], result[swap]] = [result[swap], result[index]]
  }
  if (result.join('') === term) {
    const differentIndex = result.findIndex((letter) => letter !== result[0])
    if (differentIndex > 0) [result[0], result[differentIndex]] = [result[differentIndex], result[0]]
  }
  return Object.freeze(result)
}

/** Trim and case-fold only; missing, extra and internal characters remain significant. */
function normalizeSpelling(value: string) {
  return value.trim().toLocaleLowerCase('en-US')
}

export function SpellingTrainGame({ words, rounds = 2, seed = 20260819, ...props }: SpellingTrainGameProps) {
  const gameRounds = createGameRounds(words, seed, rounds)
  return (
    <SpellingTrainSession
      key={JSON.stringify(gameRounds)}
      gameRounds={gameRounds}
      rounds={rounds}
      seed={seed}
      {...props}
    />
  )
}

function SpellingTrainSession({ gameRounds, onReturnToLearning, onBackToHub, onAttempt, onComplete, onReplay, onNextChallenge }: SpellingTrainSessionProps) {
  const [roundIndex, setRoundIndex] = useState(0)
  const [answer, setAnswer] = useState('')
  const [feedback, setFeedback] = useState<'empty' | 'wrong' | 'correct' | null>(null)
  const [finished, setFinished] = useState(false)
  const [firstTryCorrect, setFirstTryCorrect] = useState(0)
  const activeRoundIndexRef = useRef(0)
  const attemptedRoundIdsRef = useRef(new Set<string>())
  const solvedRoundIdsRef = useRef(new Set<string>())
  const completionReportedRef = useRef(false)
  const [focusRequest, setFocusRequest] = useState<{ target: 'heading' | 'input' | 'next'; sequence: number }>({ target: 'heading', sequence: 0 })
  const inputRef = useRef<HTMLInputElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const current = gameRounds[roundIndex]
  const letters = useMemo(() => shuffledLetters(current.target.term, current.seed), [current])

  useEffect(() => {
    if (!finished || completionReportedRef.current || !onComplete) return
    completionReportedRef.current = true
    onComplete({ completedRounds: solvedRoundIdsRef.current.size, totalRounds: gameRounds.length, firstTryCorrect })
  }, [finished, firstTryCorrect, gameRounds.length, onComplete])

  useEffect(() => {
    if (finished || focusRequest.target === 'heading') {
      titleRef.current?.focus({ preventScroll: true })
      return
    }
    if (focusRequest.target === 'next') {
      nextRef.current?.focus({ preventScroll: true })
      return
    }
    inputRef.current?.focus({ preventScroll: true })
    inputRef.current?.scrollIntoView?.({ block: 'center', inline: 'nearest' })
  }, [finished, focusRequest])

  function requestFocus(target: 'heading' | 'input' | 'next') {
    setFocusRequest((request) => ({ target, sequence: request.sequence + 1 }))
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (activeRoundIndexRef.current !== roundIndex || solvedRoundIdsRef.current.has(current.roundId) || finished) return
    if (answer.length === 0 || answer.trim().length === 0) {
      setFeedback('empty')
      requestFocus('input')
      return
    }
    const correct = normalizeSpelling(answer) === normalizeSpelling(current.target.term)
    if (correct) {
      solvedRoundIdsRef.current.add(current.roundId)
      if (!attemptedRoundIdsRef.current.has(current.roundId)) setFirstTryCorrect(count => count + 1)
    }
    attemptedRoundIdsRef.current.add(current.roundId)
    setFeedback(correct ? 'correct' : 'wrong')
    requestFocus(correct ? 'next' : 'input')
    onAttempt?.({ wordId: current.target.id, outcome: correct ? 'correct' : 'missed' })
  }

  function nextRound() {
    if (activeRoundIndexRef.current !== roundIndex || !solvedRoundIdsRef.current.has(current.roundId)) return
    activeRoundIndexRef.current = roundIndex + 1
    if (roundIndex + 1 >= gameRounds.length) {
      setFinished(true)
      return
    }
    setRoundIndex(roundIndex + 1)
    setAnswer('')
    setFeedback(null)
    requestFocus('input')
  }

  if (finished) {
    return (
      <section className="train-game train-game--complete" aria-labelledby="train-game-title">
        <div className="train-game__complete-badge"><CheckCircle aria-hidden="true" weight="fill" /></div>
        <p className="demo-disclaimer">游戏星岛</p>
        <h2 ref={titleRef} id="train-game-title" data-route-heading tabIndex={-1}>小火车到站啦</h2>
        <p className="train-game__result">完成 {solvedRoundIdsRef.current.size} / {gameRounds.length} 轮</p>
        <p>首次拼对 {firstTryCorrect} / {gameRounds.length} 轮</p>
        <p>单词都上车啦！再选个游戏，或回去学单词吧。</p>
        {onReplay && <button className="game-back" type="button" onClick={onReplay}>再玩一次</button>}
        {onNextChallenge && <button className="train-game__return" type="button" onClick={onNextChallenge}>下一关 <ArrowRight aria-hidden="true" weight="bold" /></button>}
        <button className="game-back" type="button" onClick={onBackToHub}><ArrowLeft aria-hidden="true" weight="bold" /> 返回游戏中心</button>
        <button className="train-game__return" type="button" onClick={onReturnToLearning}>回到学习 <ArrowRight aria-hidden="true" weight="bold" /></button>
      </section>
    )
  }

  return (
    <section className="train-game" aria-labelledby="train-game-title">
      <header className="train-game__header">
        <div>
          <button className="game-back" type="button" onClick={onBackToHub}><ArrowLeft aria-hidden="true" weight="bold" /> 返回游戏中心</button>
          <p className="demo-disclaimer">游戏星岛</p>
          <h2 ref={titleRef} id="train-game-title" data-route-heading tabIndex={-1}>拼写小火车</h2>
          <p>{`第 ${roundIndex + 1} / ${gameRounds.length} 轮`}</p>
        </div>
        <Train aria-hidden="true" weight="duotone" />
      </header>

      <div className="train-game__stage">
        <figure className="train-game__target" data-testid="train-target" data-word-id={current.target.id}>
          <WordArtwork priority revealTerm={false} wordId={current.target.id} meaningZh={current.target.meaningZh} image={current.target.image} term={current.target.term} />
          <figcaption>{current.target.meaningZh}</figcaption>
        </figure>
        <div className="train-game__practice">
          <p className="train-game__prompt">看图和中文，把英文单词开进车厢吧！</p>
          <div className="train-game__rail" aria-label={`${current.target.term.length} 个字母车厢`}>
            {[...current.target.term].map((_, index) => (
              <span className="train-game__car" data-testid="train-letter-slot" key={index} aria-hidden="true">
                {answer[index] ?? ' '}
              </span>
            ))}
          </div>
          <form key={current.roundId} className="train-game__form" onSubmit={submit}>
            <label htmlFor="train-answer">输入英文单词</label>
            <input
              ref={inputRef}
              id="train-answer"
              value={answer}
              autoComplete="off"
              spellCheck={false}
              disabled={feedback === 'correct'}
              onChange={(event) => { setAnswer(event.target.value); if (feedback !== null) setFeedback(null) }}
            />
            <div className="train-game__touch-letters" aria-label="触摸字母键盘">
              {letters.map((letter, index) => (
                <button key={`${letter}-${index}`} type="button" disabled={feedback === 'correct'} aria-label={letter === ' ' ? '输入空格' : `输入字母 ${letter.toUpperCase()}`} onClick={() => setAnswer((value) => `${value}${letter}`)}>
                  {letter === ' ' ? '空格' : letter.toUpperCase()}
                </button>
              ))}
              <button type="button" disabled={feedback === 'correct' || answer.length === 0} aria-label="删除一个字母" onClick={() => setAnswer((value) => value.slice(0, -1))}><Backspace aria-hidden="true" weight="bold" /></button>
            </div>
            <div className="train-game__actions">
              <button className="train-game__check" type="submit" disabled={feedback === 'correct'}>检查拼写</button>
              {feedback === 'correct' && <button ref={nextRef} className="train-game__next" type="button" onClick={nextRound}>{roundIndex + 1 === gameRounds.length ? '看看结果' : '下一站'} <ArrowRight aria-hidden="true" weight="bold" /></button>}
            </div>
          </form>
          <div className="train-game__feedback" aria-live="polite" role="status">
            {feedback === 'empty' && '先写下你的答案，再来检查吧。'}
            {feedback === 'wrong' && '还差一点，检查有没有漏掉或多写字母吧！'}
            {feedback === 'correct' && '拼对啦！'}
          </div>
        </div>
      </div>
      <p className="train-game__note">点字母或用键盘输入，准备好后检查拼写。</p>
    </section>
  )
}
