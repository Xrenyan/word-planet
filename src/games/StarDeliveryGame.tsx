import { ArrowLeft, ArrowRight, CheckCircle, Package, Pause, Play, RocketLaunch } from '@phosphor-icons/react'
import { useEffect, useId, useReducer, useRef } from 'react'

import { WordArtwork } from '../learning/WordArtwork'
import { createDeliverySchedule } from './deliveryEngine'
import type { GameAttempt, GameRound, GameWord } from './engine'

type StarDeliveryGameProps = {
  words: readonly GameWord[]
  rounds?: number
  seed?: number
  onReturnToLearning: () => void
  onBackToHub: () => void
  onAttempt?: (attempt: GameAttempt) => void
}

type DeliveryState = Readonly<{
  status: 'idle' | 'running' | 'paused' | 'complete'
  remaining: number
  roundIndex: number
  attempted: number
  correct: number
  feedback: string
  reason: 'time' | 'schedule' | null
  currentRoundId: string
}>

type DeliveryAction =
  | { type: 'start' }
  | { type: 'tick' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'answer'; correct: boolean; roundCount: number; roundId: string; roundIndex: number; nextRoundId: string | null }

function createInitialState(schedule: readonly GameRound[]): DeliveryState {
  return Object.freeze({ status: 'idle', remaining: 30, roundIndex: 0, attempted: 0, correct: 0, feedback: '', reason: null, currentRoundId: schedule[0].roundId })
}

function deliveryReducer(state: DeliveryState, action: DeliveryAction): DeliveryState {
  if (action.type === 'start') return state.status === 'idle' ? { ...state, status: 'running' } : state
  if (action.type === 'tick') {
    if (state.status !== 'running') return state
    if (state.remaining <= 1) return { ...state, status: 'complete', remaining: 0, reason: 'time' }
    return { ...state, remaining: state.remaining - 1 }
  }
  if (action.type === 'pause') return state.status === 'running' ? { ...state, status: 'paused' } : state
  if (action.type === 'resume') return state.status === 'paused' ? { ...state, status: 'running' } : state
  if (state.status !== 'running' || action.roundId !== state.currentRoundId || action.roundIndex !== state.roundIndex) return state
  const attempted = state.attempted + 1
  const correct = state.correct + (action.correct ? 1 : 0)
  const feedback = action.correct ? '投递正确，下一单出发！' : '没关系，这一单也安全送达了，继续出发！'
  if (state.roundIndex + 1 >= action.roundCount) {
    return { ...state, status: 'complete', attempted, correct, feedback, reason: 'schedule' }
  }
  if (!action.nextRoundId) return state
  return { ...state, roundIndex: state.roundIndex + 1, currentRoundId: action.nextRoundId, attempted, correct, feedback }
}

export function StarDeliveryGame({ words, rounds = 20, seed = 20260821, onReturnToLearning, onBackToHub, onAttempt }: StarDeliveryGameProps) {
  const schedule = createDeliverySchedule(words, seed, rounds)
  return <StarDeliverySession key={JSON.stringify(schedule)} schedule={schedule} onReturnToLearning={onReturnToLearning} onBackToHub={onBackToHub} onAttempt={onAttempt} />
}

