import { CardsThree, GameController, LockKey, RocketLaunch, ShieldCheck, Sparkle, Train } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { WordPlanetApi } from '../app/api/client'
import type { BookSummary, LearningEvent, VocabularyWordContract } from '../../shared/contracts'
import { toPublicMatchedGameWord } from '../data/publicMatchedGameWord'
import type { GameWord } from './engine'
import { BubbleMatchGame } from './BubbleMatchGame'
import { MemoryFlipGame } from './MemoryFlipGame'
import { PlanetGuardianGame } from './PlanetGuardianGame'
import { SpellingTrainGame } from './SpellingTrainGame'
import { StarDeliveryGame } from './StarDeliveryGame'

type GameHubProps = {
  onReturnToLearning: () => void
  api: WordPlanetApi
  progressRecorder: { record(event: LearningEvent): Promise<'saved' | 'memory-only' | 'synced' | 'queued'> }
}

export function GameHub({ onReturnToLearning, api, progressRecorder }: GameHubProps) {
  const [selectedGame, setSelectedGame] = useState<'hub' | 'bubble' | 'train' | 'memory' | 'delivery' | 'guardian'>('hub')
  const [books, setBooks] = useState<readonly BookSummary[]>([])
  const [bookId, setBookId] = useState('')
  const [unit, setUnit] = useState(1)
  const [sourceWords, setSourceWords] = useState<readonly VocabularyWordContract[]>([])
  const [sourceStatus, setSourceStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(api ? 'loading' : 'idle')
  const [refreshKey, setRefreshKey] = useState(0)
  const titleRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (!api) return
    const controller = new AbortController()
    setSourceStatus('loading')
    void api.getBooks(controller.signal).then(({ books: values }) => {
      const available = values.filter((book) => (book.availableWordCount ?? book.verifiedWordCount) > 0)
      setBooks(available)
      setBookId((current) => current || available[0]?.id || '')
      if (available.length === 0) setSourceStatus('error')
    }).catch((error) => {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setSourceStatus('error')
    })
    return () => controller.abort()
  }, [api, refreshKey])

  useEffect(() => {
    if (!api || !bookId) return
    const controller = new AbortController()
    setSourceStatus('loading')
    setSourceWords([])
    void api.getWords(bookId, undefined, controller.signal).then(({ words }) => {
      setSourceWords(words)
      setSourceStatus('ready')
    }).catch((error) => {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setSourceStatus('error')
    })
    return () => controller.abort()
  }, [api, bookId])

  const units = useMemo(() => [...new Set(sourceWords.map((word) => word.unit))], [sourceWords])
  const selectedBook = books.find((book) => book.id === bookId)
  const publicGameWords = useMemo(() => sourceWords
    .filter((word) => word.unit === unit)
    .slice(0, 12)
    .map((word) => toPublicMatchedGameWord(word, (selectedBook?.grade ?? 3) as 3 | 4 | 5 | 6, selectedBook?.semester ?? 'upper')), [selectedBook, sourceWords, unit])
  const gameWords: readonly GameWord[] = publicGameWords
  const usingPublicWords = publicGameWords.length > 0
  const isLoadingSource = Boolean(api) && sourceStatus === 'loading'

  useEffect(() => {
    if (selectedGame === 'hub') titleRef.current?.focus({ preventScroll: true })
  }, [selectedGame])

  function returnToHub() {
    setSelectedGame('hub')
    window.scrollTo(0, 0)
  }

  function startGame(game: Exclude<typeof selectedGame, 'hub'>) {
    if (gameWords.length === 0) return
    setSelectedGame(game)
    window.scrollTo(0, 0)
  }

  function recordAttempt(attempt: { wordId: string; outcome: 'correct' | 'missed' }) {
    const unique = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
    void progressRecorder.record({ id: `game-${attempt.wordId}-${unique}`, profileId: 'local-child', wordId: attempt.wordId, outcome: attempt.outcome, source: 'game', occurredAt: Date.now() }).catch(() => undefined)
  }

  if (selectedGame === 'bubble' && gameWords.length > 0) {
    return <BubbleMatchGame words={gameWords} rounds={2} onAttempt={recordAttempt} onReturnToLearning={onReturnToLearning} onBackToHub={returnToHub} />
  }
  if (selectedGame === 'train' && gameWords.length > 0) {
    return <SpellingTrainGame words={gameWords} rounds={2} onAttempt={recordAttempt} onReturnToLearning={onReturnToLearning} onBackToHub={returnToHub} />
  }
  if (selectedGame === 'memory' && gameWords.length > 0) {
    return <MemoryFlipGame words={gameWords} onAttempt={recordAttempt} onReturnToLearning={onReturnToLearning} onBackToHub={returnToHub} />
  }
  if (selectedGame === 'delivery' && gameWords.length > 0) {
    return <StarDeliveryGame words={gameWords} rounds={20} onAttempt={recordAttempt} onReturnToLearning={onReturnToLearning} onBackToHub={returnToHub} />
  }
  if (selectedGame === 'guardian' && gameWords.length > 0) {
    return <PlanetGuardianGame words={gameWords} onAttempt={recordAttempt} onReturnToLearning={onReturnToLearning} onBackToHub={returnToHub} />
  }

  return (
    <section className="game-hub" aria-labelledby="game-hub-title">
      <header className="game-hub__heading">
        <div>
          <p className="demo-disclaimer">{isLoadingSource ? '正在读取八册词表' : usingPublicWords ? `${selectedBook?.label} · 公开来源匹配 · 待教材页复核` : '等待真实教材词表'}</p>
          <h2 ref={titleRef} id="game-hub-title" data-route-heading tabIndex={-1}>游戏星岛</h2>
          <p>用轻松的小游戏，练习看图、拼写和词义配对。</p>
        </div>
        <GameController aria-hidden="true" weight="fill" />
      </header>

      {api && books.length > 0 && <div className="game-hub__filters">
        <label>教材<select value={bookId} onChange={(event) => { setBookId(event.target.value); setUnit(1) }}>{books.map((book) => <option key={book.id} value={book.id}>{book.label}</option>)}</select></label>
        <label>单元<select value={unit} onChange={(event) => setUnit(Number(event.target.value))}>{units.map((value) => <option key={value} value={value}>Unit {value}</option>)}</select></label>
        <span>{isLoadingSource ? '正在读取词表' : usingPublicWords ? `${publicGameWords.length} 个本局词` : '教材词表暂不可用'}</span>
      </div>}

      <article className="game-hub__demo-card">
        <div className="game-hub__demo-icon"><Sparkle aria-hidden="true" weight="fill" /></div>
        <div>
          <h3>泡泡找单词</h3>
          <p>看教材词条配图，点出正确的英文泡泡。每局 2 轮，没有倒计时。</p>
        </div>
        <button type="button" className="game-hub__start" onClick={() => startGame('bubble')} disabled={gameWords.length === 0}>
          开始泡泡找单词
        </button>
      </article>

      <article className="game-hub__demo-card">
        <div className="game-hub__demo-icon game-hub__demo-icon--delivery"><RocketLaunch aria-hidden="true" weight="duotone" /></div>
        <div><h3>星际速递</h3><p>按下开始后，在 30 秒内看图送出最多 20 单；可以随时暂停。</p></div>
        <button type="button" className="game-hub__start" onClick={() => startGame('delivery')} disabled={gameWords.length === 0}>开始星际速递</button>
      </article>

      <article className="game-hub__demo-card">
        <div className="game-hub__demo-icon game-hub__demo-icon--guardian"><ShieldCheck aria-hidden="true" weight="duotone" /></div>
        <div><h3>守护星球</h3><p>用看图、听音和拼写点亮三层友好护盾，真实错词会进入复习中心。</p></div>
        <button type="button" className="game-hub__start" onClick={() => startGame('guardian')} disabled={gameWords.length === 0}>开始守护星球</button>
      </article>

      <article className="game-hub__demo-card">
        <div className="game-hub__demo-icon game-hub__demo-icon--train"><Train aria-hidden="true" weight="duotone" /></div>
        <div><h3>拼写小火车</h3><p>看教材词条配图和中文，用键盘或大字母按钮完成 2 轮拼写。</p></div>
        <button type="button" className="game-hub__start" onClick={() => startGame('train')} disabled={gameWords.length === 0}>开始拼写小火车</button>
      </article>

      <article className="game-hub__demo-card">
        <div className="game-hub__demo-icon game-hub__demo-icon--memory"><CardsThree aria-hidden="true" weight="duotone" /></div>
        <div><h3>记忆翻翻乐</h3><p>翻出每个词的图片、英文和中文，三张配成一组。</p></div>
        <button type="button" className="game-hub__start" onClick={() => startGame('memory')} disabled={gameWords.length === 0}>开始记忆翻翻乐</button>
      </article>

      {!isLoadingSource && !usingPublicWords && <article className="game-hub__formal-empty">
        <LockKey aria-hidden="true" weight="duotone" />
        <div><h3>教材游戏暂不可用</h3><p>教材数据暂时没有返回可用词条，不会用示例内容代替真实教材。</p><button type="button" className="game-hub__start" onClick={() => setRefreshKey((value) => value + 1)}>重新读取</button></div>
      </article>}
    </section>
  )
}
