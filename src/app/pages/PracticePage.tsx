import { unitLabel } from '../../curriculum/labels'
import { WordDetails } from '../../features/help/ParentGuide'
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, Headphones, Keyboard, Microphone, SquaresFour } from '@phosphor-icons/react'
import type { LearningEvent, VocabularyWordContract } from '../../../shared/contracts'
import { PronunciationControls } from '../../features/pronunciation/PronunciationControls'
import { artworkSource, WordArtwork } from '../../learning/WordArtwork'
import { Pressable } from '../../ui/Pressable'
import type { WordPlanetApi } from '../api/client'
import { readBookmark, saveBookmark } from '../../learning/bookmark'
import { loadWordAudio } from '../../features/pronunciation/audioClient'

const modes = [
  { id: 'learn', label: '认识单词', icon: BookOpen },
  { id: 'listen', label: '听音选词', icon: Headphones },
  { id: 'spell', label: '看义拼写', icon: Keyboard },
  { id: 'speak', label: '跟读练习', icon: Microphone },
  { id: 'mixed', label: '综合闯关', icon: SquaresFour },
] as const

type ProgressRecorder = { record(event: LearningEvent): Promise<'saved' | 'memory-only' | 'synced' | 'queued'> }

function eventId(wordId: string) {
  const unique = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `practice-${wordId}-${unique}`
}

type PracticePageProps = {
  word?: VocabularyWordContract
  reviewWords?: readonly VocabularyWordContract[]
  progressRecorder?: ProgressRecorder
  api?: WordPlanetApi
  onBack?: (result?: PracticeExit) => void
  onSaveStateChange?: (result: PracticeExit) => void
}

export type PracticeExit = { unconfirmedWordIds: readonly string[]; confirmedWordIds: readonly string[] }

