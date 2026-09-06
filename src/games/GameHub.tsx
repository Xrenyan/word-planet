import { CardsThree, LockKey, RocketLaunch, ShieldCheck, Sparkle, Star, Train } from '@phosphor-icons/react'
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
import { achievementKey, awardChallenge, clearPendingPassport, gameIds, hasPendingPassport, mergePassports, readPassport, readPendingPassport, readStoredPassport, rememberPendingPassport, writePassport, type ChallengeResult, type GameId } from './passport'

const games = [
  { id: 'bubble', title: '泡泡找单词', Icon: Sparkle, theme: '', description: '看图和中文，找到英文泡泡。2 → 4 → 6 轮，慢慢增加挑战。' },
  { id: 'delivery', title: '星际速递', Icon: RocketLaunch, theme: 'delivery', description: '30 秒内完成 5 → 8 → 12 单。随时可以暂停，下一局再挑战。' },
  { id: 'guardian', title: '守护星球', Icon: ShieldCheck, theme: 'guardian', description: '每关一组新任务：看图、听音、拼写，点亮三层护盾。' },
  { id: 'train', title: '拼写小火车', Icon: Train, theme: 'train', description: '点字母或用键盘，完成 2 → 3 → 4 次拼写，让小火车出发。' },
  { id: 'memory', title: '记忆翻翻乐', Icon: CardsThree, theme: 'memory', description: '图片、英文、中文三张一组。从 2 组开始，挑战 3 组和 4 组。' },
] as const

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
  const [passport, setPassport] = useState(() => mergePassports(readPassport(), readPendingPassport()))
  const [passportFailed, setPassportFailed] = useState(hasPendingPassport)
  const [level, setLevel] = useState(1)
  const [runNumber, setRunNumber] = useState(0)
  const [completion, setCompletion] = useState<ChallengeResult | null>(null)
  const completedRun = useRef(false)
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
    .filter((word) => word.bookId === bookId && word.unit === unit)
    .map((word) => toPublicMatchedGameWord(word, (selectedBook?.grade ?? 3) as 3 | 4 | 5 | 6, selectedBook?.semester ?? 'upper')), [bookId, selectedBook, sourceWords, unit])
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

  function completedLevels(game: GameId) {
    return passport.filter(item => item.game === game && item.bookId === bookId && item.unit === unit)
  }

  function startGame(game: Exclude<typeof selectedGame, 'hub'>, requestedLevel?: number) {
    if (gameWords.length === 0) return
    const collected = completedLevels(game)
    const nextLevel = requestedLevel ?? [1, 2, 3].find(value => !collected.some(item => item.level === value)) ?? 3
    if (nextLevel > 1 && !collected.some(item => item.level === nextLevel - 1)) return
    setLevel(nextLevel)
    setCompletion(null)
    completedRun.current = false
    setRunNumber(value => value + 1)
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

  function finishGame(result: ChallengeResult) {
    if (selectedGame === 'hub' || unit === null || completedRun.current) return
    completedRun.current = true
    setCompletion(result)
    const earned = awardChallenge([], { game: selectedGame, bookId, unit, level }, result)
    if (earned.length === 0) return
    rememberPendingPassport(earned)
    const next = mergePassports(mergePassports(readPassport(), passport), readPendingPassport())
    setPassport(next)
    try { writePassport(next); clearPendingPassport(); setPassportFailed(false) } catch { setPassportFailed(true) }
  }

  function retryPassport() {
    try {
      const next = mergePassports(mergePassports(readStoredPassport(), passport), readPendingPassport())
      writePassport(next)
      clearPendingPassport()
      setPassport(next)
      setPassportFailed(false)
    } catch { setPassportFailed(true) }
  }

  const saveNotice = saveFailed
    ? <p className="game-save-notice game-save-notice--error" role="alert">这次成绩没能保存。先别关闭页面，请家长到工具箱帮忙。</p>
    : null
  const passportNotice = passportFailed && <p className="game-save-notice game-save-notice--error" role="alert">通关星尚未保存，已在本页暂存；刷新或关闭网页可能丢失。可重试保存，或到工具箱导出备份。<button type="button" onClick={retryPassport}>重试保存通关星</button></p>
  const passed = !!completion && completion.totalRounds > 0 && completion.completedRounds === completion.totalRounds
  const replayProps = {
    onComplete: finishGame,
    onReplay: () => selectedGame !== 'hub' && startGame(selectedGame, level),
    onNextChallenge: passed && level < 3 ? () => selectedGame !== 'hub' && startGame(selectedGame, level + 1) : undefined,
  }
  const withSaveNotice = (game: ReactNode) => <>{saveNotice}{passportNotice}
    <div className="game-journey" aria-label="当前关卡"><span>{selectedBook?.label} · {unitLabel(sourceWords.find(word => word.unit === unit))} · 第 {level} 关</span><span aria-label={`第 ${level} 关，共 3 关`}>{[1,2,3].map(value => <Star key={value} aria-hidden="true" weight={value <= (passed ? level : level - 1) ? 'fill' : 'regular'} />)}</span></div>
    {passed && <div className="game-award" role="status"><Star aria-hidden="true" weight="fill" /><div><strong>获得 1 颗通关星</strong><p>{level === 3 ? '这座星岛的三关都完成啦！' : '下一关已解锁！'} 重玩同一关不会重复加星。</p></div></div>}
    {game}</>
  const gameKey = `${selectedGame}-${runNumber}`

  if (selectedGame === 'bubble' && gameWords.length > 0) {
    return withSaveNotice(<BubbleMatchGame key={gameKey} words={gameWords} seed={roundSeed} rounds={[2,4,6][level-1]} {...replayProps} onAttempt={recordAttempt} onReturnToLearning={onReturnToLearning} onBackToHub={returnToHub} />)
  }
  if (selectedGame === 'train' && gameWords.length > 0) {
    return withSaveNotice(<SpellingTrainGame key={gameKey} words={gameWords} seed={roundSeed} rounds={[2,3,4][level-1]} {...replayProps} onAttempt={recordAttempt} onReturnToLearning={onReturnToLearning} onBackToHub={returnToHub} />)
  }
  if (selectedGame === 'memory' && gameWords.length > 0) {
    return withSaveNotice(<MemoryFlipGame key={gameKey} words={gameWords} seed={roundSeed} groups={([2,3,4] as const)[level-1]} {...replayProps} onAttempt={recordAttempt} onReturnToLearning={onReturnToLearning} onBackToHub={returnToHub} />)
  }
  if (selectedGame === 'delivery' && gameWords.length > 0) {
    return withSaveNotice(<StarDeliveryGame key={gameKey} words={gameWords} seed={roundSeed} rounds={[5,8,12][level-1]} {...replayProps} onAttempt={recordAttempt} onReturnToLearning={onReturnToLearning} onBackToHub={returnToHub} />)
  }
  if (selectedGame === 'guardian' && gameWords.length > 0) {
    return withSaveNotice(<PlanetGuardianGame key={gameKey} words={gameWords} seed={roundSeed} {...replayProps} onAttempt={recordAttempt} onReturnToLearning={onReturnToLearning} onBackToHub={returnToHub} />)
  }

  return (
    <section className="game-hub" aria-labelledby="game-hub-title">
      <header className="game-hub__heading">
        <div>
          <p className="demo-disclaimer">{isLoadingSource ? '正在准备单词…' : usingPublicWords ? selectedBook?.label : '选个游戏，一起练单词'}</p>
          <h2 ref={titleRef} id="game-hub-title" data-route-heading tabIndex={-1}>游戏星岛</h2>
          <p>和词宝一起探索五座星岛。完成一关，收集一颗星。</p>
        </div>
        <img className="game-hub__mascot" src={`${import.meta.env.BASE_URL}mascot/cibao.png`} alt="词宝陪你闯关" width="96" height="96" />
      </header>

      {saveNotice}
      {passportNotice}
      <div className="game-passport"><div><Star aria-hidden="true" weight="fill" /><strong>我的星岛通关册</strong></div><span>本单元 {passport.filter(item => item.bookId === bookId && item.unit === unit).length} / {gameIds.length * 3} 颗星</span><p>先完成第 1 关，再解锁下一关。答错了可以重试，星星不会扣掉。</p></div>

      {api && books.length > 0 && <div className="game-hub__filters">
        <label>教材<select value={bookId} onChange={(event) => { setBookId(event.target.value); setUnit(null) }}>{books.map((book) => <option key={book.id} value={book.id}>{book.label}</option>)}</select></label>
        <label>单元<select value={unit ?? ''} onChange={(event) => setUnit(Number(event.target.value))}>{units.map((value) => <option key={value} value={value}>{unitLabel(sourceWords.find(word => word.unit === value))}</option>)}</select></label>
        <span>{isLoadingSource ? '正在准备单词…' : usingPublicWords ? `${publicGameWords.length} 个单词 · 随机出题` : '单词暂时没准备好'}</span>
      </div>}

      {games.map(({ id, title, Icon, theme, description }) => {
        const collected = completedLevels(id)
        return <article key={id} className="game-hub__demo-card">
          <div className={`game-hub__demo-icon game-hub__demo-icon--${theme}`}><Icon aria-hidden="true" weight="duotone" /></div>
          <div><h3>{title}</h3><p>{description}</p>
            <div className="game-levels" aria-label={`${title}：已完成 ${collected.length}/3 关`}>{[1,2,3].map(value => {
              const done = collected.some(item => achievementKey(item) === achievementKey({game:id,bookId,unit:unit??1,level:value}))
              const unlocked = value === 1 || collected.some(item => item.level === value-1)
              return <button type="button" key={value} aria-label={`${title} 第 ${value} 关${done ? ' 已完成' : ''}`} data-completed={done} disabled={!unlocked || !gameWords.length} onClick={() => startGame(id,value)}><Star aria-hidden="true" weight={done ? 'fill' : 'regular'} />第 {value} 关</button>
            })}</div>
          </div>
          <button type="button" className="game-hub__start" onClick={() => startGame(id)} disabled={gameWords.length === 0}>开始{title}</button>
        </article>
      })}
      <p className="game-passport__note">{passportFailed ? '通关册含尚未保存的本页暂存进展。' : '通关册保存在当前浏览器。'}小游戏中的首次答对只是本次表现，不代表已经长期记住。</p>

      {!isLoadingSource && !usingPublicWords && <article className="game-hub__formal-empty">
        <LockKey aria-hidden="true" weight="duotone" />
        <div><h3>单词还没准备好</h3><p>请稍后再试，或换一本书、一个单元。</p><button type="button" className="game-hub__start" onClick={() => setRefreshKey((value) => value + 1)}>再试一次</button></div>
      </article>}
    </section>
  )
}
