import { CardsThree, GameController, LockKey, RocketLaunch, ShieldCheck, Sparkle, Train } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import type { WordPlanetApi } from '../app/api/client'
import type { BookSummary, LearningEvent, VocabularyWordContract } from '../../shared/contracts'
import { toPublicMatchedGameWord } from '../data/publicMatchedGameWord'
import type { GameWord } from './engine'
import { BubbleMatchGame } from './BubbleMatchGame'
import { MemoryFlipGame } from './MemoryFlipGame'
import { PlanetGuardianGame } from './PlanetGuardianGame'
import { SpellingTrainGame } from './SpellingTrainGame'
import { StarDeliveryGame } from './StarDeliveryGame'
import { unitLabel } from '../curriculum/labels'
import { readBookmark } from '../learning/bookmark'

type GameHubProps = {
  onReturnToLearning: () => void
  api: WordPlanetApi
  progressRecorder: { record(event: LearningEvent): Promise<'saved' | 'memory-only' | 'synced' | 'queued'> }
}

export function GameHub({ onReturnToLearning, api, progressRecorder }: GameHubProps) {
  const [selectedGame, setSelectedGame] = useState<'hub' | 'bubble' | 'train' | 'memory' | 'delivery' | 'guardian'>('hub')
  const [books, setBooks] = useState<readonly BookSummary[]>([])
  const [bookId, setBookId] = useState('')
  const [unit, setUnit] = useState<number | null>(null)
  const [sourceWords, setSourceWords] = useState<readonly VocabularyWordContract[]>([])
  const [sourceStatus, setSourceStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(api ? 'loading' : 'idle')
  const [refreshKey, setRefreshKey] = useState(0)
  const [roundSeed, setRoundSeed] = useState(() => Date.now() % 2147483647)
  const [saveFailed, setSaveFailed] = useState(false)
  const titleRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (!api) return
    const controller = new AbortController()
    setSourceStatus('loading')
    void api.getBooks(controller.signal).then(({ books: values }) => {
      if (controller.signal.aborted) return
      const available = values.filter((book) => (book.availableWordCount ?? book.verifiedWordCount) > 0)
      setBooks(available)
      setBookId((current) => current || available.find(book => book.id === readBookmark()?.bookId)?.id || available[0]?.id || '')
      if (available.length === 0) setSourceStatus('error')
    }).catch((error) => {
      if (controller.signal.aborted) return
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
      if (controller.signal.aborted) return
      const bookmark = readBookmark()
      const bookmarkedUnit = bookmark?.bookId === bookId ? words.find(word => word.id === bookmark.wordId)?.unit : undefined
      setUnit(current => {
        if (current !== null && words.some(word => word.unit === current)) return current
        return (current === null ? bookmarkedUnit : undefined) ?? words[0]?.unit ?? null
      })
      setSourceWords(words)
      setSourceStatus('ready')
    }).catch((error) => {
      if (controller.signal.aborted) return
      if (!(error instanceof DOMException && error.name === 'AbortError')) setSourceStatus('error')
    })
    return () => controller.abort()
  }, [api, bookId, refreshKey])

  const units = useMemo(() => [...new Set(sourceWords.map((word) => word.unit))], [sourceWords])
  const selectedBook = books.find((book) => book.id === bookId)
  const publicGameWords = useMemo(() => sourceWords
    .filter((word) => word.unit === unit)
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
    setRoundSeed(Math.floor(Math.random() * 2147483647))
    window.scrollTo(0, 0)
  }

  function recordAttempt(attempt: { wordId: string; outcome: 'correct' | 'missed' }) {
    const unique = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
    void Promise.resolve().then(() => progressRecorder.record({ id: `game-${attempt.wordId}-${unique}`, profileId: 'local-child', wordId: attempt.wordId, outcome: attempt.outcome, source: 'game', occurredAt: Date.now() }))
      .then(status => {
        if (status !== 'saved' && status !== 'synced') setSaveFailed(true)
      }).catch(() => setSaveFailed(true))
  }

  const saveNotice = saveFailed
    ? <p className="game-save-notice game-save-notice--error" role="alert">这次成绩没能保存。先别关闭页面，请家长到工具箱帮忙。</p>
    : null
  const withSaveNotice = (game: ReactNode) => <>{saveNotice}{game}</>

  if (selectedGame === 'bubble' && gameWords.length > 0) {
    return withSaveNotice(<BubbleMatchGame words={gameWords} seed={roundSeed} rounds={2} onAttempt={recordAttempt} onReturnToLearning={onReturnToLearning} onBackToHub={returnToHub} />)
  }
  if (selectedGame === 'train' && gameWords.length > 0) {
    return withSaveNotice(<SpellingTrainGame words={gameWords} seed={roundSeed} rounds={2} onAttempt={recordAttempt} onReturnToLearning={onReturnToLearning} onBackToHub={returnToHub} />)
  }
  if (selectedGame === 'memory' && gameWords.length > 0) {
    return withSaveNotice(<MemoryFlipGame words={gameWords} seed={roundSeed} onAttempt={recordAttempt} onReturnToLearning={onReturnToLearning} onBackToHub={returnToHub} />)
  }
  if (selectedGame === 'delivery' && gameWords.length > 0) {
    return withSaveNotice(<StarDeliveryGame words={gameWords} seed={roundSeed} rounds={20} onAttempt={recordAttempt} onReturnToLearning={onReturnToLearning} onBackToHub={returnToHub} />)
  }
  if (selectedGame === 'guardian' && gameWords.length > 0) {
    return withSaveNotice(<PlanetGuardianGame words={gameWords} seed={roundSeed} onAttempt={recordAttempt} onReturnToLearning={onReturnToLearning} onBackToHub={returnToHub} />)
  }

  return (
    <section className="game-hub" aria-labelledby="game-hub-title">
      <header className="game-hub__heading">
        <div>
          <p className="demo-disclaimer">{isLoadingSource ? '正在准备单词…' : usingPublicWords ? selectedBook?.label : '选个游戏，一起练单词'}</p>
          <h2 ref={titleRef} id="game-hub-title" data-route-heading tabIndex={-1}>游戏星岛</h2>
          <p>用轻松的小游戏，练习看图、拼写和词义配对。</p>
        </div>
        <GameController aria-hidden="true" weight="fill" />
      </header>

      {saveNotice}

      {api && books.length > 0 && <div className="game-hub__filters">
        <label>教材<select value={bookId} onChange={(event) => { setBookId(event.target.value); setUnit(null) }}>{books.map((book) => <option key={book.id} value={book.id}>{book.label}</option>)}</select></label>
        <label>单元<select value={unit ?? ''} onChange={(event) => setUnit(Number(event.target.value))}>{units.map((value) => <option key={value} value={value}>{unitLabel(sourceWords.find(word => word.unit === value))}</option>)}</select></label>
        <span>{isLoadingSource ? '正在准备单词…' : usingPublicWords ? `${publicGameWords.length} 个单词 · 随机出题` : '单词暂时没准备好'}</span>
      </div>}

      <article className="game-hub__demo-card">
        <div className="game-hub__demo-icon"><Sparkle aria-hidden="true" weight="fill" /></div>
        <div>
          <h3>泡泡找单词</h3>
          <p>看图和中文，点出正确的英文泡泡。每局 2 轮，没有倒计时。</p>
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
        <div><h3>守护星球</h3><p>看图、听音、拼写，一起点亮三层星球护盾。</p></div>
        <button type="button" className="game-hub__start" onClick={() => startGame('guardian')} disabled={gameWords.length === 0}>开始守护星球</button>
      </article>

      <article className="game-hub__demo-card">
        <div className="game-hub__demo-icon game-hub__demo-icon--train"><Train aria-hidden="true" weight="duotone" /></div>
        <div><h3>拼写小火车</h3><p>看图和中文，点字母或用键盘，完成 2 轮拼写。</p></div>
        <button type="button" className="game-hub__start" onClick={() => startGame('train')} disabled={gameWords.length === 0}>开始拼写小火车</button>
      </article>

      <article className="game-hub__demo-card">
        <div className="game-hub__demo-icon game-hub__demo-icon--memory"><CardsThree aria-hidden="true" weight="duotone" /></div>
        <div><h3>记忆翻翻乐</h3><p>翻出同一个词的图片、英文和中文，找齐每一组。</p></div>
        <button type="button" className="game-hub__start" onClick={() => startGame('memory')} disabled={gameWords.length === 0}>开始记忆翻翻乐</button>
      </article>

      {!isLoadingSource && !usingPublicWords && <article className="game-hub__formal-empty">
        <LockKey aria-hidden="true" weight="duotone" />
        <div><h3>单词还没准备好</h3><p>请稍后再试，或换一本书、一个单元。</p><button type="button" className="game-hub__start" onClick={() => setRefreshKey((value) => value + 1)}>再试一次</button></div>
      </article>}
    </section>
  )
}