export function PracticePage({ word, reviewWords, progressRecorder, api, onBack, onSaveStateChange }: PracticePageProps = {}) {
  const isReview = reviewWords !== undefined
  const backLabel = isReview ? '返回错词本' : '返回词表'
  const [selected, setSelected] = useState<(typeof modes)[number]['id']>(isReview ? 'spell' : 'learn')
  const [answer, setAnswer] = useState('')
  const [feedback, setFeedback] = useState('')
  const [saveWarning, setSaveWarning] = useState('')
  const [retry, setRetry] = useState(0)
  const mounted = useRef(false)
  const [sessionWords, setSessionWords] = useState<readonly VocabularyWordContract[]>(() => reviewWords ?? (word ? [word] : []))
  const [currentIndex, setCurrentIndex] = useState(0)
  const [bookWords, setBookWords] = useState<readonly VocabularyWordContract[]>([])
  const [nextGroupIndex, setNextGroupIndex] = useState(0)
  const [finished, setFinished] = useState(false)
  const [groupAttempts, setGroupAttempts] = useState<Record<string, 'correct' | 'missed'>>({})
  const [missedIds, setMissedIds] = useState<string[]>([])
  const [loadStatus, setLoadStatus] = useState<'idle' | 'loading' | 'error' | 'empty'>(api && !word && !isReview ? 'loading' : 'idle')
  const pendingSaveCounts = useRef(new Map<string, number>())
  const failedSaveWordIds = useRef(new Set<string>())
  const confirmedSaveWordIds = useRef(new Set<string>())
  const inputRef = useRef<HTMLInputElement>(null)
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const solvedRef = useRef(false)
  const [solved, setSolved] = useState(false)
  const activeMode = modes.find((mode) => mode.id === selected)!
  const activeWord = sessionWords[currentIndex]
  const resolvedMode = selected === 'mixed' ? (currentIndex % 2 === 0 ? 'listen' : 'spell') : selected
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  useEffect(() => {
    if (!activeWord) return
    saveBookmark({ bookId: activeWord.bookId, wordId: activeWord.id })
    const next = sessionWords[currentIndex + 1]
    if (next) void Promise.all(['en-GB', 'en-US'].map(locale => loadWordAudio(next.id, locale as 'en-GB' | 'en-US', next.term)))
  }, [activeWord, currentIndex, sessionWords])

  function clearAdvanceTimer() {
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current)
    advanceTimerRef.current = null
  }

  function moveTo(index: number) {
    clearAdvanceTimer()
    const nextIndex = Math.min(sessionWords.length - 1, Math.max(0, index))
    setCurrentIndex(nextIndex)
    setAnswer('')
    setFeedback('')
    solvedRef.current = false
    setSolved(false)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  useEffect(() => () => clearAdvanceTimer(), [])

  function startGroup(words: readonly VocabularyWordContract[], start: number) {
    const group = words.slice(start).filter((candidate) => candidate.unit === words[start]?.unit).slice(0, 8)
    setSessionWords(group)
    setNextGroupIndex(start + group.length)
    setGroupAttempts({})
    setMissedIds([])
    setFinished(false)
    moveTo(0)
    setCurrentIndex(0)
  }

  function completeGroup() {
    clearAdvanceTimer()
    setFinished(true)
    requestAnimationFrame(() => document.getElementById('practice-complete-title')?.focus())
  }

  function advanceOrFinish() {
    if (currentIndex < sessionWords.length - 1) moveTo(currentIndex + 1)
    else completeGroup()
  }

  function trackAttempt(outcome: 'correct' | 'missed') {
    if (!activeWord) return
    setGroupAttempts(previous => previous[activeWord.id] ? previous : {...previous, [activeWord.id]: outcome})
    if (outcome === 'missed') setMissedIds(previous => previous.includes(activeWord.id) ? previous : [...previous, activeWord.id])
  }

  function retryMissed() {
    const retry = sessionWords.filter(candidate => missedIds.includes(candidate.id))
    setSessionWords(retry)
    setGroupAttempts({})
    setMissedIds([])
    setFinished(false)
    moveTo(0)
  }

  function chooseMode(mode: (typeof modes)[number]['id']) {
    clearAdvanceTimer()
    setSelected(mode)
    setAnswer('')
    setFeedback('')
    solvedRef.current = false
    setSolved(false)
    if (mode === 'spell') requestAnimationFrame(() => inputRef.current?.focus())
  }

  function saveState(): PracticeExit {
    const unconfirmedIds = new Set([...failedSaveWordIds.current, ...pendingSaveCounts.current.keys()])
    return { unconfirmedWordIds: [...unconfirmedIds], confirmedWordIds: [...confirmedSaveWordIds.current].filter(id => !unconfirmedIds.has(id)) }
  }

  function returnToPrevious() {
    onBack?.(saveState())
  }

  useEffect(() => {
    if (reviewWords !== undefined) {
      setSessionWords(reviewWords)
      setBookWords([])
      setNextGroupIndex(0)
      setGroupAttempts({})
      setMissedIds([])
      setFinished(false)
      setSelected('spell')
      moveTo(0)
      setCurrentIndex(0)
      setLoadStatus('idle')
      return
    }
    if (!api) {
      setSessionWords(word ? [word] : [])
      setCurrentIndex(0)
      setLoadStatus('idle')
      return
    }
    const controller = new AbortController()
    if (!word) setLoadStatus('loading')
    void (async () => {
      try {
        const bookmark = word ? null : readBookmark()
        let bookId = word?.bookId
        if (!bookId) {
          const { books } = await api.getBooks(controller.signal)
          const available = books.filter((candidate) => (candidate.availableWordCount ?? candidate.verifiedWordCount) > 0)
          bookId = available.find(candidate => candidate.id === bookmark?.bookId)?.id ?? available[0]?.id
        }
        if (!bookId) {
          setLoadStatus('empty')
          return
        }
        const { words } = await api.getWords(bookId, undefined, controller.signal)
        if (words.length === 0) {
          setLoadStatus(word ? 'idle' : 'empty')
          return
        }
        if (controller.signal.aborted) return
        const startIndex = Math.max(0, words.findIndex((candidate) => candidate.id === (word?.id ?? bookmark?.wordId)))
        setBookWords(words)
        startGroup(words, startIndex)
        setLoadStatus('idle')
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setLoadStatus(word ? 'idle' : 'error')
      }
    })()
    return () => {
      controller.abort()
      clearAdvanceTimer()
    }
  }, [api, word, reviewWords, retry])

  function saveAttempt(outcome: 'correct' | 'missed', source: 'spelling' | 'recognition') {
    if (!progressRecorder || !activeWord) return
    const wordId = activeWord.id
    pendingSaveCounts.current.set(wordId, (pendingSaveCounts.current.get(wordId) ?? 0) + 1)
    onSaveStateChange?.(saveState())
    const warn = () => { failedSaveWordIds.current.add(wordId); if (mounted.current) setSaveWarning('这次练习没能保存。先别关闭页面，请家长到工具箱帮忙。') }
    void Promise.resolve().then(() => progressRecorder.record({ id: eventId(wordId), profileId: 'local-child', wordId, outcome, source, occurredAt: Date.now() }))
      .then(status => {
        if (status === 'memory-only' || status === 'queued') warn()
        else confirmedSaveWordIds.current.add(wordId)
      }).catch(warn).finally(() => {
        const remaining = (pendingSaveCounts.current.get(wordId) ?? 1) - 1
        if (remaining > 0) pendingSaveCounts.current.set(wordId, remaining)
        else pendingSaveCounts.current.delete(wordId)
        if (mounted.current) onSaveStateChange?.(saveState())
      })
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!activeWord || !answer.trim() || solvedRef.current) return
    const outcome = answer.trim().toLocaleLowerCase('en') === activeWord.term.toLocaleLowerCase('en') ? 'correct' : 'missed'
    trackAttempt(outcome)
    if (outcome === 'correct') { solvedRef.current = true; setSolved(true) }
    const hasNext = currentIndex < sessionWords.length - 1
    setFeedback(outcome === 'correct'
      ? hasNext ? '答对了，马上进入下一个单词' : '答对了，本组练习完成'
      : '再听一遍试试，答案会保留在当前单词')
    if (outcome === 'correct') {
      clearAdvanceTimer()
      advanceTimerRef.current = setTimeout(advanceOrFinish, 520)
    }
    saveAttempt(outcome, 'spelling')
  }

  function chooseMeaning(chosenWordId: string) {
    if (!activeWord || solvedRef.current) return
    const outcome = chosenWordId === activeWord.id ? 'correct' : 'missed'
    trackAttempt(outcome)
    if (outcome === 'correct') { solvedRef.current = true; setSolved(true) }
    const hasNext = currentIndex < sessionWords.length - 1
    setFeedback(outcome === 'correct'
      ? hasNext ? '选对了，马上进入下一个单词' : '选对了，本组练习完成'
      : '再听一遍，继续选择当前单词')
    if (outcome === 'correct') {
      clearAdvanceTimer()
      advanceTimerRef.current = setTimeout(advanceOrFinish, 520)
    }
    saveAttempt(outcome, 'recognition')
  }

  const recognitionCandidates = activeWord
    ? [activeWord, ...(bookWords.length ? bookWords : sessionWords).filter((candidate) => candidate.id !== activeWord.id)]
      .filter((candidate, index, choices) => choices.findIndex((item) => item.meaningZh === candidate.meaningZh) === index)
      .slice(0, 4)
    : []
  const offset = activeWord ? [...activeWord.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % Math.max(1, recognitionCandidates.length) : 0
  const recognitionChoices = [...recognitionCandidates.slice(offset), ...recognitionCandidates.slice(0, offset)]
  const upcomingArtwork = [...new Set(sessionWords.slice(currentIndex + 1, currentIndex + 3).map(next => artworkSource(next.image.src)).filter((src): src is string => Boolean(src)))]

  if (finished) return <section className="practice-completion" aria-labelledby="practice-complete-title">
    <BookOpen weight="duotone" aria-hidden="true" />
    <p className="status-pill">小步前进，每次一组</p>
    <h2 id="practice-complete-title" tabIndex={-1}>{isReview ? '这组复习完成啦！' : '这一组完成啦！'}</h2>
    <p>本组 {sessionWords.length} 个单词{Object.keys(groupAttempts).length === 0 && ' · 已浏览，接着试试不看答案练一练吧'}</p>
    {saveWarning && <p className="practice-save-warning" role="alert">{saveWarning}</p>}
    {Object.keys(groupAttempts).length > 0 && <p>首次答对 {Object.values(groupAttempts).filter(result => result === 'correct').length} / {Object.keys(groupAttempts).length}</p>}
    <ul className="practice-completion__words">{sessionWords.map(candidate => <li key={candidate.id}><strong lang="en">{candidate.term}</strong><span>{candidate.meaningZh}</span><small>{missedIds.includes(candidate.id) ? '再巩固' : groupAttempts[candidate.id] ? '首次答对' : '已浏览'}</small></li>)}</ul>
    <div className="practice-completion__actions">
      {missedIds.length > 0 && <Pressable className="dashboard-primary-button" onClick={retryMissed}>再练错词（{missedIds.length}）</Pressable>}
      {!isReview && nextGroupIndex < bookWords.length && <Pressable className={missedIds.length ? '' : 'dashboard-primary-button'} onClick={() => startGroup(bookWords, nextGroupIndex)}>继续下一组<ArrowRight aria-hidden="true" /></Pressable>}
      <Pressable onClick={() => { setGroupAttempts({}); setMissedIds([]); setFinished(false); moveTo(0) }}>再学这一组</Pressable>
      {onBack && <Pressable onClick={returnToPrevious}>{backLabel}</Pressable>}
    </div>
  </section>

  if (activeWord) return (
    <section className="route-empty-state verified-practice" aria-labelledby="practice-title" data-practice-mode={resolvedMode}>
      <div className="verified-practice__topbar">
        {upcomingArtwork.map(src => <link key={src} rel="preload" as="image" href={src} fetchPriority="low" />)}
        {onBack && <Pressable className="verified-practice__back" onClick={returnToPrevious}><ArrowLeft aria-hidden="true" />{backLabel}</Pressable>}
        <p className="status-pill">{unitLabel(activeWord)}</p>
        <p className="verified-practice__progress" aria-live="polite">第 {currentIndex + 1} / {sessionWords.length} 词</p>
        <progress className="verified-practice__meter" value={currentIndex + 1} max={sessionWords.length} aria-label="本组学习进度" />
      </div>
      <h2 id="practice-title" data-route-heading tabIndex={-1}>{resolvedMode === 'listen' ? '听音挑战' : modes.find(mode => mode.id === resolvedMode)?.label}</h2>
      <div className="practice-landing__modes verified-practice__modes" role="list" aria-label="练习方式">
        {modes.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" className="practice-landing__mode" aria-pressed={selected === id} onClick={() => chooseMode(id)}>
            <Icon aria-hidden="true" weight={selected === id ? 'fill' : 'bold'} />
            {label}
          </button>
        ))}
      </div>
      <div className="verified-practice__content">
        {resolvedMode !== 'spell' && <figure>
          {resolvedMode === 'listen' ? <div className="listening-orbit" aria-label="请听声音作答"><Headphones weight="duotone" /><strong>小耳朵，准备好了吗？</strong><p>点发音，听完再选择</p></div> : <WordArtwork priority image={activeWord.image} term={activeWord.term} meaningZh={activeWord.meaningZh} wordId={activeWord.id} />}
        </figure>}
        <div className="verified-practice__task">
          {resolvedMode === 'spell' && <section className="spelling-prompt" aria-label="中文提示"><span>这个单词怎么写？</span><strong>{activeWord.meaningZh}</strong></section>}
          {(resolvedMode === 'learn' || resolvedMode === 'speak') && <section className="verified-practice__word-card" aria-label={`正在学习单词 ${activeWord.term}`}>
            <strong lang="en">{activeWord.term}</strong>
            <p>{activeWord.meaningZh}</p>
          </section>}
          <PronunciationControls key={`${activeWord.id}-${resolvedMode}`} word={activeWord} showIpa={resolvedMode === 'learn' || resolvedMode === 'speak'} showRecorder={resolvedMode === 'speak'} />
          {resolvedMode === 'learn' && <p className="verified-practice__hint">看图、听音，再大声读三遍</p>}
          {resolvedMode === 'spell' && <form onSubmit={submit}>
              <label htmlFor="verified-spelling">根据中文写英文</label>
              <div>
                <input ref={inputRef} id="verified-spelling" value={answer} disabled={solved} onChange={(event) => setAnswer(event.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="在这里写英文" />
                <Pressable type="submit" disabled={solved || !answer.trim()} className="dashboard-primary-button">检查拼写</Pressable>
              </div>
            </form>}
          {resolvedMode === 'listen' && <section className="verified-practice__recognition" aria-labelledby="recognition-title">
            <h3 id="recognition-title">听发音，选择正确的中文意思</h3>
            <div>
              {recognitionChoices.map((choice) => <Pressable key={choice.id} disabled={solved} aria-label={`选择中文：${choice.meaningZh}`} onClick={() => chooseMeaning(choice.id)}>{choice.meaningZh}</Pressable>)}
            </div>
          </section>}
          {resolvedMode === 'speak' && <section className="verified-practice__speaking" aria-label="跟读练习说明">
            <p>听听自己的录音，和示范比一比。准备好就继续吧。</p>
            <Pressable className="dashboard-primary-button" onClick={advanceOrFinish}>{currentIndex < sessionWords.length - 1 ? '跟读完成，下一词' : '完成这一组'}</Pressable>
          </section>}
          {feedback && <p className="verified-practice__feedback" role="status">{feedback}</p>}
          {saveWarning && <p className="practice-save-warning" role="alert">{saveWarning}</p>}
        </div>
      </div>
      <nav className="verified-practice__navigation" aria-label="连续学习导航">
        <Pressable aria-label="上一个单词" disabled={currentIndex === 0} onClick={() => moveTo(currentIndex - 1)}><ArrowLeft aria-hidden="true" />上一个</Pressable>
        {currentIndex < sessionWords.length - 1
          ? <Pressable className="dashboard-primary-button" aria-label="下一个单词" onClick={() => moveTo(currentIndex + 1)}>下一个<ArrowRight aria-hidden="true" /></Pressable>
          : <Pressable className="dashboard-primary-button" aria-label="完成这一组" onClick={completeGroup}>完成这一组<ArrowRight aria-hidden="true" /></Pressable>}
      </nav>
      <WordDetails word={activeWord} />
    </section>
  )

  if (loadStatus === 'loading') return <section className="route-empty-state practice-landing" aria-labelledby="practice-title"><h2 id="practice-title" data-route-heading tabIndex={-1}>练习</h2><p role="status">正在准备第一组练习题……</p></section>
  if (loadStatus === 'error' || loadStatus === 'empty') return <section className="route-empty-state practice-landing" aria-labelledby="practice-title"><h2 id="practice-title" data-route-heading tabIndex={-1}>练习</h2><p role="alert">{loadStatus === 'error' ? '单词还没加载好，点一下再试试。' : '这本课本还没有单词，先选另一本吧。'}</p>{loadStatus === 'error' && <Pressable onClick={() => setRetry(value => value + 1)}>再试一次</Pressable>}{onBack && <Pressable onClick={returnToPrevious}>{backLabel}</Pressable>}</section>

  return (
    <section className="route-empty-state practice-landing" aria-labelledby="practice-title">
      <h2 id="practice-title" data-route-heading tabIndex={-1}>练习</h2>
      <p>选一种喜欢的方式，把单词记得更牢。</p>
      <div className="practice-landing__modes" role="list" aria-label="练习方式">
        {modes.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className="practice-landing__mode"
            aria-pressed={selected === id}
            onClick={() => chooseMode(id)}
          >
            <Icon aria-hidden="true" weight={selected === id ? 'fill' : 'bold'} />
            {label}
          </button>
        ))}
      </div>
      <p className="practice-landing__selection" role="status">已选择：{activeMode.label}</p>
    </section>
  )
}
