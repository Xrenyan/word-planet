import { ArrowLeft, ArrowRight, CardsThree, CheckCircle } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { createGameRound, gameScopeLabel, type GameAttempt, type GameScope, type GameWord } from './engine'
import { createMemoryDeck, type MemoryCard } from './memoryEngine'
import { WordArtwork } from '../learning/WordArtwork'

type MemoryFlipGameProps = {
  words: readonly GameWord[]
  seed?: number
  onReturnToLearning: () => void
  onBackToHub: () => void
  onAttempt?: (attempt: GameAttempt) => void
}

function revealedLabel(card: MemoryCard, matched: boolean) {
  const prefix = matched ? '已配对：' : ''
  if (card.kind === 'image') return `${prefix}图片：${card.image.alt}`
  return `${prefix}${card.kind === 'term' ? '英文' : '中文'}：${card.text}`
}

export function MemoryFlipGame({ words, seed = 20260820, onReturnToLearning, onBackToHub, onAttempt }: MemoryFlipGameProps) {
  const deck = createMemoryDeck(words, seed)
  const scope = createGameRound(words, seed).scope
  return <MemoryFlipSession key={JSON.stringify(deck)} deck={deck} scope={scope} onReturnToLearning={onReturnToLearning} onBackToHub={onBackToHub} onAttempt={onAttempt} />
}

function MemoryFlipSession({ deck, scope, onReturnToLearning, onBackToHub, onAttempt }: { deck: readonly MemoryCard[]; scope: GameScope; onReturnToLearning: () => void; onBackToHub: () => void; onAttempt?: (attempt: GameAttempt) => void }) {
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([])
  const [matchedWordIds, setMatchedWordIds] = useState<readonly string[]>([])
  const [mismatch, setMismatch] = useState(false)
  const [message, setMessage] = useState('')
  const [finished, setFinished] = useState(false)
  const [focusRequest, setFocusRequest] = useState<{ target: 'heading' | 'continue' | 'card'; cardId?: string; sequence: number }>({ target: 'heading', sequence: 0 })
  const titleRef = useRef<HTMLHeadingElement>(null)
  const continueRef = useRef<HTMLButtonElement>(null)
  const cardRefs = useRef(new Map<string, HTMLButtonElement>())
  const wordCount = useMemo(() => new Set(deck.map((card) => card.wordId)).size, [deck])

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
    if (finished || mismatch || matchedWordIds.includes(card.wordId) || selectedIds.length >= 3) return
    if (selectedIds.includes(card.id)) {
      setSelectedIds(Object.freeze(selectedIds.filter((id) => id !== card.id)))
      setMessage('这张卡已盖回去，可以重新选择。')
      requestFocus('card', card.id)
      return
    }
    const nextIds = Object.freeze([...selectedIds, card.id])
    setSelectedIds(nextIds)
    if (nextIds.length < 3) return
    const selected = nextIds.map((id) => deck.find((candidate) => candidate.id === id)!)
    const isTriple = new Set(selected.map((candidate) => candidate.wordId)).size === 1 && new Set(selected.map((candidate) => candidate.kind)).size === 3
    if (!isTriple) {
      for (const wordId of new Set(selected.map((candidate) => candidate.wordId))) onAttempt?.({ wordId, outcome: 'missed' })
      setMismatch(true)
      setMessage('还不是同一组，记住它们的位置，再继续翻牌吧！')
      requestFocus('continue')
      return
    }
    const wordId = selected[0].wordId
    onAttempt?.({ wordId, outcome: 'correct' })
    const matched = Object.freeze([...matchedWordIds, wordId])
    setMatchedWordIds(matched)
    setSelectedIds(Object.freeze([]))
    setMessage('配成一组啦！')
    if (matched.length === wordCount) {
      setFinished(true)
      return
    }
    const nextCard = deck.find((candidate) => !matched.includes(candidate.wordId))
    if (nextCard) requestFocus('card', nextCard.id)
  }

  function continueAfterMismatch() {
    if (!mismatch) return
    const firstClosedCardId = selectedIds[0]
    setSelectedIds(Object.freeze([]))
    setMismatch(false)
    setMessage('继续找同一组的图片、英文和中文吧！')
    if (firstClosedCardId) requestFocus('card', firstClosedCardId)
  }

  if (finished) {
    return (
      <section className="memory-game memory-game--complete" aria-labelledby="memory-game-title">
        <div className="memory-game__complete-badge"><CheckCircle aria-hidden="true" weight="fill" /></div>
        <p className="demo-disclaimer">{gameScopeLabel(scope)}</p>
        <h2 ref={titleRef} id="memory-game-title" data-route-heading tabIndex={-1}>翻翻乐完成</h2>
        <p className="memory-game__result">完成 {matchedWordIds.length} / {wordCount} 组</p>
        <p>这是本局实际配对结果，可以回到学习继续巩固。</p>
        <button className="memory-game__return" type="button" onClick={onReturnToLearning}>回到学习 <ArrowRight aria-hidden="true" weight="bold" /></button>
      </section>
    )
  }

  return (
    <section className="memory-game" aria-labelledby="memory-game-title">
      <header className="memory-game__header">
        <div>
          <button className="game-back" type="button" onClick={onBackToHub}><ArrowLeft aria-hidden="true" weight="bold" /> 返回游戏中心</button>
          <p className="demo-disclaimer">{gameScopeLabel(scope)}</p>
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
      <p className="memory-game__note">配对和错配都会进入真实学习记录，帮助安排复习。</p>
    </section>
  )
}
