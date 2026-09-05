import { sourceLabel } from '../../curriculum/sourceLabel'
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, Headphones, Keyboard, Microphone, SquaresFour } from '@phosphor-icons/react'
import type { LearningEvent, VocabularyWordContract } from '../../../shared/contracts'
import { PronunciationControls } from '../../features/pronunciation/PronunciationControls'
import { WordArtwork } from '../../learning/WordArtwork'
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
  progressRecorder?: ProgressRecorder
  api?: WordPlanetApi
  onBack?: () => void
}

export function PracticePage({ word, progressRecorder, api, onBack }: PracticePageProps = {}) {
  const [selected, setSelected] = useState<(typeof modes)[number]['id']>('learn')
  const [answer, setAnswer] = useState('')
  const [feedback, setFeedback] = useState('')
  const [sessionWords, setSessionWords] = useState<readonly VocabularyWordContract[]>(() => word ? [word] : [])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [bookWords, setBookWords] = useState<readonly VocabularyWordContract[]>([])
  const [nextGroupIndex, setNextGroupIndex] = useState(0)
  const [finished, setFinished] = useState(false)
  const [groupAttempts, setGroupAttempts] = useState<Record<string, 'correct' | 'missed'>>({})
  const [missedIds, setMissedIds] = useState<string[]>([])
  const [loadStatus, setLoadStatus] = useState<'idle' | 'loading' | 'error' | 'empty'>(api && !word ? 'loading' : 'idle')
  const inputRef = useRef<HTMLInputElement>(null)
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const solvedRef = useRef(false)
  const [solved, setSolved] = useState(false)
  const activeMode = modes.find((mode) => mode.id === selected)!
  const activeWord = sessionWords[currentIndex]
  const resolvedMode = selected === 'mixed' ? (currentIndex % 2 === 0 ? 'listen' : 'spell') : selected
  const activeWordIdRef = useRef(activeWord?.id)
  activeWordIdRef.current = activeWord?.id

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

  useEffect(() => {
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
  }, [api, word])

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!activeWord || !answer.trim() || solvedRef.current) return
    const outcome = answer.trim().toLocaleLowerCase('en') === activeWord.term.toLocaleLowerCase('en') ? 'correct' : 'missed'
    trackAttempt(outcome)
    if (outcome === 'correct') { solvedRef.current = true; setSolved(true) }
    const answeredWordId = activeWord.id
    const hasNext = currentIndex < sessionWords.length - 1
    setFeedback(outcome === 'correct'
      ? hasNext ? '答对了，马上进入下一个单词' : '答对了，本组练习完成'
      : '再听一遍试试，答案会保留在当前单词')
    if (outcome === 'correct') {
      clearAdvanceTimer()
      advanceTimerRef.current = setTimeout(advanceOrFinish, 520)
    }
    if (!progressRecorder) return
    void progressRecorder.record({
      id: eventId(activeWord.id), profileId: 'local-child', wordId: activeWord.id, outcome, source: 'spelling', occurredAt: Date.now(),
    }).then((status) => {
      if (activeWordIdRef.current !== answeredWordId) return
      setFeedback(outcome === 'correct'
        ? status === 'memory-only' ? '答对了；本次记录未保存，马上进入下一词' : hasNext ? '答对了，已保存在此设备，马上进入下一词' : '答对了，已保存在此设备，本组练习完成'
        : status === 'memory-only' ? '再练一次；本次错词记录未保存' : '再练一次，错词已保存在此设备')
    }).catch(() => {
      if (activeWordIdRef.current === answeredWordId) setFeedback(outcome === 'correct' ? '答对了；本次记录未保存，请检查浏览器存储权限' : '再练一次；本次记录未保存，请检查浏览器存储权限')
    })
  }

  function chooseMeaning(chosenWordId: string) {
    if (!activeWord || solvedRef.current) return
    const outcome = chosenWordId === activeWord.id ? 'correct' : 'missed'
    trackAttempt(outcome)
    if (outcome === 'correct') { solvedRef.current = true; setSolved(true) }
    const answeredWordId = activeWord.id
    const hasNext = currentIndex < sessionWords.length - 1
    setFeedback(outcome === 'correct'
      ? hasNext ? '选对了，马上进入下一个单词' : '选对了，本组练习完成'
      : '再听一遍，继续选择当前单词')
    if (outcome === 'correct') {
      clearAdvanceTimer()
      advanceTimerRef.current = setTimeout(advanceOrFinish, 520)
    }
    if (!progressRecorder) return
    void progressRecorder.record({
      id: eventId(activeWord.id), profileId: 'local-child', wordId: activeWord.id, outcome, source: 'recognition', occurredAt: Date.now(),
    }).then((status) => {
      if (activeWordIdRef.current !== answeredWordId) return
      setFeedback(outcome === 'correct'
        ? status === 'memory-only' ? '选对了；本次记录未保存，马上进入下一词' : hasNext ? '选对了，已保存在此设备，马上进入下一词' : '选对了，已保存在此设备，本组练习完成'
        : status === 'memory-only' ? '再练一次；本次错词记录未保存' : '再练一次，错词已保存在此设备')
    }).catch(() => {
      if (activeWordIdRef.current === answeredWordId) setFeedback(outcome === 'correct' ? '选对了；本次记录未保存，请检查浏览器存储权限' : '再练一次；本次记录未保存，请检查浏览器存储权限')
    })
  }

  const recognitionCandidates = activeWord
    ? [activeWord, ...(bookWords.length ? bookWords : sessionWords).filter((candidate) => candidate.id !== activeWord.id)]
      .filter((candidate, index, choices) => choices.findIndex((item) => item.meaningZh === candidate.meaningZh) === index)
      .slice(0, 4)
    : []
  const offset = activeWord ? [...activeWord.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % Math.max(1, recognitionCandidates.length) : 0
  const recognitionChoices = [...recognitionCandidates.slice(offset), ...recognitionCandidates.slice(0, offset)]

  if (finished) return <section className="practice-completion" aria-labelledby="practice-complete-title">
    <BookOpen weight="duotone" aria-hidden="true" />
    <p className="status-pill">小步前进，每次一组</p>
    <h2 id="practice-complete-title" tabIndex={-1}>这一组完成啦！</h2>
    <p>本组 {sessionWords.length} 个单词{Object.keys(groupAttempts).length === 0 && ' · 已完成浏览，不计为答题掌握'}</p>
    {Object.keys(groupAttempts).length > 0 && <p>首次答对 {Object.values(groupAttempts).filter(result => result === 'correct').length} / {Object.keys(groupAttempts).length}</p>}
    <ul className="practice-completion__words">{sessionWords.map(candidate => <li key={candidate.id}><strong lang="en">{candidate.term}</strong><span>{candidate.meaningZh}</span><small>{missedIds.includes(candidate.id) ? '再巩固' : groupAttempts[candidate.id] ? '首次答对' : '已浏览'}</small></li>)}</ul>
    <div className="practice-completion__actions">
      {missedIds.length > 0 && <Pressable className="dashboard-primary-button" onClick={retryMissed}>再练错词（{missedIds.length}）</Pressable>}
      {nextGroupIndex < bookWords.length && <Pressable className={missedIds.length ? '' : 'dashboard-primary-button'} onClick={() => startGroup(bookWords, nextGroupIndex)}>继续下一组<ArrowRight aria-hidden="true" /></Pressable>}
      <Pressable onClick={() => { setGroupAttempts({}); setMissedIds([]); setFinished(false); moveTo(0) }}>再学这一组</Pressable>
      {onBack && <Pressable onClick={onBack}>返回今天</Pressable>}
    </div>
  </section>

  if (activeWord) return (
    <section className="route-empty-state verified-practice" aria-labelledby="practice-title" data-practice-mode={resolvedMode}>
      <div className="verified-practice__topbar">
        {onBack && <Pressable className="verified-practice__back" onClick={onBack}><ArrowLeft aria-hidden="true" />返回今天</Pressable>}
        <p className="status-pill">{sourceLabel(activeWord)}</p>
        <p className="verified-practice__progress" aria-live="polite">第 {currentIndex + 1} / {sessionWords.length} 词</p>
      </div>
      <h2 id="practice-title" data-route-heading tabIndex={-1}>{resolvedMode === 'listen' ? '听音挑战' : `${selected === 'learn' ? '学习' : '练习'} · ${activeWord.meaningZh}`}</h2>
      <div className="practice-landing__modes verified-practice__modes" role="list" aria-label="练习方式">
        {modes.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" className="practice-landing__mode" aria-pressed={selected === id} onClick={() => chooseMode(id)}>
            <Icon aria-hidden="true" weight={selected === id ? 'fill' : 'bold'} />
            {label}
          </button>
        ))}
      </div>
      <div className="verified-practice__content">
        <figure>
          {resolvedMode === 'listen' ? <div className="listening-orbit" aria-label="请听声音作答"><Headphones weight="duotone" /><strong>小耳朵，准备好了吗？</strong><p>点发音，听完再选择</p></div> : <WordArtwork image={activeWord.image} term={activeWord.term} meaningZh={activeWord.meaningZh} wordId={activeWord.id} revealTerm={resolvedMode !== 'spell'} />}
          <figcaption>{activeWord.image.src.startsWith('word-art/') ? <a href={`${import.meta.env.BASE_URL}licenses/WORD-ARTWORK.txt`} target="_blank" rel="noreferrer">OpenMoji 词义配图 · CC BY-SA 4.0</a> : activeWord.image.src.startsWith('https:') ? '公开来源配图 · 权利归原来源' : '词义联想提示 · 结合例子理解'}</figcaption>
        </figure>
        <div>
          {(resolvedMode === 'learn' || resolvedMode === 'speak') && <section className="verified-practice__word-card" aria-label={`正在学习单词 ${activeWord.term}`}>
            <span>NEW WORD</span>
            <strong lang="en">{activeWord.term}</strong>
            <p>{activeWord.meaningZh}</p>
            <small>看图、听音，再大声读三遍</small>
          </section>}
          <PronunciationControls key={`${activeWord.id}-${resolvedMode}`} word={activeWord} showIpa={resolvedMode === 'learn' || resolvedMode === 'speak'} showRecorder={resolvedMode === 'learn' || resolvedMode === 'speak'} />
          {resolvedMode === 'spell' && <form onSubmit={submit}>
              <label htmlFor="verified-spelling">根据中文写英文</label>
              <div>
                <input ref={inputRef} id="verified-spelling" value={answer} disabled={solved} onChange={(event) => setAnswer(event.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} />
                <Pressable type="submit" disabled={solved} className="dashboard-primary-button">检查拼写</Pressable>
              </div>
            </form>}
          {resolvedMode === 'listen' && <section className="verified-practice__recognition" aria-labelledby="recognition-title">
            <h3 id="recognition-title">听发音，选择正确的中文意思</h3>
            <div>
              {recognitionChoices.map((choice) => <Pressable key={choice.id} disabled={solved} aria-label={`选择中文：${choice.meaningZh}`} onClick={() => chooseMeaning(choice.id)}>{choice.meaningZh}</Pressable>)}
            </div>
          </section>}
          {resolvedMode === 'speak' && <section className="verified-practice__speaking" aria-label="跟读练习说明">
            <p>完成跟读后继续；没有真实评测时不会生成分数。</p>
            <Pressable className="dashboard-primary-button" onClick={advanceOrFinish}>{currentIndex < sessionWords.length - 1 ? '跟读完成，下一词' : '完成这一组'}</Pressable>
          </section>}
          {feedback && <p className="verified-practice__feedback" role="status">{feedback}</p>}
          <details className="verified-practice__source"><summary>教材与来源</summary><p>{activeWord.editionNote}</p><a href={activeWord.source.url} target="_blank" rel="noreferrer">查看词表来源</a></details>
        </div>
      </div>
      <nav className="verified-practice__navigation" aria-label="连续学习导航">
        <Pressable aria-label="上一个单词" disabled={currentIndex === 0} onClick={() => moveTo(currentIndex - 1)}><ArrowLeft aria-hidden="true" />上一个</Pressable>
        {currentIndex < sessionWords.length - 1
          ? <Pressable aria-label="下一个单词" onClick={() => moveTo(currentIndex + 1)}>下一个<ArrowRight aria-hidden="true" /></Pressable>
          : <Pressable aria-label="完成这一组" onClick={completeGroup}>完成这一组<ArrowRight aria-hidden="true" /></Pressable>}
      </nav>
    </section>
  )

  if (loadStatus === 'loading') return <section className="route-empty-state practice-landing" aria-labelledby="practice-title"><h2 id="practice-title" data-route-heading tabIndex={-1}>练习</h2><p role="status">正在准备第一组练习题……</p></section>
  if (loadStatus === 'error' || loadStatus === 'empty') return <section className="route-empty-state practice-landing" aria-labelledby="practice-title"><h2 id="practice-title" data-route-heading tabIndex={-1}>练习</h2><p role="alert">{loadStatus === 'error' ? '练习词表暂时无法读取，请稍后重试。' : '当前没有可追溯词条，暂不生成练习题。'}</p></section>

  return (
    <section className="route-empty-state practice-landing" aria-labelledby="practice-title">
      <h2 id="practice-title" data-route-heading tabIndex={-1}>练习</h2>
      <p>选择练习方式。题目只使用有明确来源状态的词条。</p>
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
