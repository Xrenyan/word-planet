import { ArrowLeft, ArrowRight, CardsThree, CheckCircle } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { GameAttempt, GameCompletionCallbacks, GameWord } from './engine'
import { createMemoryDeck, type MemoryCard } from './memoryEngine'
import { WordArtwork } from '../learning/WordArtwork'

type MemoryFlipGameProps = GameCompletionCallbacks & {
  words: readonly GameWord[]
  seed?: number
  groups?: 2 | 3 | 4
  onReturnToLearning: () => void
  onBackToHub: () => void
  onAttempt?: (attempt: GameAttempt) => void
}

function revealedLabel(card: MemoryCard, matched: boolean) {
  const prefix = matched ? '已配对：' : ''
  if (card.kind === 'image') return `${prefix}图片：${card.image.alt}`
  return `${prefix}${card.kind === 'term' ? '英文' : '中文'}：${card.text}`
}

export function MemoryFlipGame({ words, seed = 20260820, groups = 4, ...props }: MemoryFlipGameProps) {
  const deck = createMemoryDeck(words, seed, groups)
  return <MemoryFlipSession key={JSON.stringify(deck)} deck={deck} {...props} />
}

function MemoryFlipSession({ deck, onReturnToLearning, onBackToHub, onAttempt, onComplete, onReplay, onNextChallenge }: Omit<MemoryFlipGameProps, 'words' | 'seed' | 'groups'> & { deck: readonly MemoryCard[] }) {
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([])
  const [matchedWordIds, setMatchedWordIds] = useState<readonly string[]>([])
  const [mismatch, setMismatch] = useState(false)
  const [message, setMessage] = useState('')
  const [finished, setFinished] = useState(false)
  const selectionRef = useRef({ selected: [] as readonly string[], matched: [] as readonly string[], mismatch: false, finished: false })
  const mismatchedWordIdsRef = useRef(new Set<string>())
  const completionReportedRef = useRef(false)
  const [focusRequest, setFocusRequest] = useState<{ target: 'heading' | 'continue' | 'card'; cardId?: string; sequence: number }>({ target: 'heading', sequence: 0 })
  const titleRef = useRef<HTMLHeadingElement>(null)
  const continueRef = useRef<HTMLButtonElement>(null)
  const cardRefs = useRef(new Map<string, HTMLButtonElement>())
  const wordCount = useMemo(() => new Set(deck.map((card) => card.wordId)).size, [deck])

  useEffect(() => {
    if (!finished || completionReportedRef.current || !onComplete) return
    completionReportedRef.current = true
    // These are memory groups completed without a prior wrong triple, not vocabulary misses.
    const firstTryCorrect = matchedWordIds.filter(wordId => !mismatchedWordIdsRef.current.has(wordId)).length
    onComplete({ completedRounds: matchedWordIds.length, totalRounds: wordCount, firstTryCorrect })
  }, [finished, matchedWordIds, wordCount, onComplete])

  useEffect(() => {
    if (finished || focusRequest.target === 'heading') {
      titleRef.current?.focus({ preventScroll: true })
      return
    }
    if (focusRequest.target === 'continue') {
      continueRef.current?.focus()
      return
    }
    const card = focusRequest.cardId ? cardRefs.current.get(focusRequest.cardId) : undefined
    if (card?.isConnected && !card.disabled) {
      card.focus()
      card.scrollIntoView?.({ block: 'center', inline: 'nearest' })
    }
  }, [finished, focusRequest])

  function requestFocus(target: 'heading' | 'continue' | 'card', cardId?: string) {
    setFocusRequest((request) => ({ target, cardId, sequence: request.sequence + 1 }))
  }

  function select(card: MemoryCard) {
    const selection = selectionRef.current
    if (selection.finished || selection.mismatch || selection.matched.includes(card.wordId) || selection.selected.length >= 3) return
    if (selection.selected.includes(card.id)) {
      selection.selected = Object.freeze(selection.selected.filter((id) => id !== card.id))
      setSelectedIds(selection.selected)
      setMessage('这张卡已盖回去，可以重新选择。')
      requestFocus('card', card.id)
      return
    }
    const nextIds = Object.freeze([...selection.selected, card.id])
    selection.selected = nextIds
    setSelectedIds(nextIds)
    if (nextIds.length < 3) return
    const selected = nextIds.map((id) => deck.find((candidate) => candidate.id === id)!)
    const isTriple = new Set(selected.map((candidate) => candidate.wordId)).size === 1 && new Set(selected.map((candidate) => candidate.kind)).size === 3
    if (!isTriple) {
      for (const selectedCard of selected) mismatchedWordIdsRef.current.add(selectedCard.wordId)
      selection.mismatch = true
      setMismatch(true)
      setMessage('还不是同一组，记住它们的位置，再继续翻牌吧！')
      requestFocus('continue')
      return
    }
    const wordId = selected[0].wordId
    const matched = Object.freeze([...selection.matched, wordId])
    selection.matched = matched
    selection.selected = Object.freeze([])
    setMatchedWordIds(matched)
    setSelectedIds(Object.freeze([]))
    setMessage('配成一组啦！')
    if (matched.length === wordCount) {
      selection.finished = true
      setFinished(true)
      onAttempt?.({ wordId, outcome: 'correct' })
      return
    }
    const nextCard = deck.find((candidate) => !matched.includes(candidate.wordId))
    if (nextCard) requestFocus('card', nextCard.id)
    onAttempt?.({ wordId, outcome: 'correct' })
  }

  function continueAfterMismatch() {
    const selection = selectionRef.current
    if (!selection.mismatch) return
    const firstClosedCardId = selection.selected[0]
    selection.selected = Object.freeze([])
    selection.mismatch = false
    setSelectedIds(selection.selected)
    setMismatch(false)
    setMessage('继续找同一组的图片、英文和中文吧！')
    if (firstClosedCardId) requestFocus('card', firstClosedCardId)
  }

  if (finished) {
    return (
      <section className="memory-game memory-game--complete" aria-labelledby="memory-game-title">
        <div className="memory-game__complete-badge"><CheckCircle aria-hidden="true" weight="fill" /></div>
        <p className="demo-disclaimer">游戏星岛</p>
        <h2 ref={titleRef} id="memory-game-title" data-route-heading tabIndex={-1}>翻翻乐完成</h2>
        <p className="memory-game__result">完成 {matchedWordIds.length} / {wordCount} 组</p>
        <p>每组都找齐啦！再选个游戏，或回去学单词吧。</p>
        {onReplay && <button className="game-back" type="button" onClick={onReplay}>再玩一次</button>}
        {onNextChallenge && <button className="memory-game__return" type="button" onClick={onNextChallenge}>下一关 <ArrowRight aria-hidden="true" weight="bold" /></button>}
        <button className="game-back" type="button" onClick={onBackToHub}><ArrowLeft aria-hidden="true" weight="bold" /> 返回游戏中心</button>
        <button className="memory-game__return" type="button" onClick={onReturnToLearning}>回到学习 <ArrowRight aria-hidden="true" weight="bold" /></button>
      </section>
    )
  }

  return (
    <section className="memory-game" aria-labelledby="memory-game-title">
      <header className="memory-game__header">
        <div>
          <button className="game-back" type="button" onClick={onBackToHub}><ArrowLeft aria-hidden="true" weight="bold" /> 返回游戏中心</button>
          <p className="demo-disclaimer">游戏星岛</p>
          <h2 ref={titleRef} id="memory-game-title" data-route-heading tabIndex={-1}>记忆翻翻乐</h2>
          <p>每组找到同一个词的图片、英文和中文，没有倒计时。</p>
        </div>
        <CardsThree aria-hidden="true" weight="duotone" />
      </header>
      <div className="memory-game__progress">已配对 {matchedWordIds.length} / {wordCount} 组</div>
      <div className="memory-game__deck" aria-label="记忆翻翻乐卡片">
        {deck.map((card, index) => {
          const matched = matchedWordIds.includes(card.wordId)
          const meaningCard = deck.find(item => item.wordId === card.wordId && item.kind === 'meaning')
          const meaning = meaningCard?.kind === 'meaning' ? meaningCard.text : '词义配图'
          const revealed = matched || selectedIds.includes(card.id)
          return (
            <button
              className={`memory-game__card${revealed ? ' memory-game__card--revealed' : ''}${matched ? ' memory-game__card--matched' : ''}`}
              key={card.id}
              type="button"
              data-card-id={card.id}
              data-word-id={card.wordId}
              ref={(node) => { if (node) cardRefs.current.set(card.id, node); else cardRefs.current.delete(card.id) }}
              aria-pressed={revealed}
              aria-label={revealed ? revealedLabel(card, matched) : `未翻开的记忆卡片 ${index + 1}`}
              disabled={matched || mismatch}
              onClick={() => select(card)}
            >
              <span className="memory-game__card-inner">
                <span className="memory-game__card-front" aria-hidden="true"><CardsThree weight="fill" /></span>
                <span className="memory-game__card-back">
                  {revealed && (card.kind === 'image' ? <WordArtwork revealTerm={false} meaningZh={meaning} image={card.image} term="" wordId={card.wordId} /> : <span>{card.text}</span>)}
                  {matched && <small>已配对</small>}
                </span>
              </span>
            </button>
          )
        })}
      </div>
      <div className="memory-game__feedback" aria-live="polite" role="status">{message}</div>
      {mismatch && <button ref={continueRef} className="memory-game__continue" type="button" onClick={continueAfterMismatch}>继续翻牌</button>}
      <p className="memory-game__note">记住卡片的位置，慢慢找齐每一组。</p>
    </section>
  )
}