function StarDeliverySession({ schedule, onReturnToLearning, onBackToHub, onAttempt }: { schedule: readonly GameRound[]; onReturnToLearning: () => void; onBackToHub: () => void; onAttempt?: (attempt: GameAttempt) => void }) {
  const titleId = `delivery-game-title-${useId()}`
  const [state, dispatch] = useReducer(deliveryReducer, schedule, createInitialState)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const choiceRefs = useRef(new Map<string, HTMLButtonElement>())
  const current = schedule[state.roundIndex]

  useEffect(() => {
    if (state.status !== 'running') return undefined
    const interval = window.setInterval(() => dispatch({ type: 'tick' }), 1_000)
    return () => window.clearInterval(interval)
  }, [state.status])

  useEffect(() => {
    if (state.status === 'idle' || state.status === 'complete') {
      titleRef.current?.focus({ preventScroll: true })
      return
    }
    if (state.status === 'running') {
      const first = choiceRefs.current.get(current.choices[0].id)
      first?.focus({ preventScroll: true })
      first?.scrollIntoView?.({ block: 'center', inline: 'nearest' })
    }
  }, [current, state.status])

  function answerCurrent(choiceId: string) {
    if (state.status !== 'running') return
    onAttempt?.({ wordId: current.target.id, outcome: choiceId === current.target.id ? 'correct' : 'missed' })
    dispatch({
      type: 'answer',
      correct: choiceId === current.target.id,
      roundCount: schedule.length,
      roundId: current.roundId,
      roundIndex: current.roundIndex,
      nextRoundId: schedule[state.roundIndex + 1]?.roundId ?? null,
    })
  }

  if (state.status === 'complete') {
    return (
      <section className="delivery-game delivery-game--complete" aria-labelledby={titleId}>
        <div className="delivery-game__complete-badge"><CheckCircle aria-hidden="true" weight="fill" /></div>
        <p className="demo-disclaimer">游戏星岛</p>
        <h2 ref={titleRef} id={titleId} data-route-heading tabIndex={-1}>速递完成</h2>
        <p className="delivery-game__result">答对 {state.correct} / 作答 {state.attempted}</p>
        <p>{state.reason === 'time' ? '时间到，速递已安全停靠。' : `全部 ${schedule.length} 单都已送达。`}</p>
        <p>辛苦啦！再选个游戏，或回去学单词吧。</p>
        <div className="delivery-game__complete-actions">
          <button className="game-back" type="button" onClick={onBackToHub}><ArrowLeft aria-hidden="true" weight="bold" /> 返回游戏中心</button>
          <button className="delivery-game__return" type="button" onClick={onReturnToLearning}>回到学习 <ArrowRight aria-hidden="true" weight="bold" /></button>
        </div>
      </section>
    )
  }

  if (state.status === 'idle') {
    return (
      <section className="delivery-game delivery-game--start" aria-labelledby={titleId}>
        <button className="game-back" type="button" onClick={onBackToHub}><ArrowLeft aria-hidden="true" weight="bold" /> 返回游戏中心</button>
        <div className="delivery-game__start-icon"><RocketLaunch aria-hidden="true" weight="duotone" /></div>
        <p className="demo-disclaimer">游戏星岛</p>
        <h2 ref={titleRef} id={titleId} data-route-heading tabIndex={-1}>星际速递</h2>
        <p>准备好后再开始。30 秒内最多完成 {schedule.length} 单，看图和中文选择英文。</p>
        <button className="delivery-game__start" type="button" onClick={() => dispatch({ type: 'start' })}><Play aria-hidden="true" weight="fill" /> 开始 30 秒速递</button>
        <p className="delivery-game__note">按下开始才计时，途中也可以暂停休息。</p>
      </section>
    )
  }

  const paused = state.status === 'paused'
  return (
    <section className="delivery-game" aria-labelledby={titleId}>
      <header className="delivery-game__header">
        <div>
          <button className="game-back" type="button" onClick={onBackToHub}><ArrowLeft aria-hidden="true" weight="bold" /> 返回游戏中心</button>
          <p className="demo-disclaimer">游戏星岛</p>
          <h2 ref={titleRef} id={titleId} data-route-heading tabIndex={-1}>星际速递</h2>
          <p>第 {state.roundIndex + 1} / {schedule.length} 单</p>
        </div>
        <Package aria-hidden="true" weight="duotone" />
      </header>
      <div className="delivery-game__hud">
        <p role="timer" aria-live="off" aria-label={`剩余时间 ${state.remaining} 秒`}>{state.remaining} 秒</p>
        <p aria-label={`已作答 ${state.attempted} 单，答对 ${state.correct} 单`}>作答 {state.attempted} · 答对 {state.correct}</p>
        <button type="button" onClick={() => dispatch({ type: paused ? 'resume' : 'pause' })}>
          {paused ? <Play aria-hidden="true" weight="fill" /> : <Pause aria-hidden="true" weight="fill" />}{paused ? '继续' : '暂停'}
        </button>
      </div>
      <div className={`delivery-game__stage${paused ? ' delivery-game__stage--paused' : ''}`} aria-busy={paused}>
        <figure className="delivery-game__target" data-testid="delivery-target" data-word-id={current.target.id}>
          <WordArtwork revealTerm={false} wordId={current.target.id} meaningZh={current.target.meaningZh} image={current.target.image} term={current.target.term} />
          <figcaption>把“{current.target.meaningZh}”送到正确的英文站点</figcaption>
        </figure>
        <div className="delivery-game__choices" aria-label="速递英文站点">
          {current.choices.map((choice) => (
            <button
              key={choice.id}
              ref={(node) => { if (node) choiceRefs.current.set(choice.id, node); else choiceRefs.current.delete(choice.id) }}
              type="button"
              data-word-id={choice.id}
              disabled={paused}
              onClick={() => answerCurrent(choice.id)}
            >{choice.term}</button>
          ))}
        </div>
      </div>
      {(paused || state.feedback) && <p className="delivery-game__feedback" role="status" aria-live="polite">{paused ? '速递已暂停，准备好后点继续。' : state.feedback}</p>}
      <p className="delivery-game__note">看清提示再出发，需要休息就点暂停。</p>
    </section>
  )
}
