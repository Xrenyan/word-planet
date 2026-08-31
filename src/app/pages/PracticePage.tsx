import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, Headphones, Keyboard, Microphone, SquaresFour } from '@phosphor-icons/react'
import type { LearningEvent, VocabularyWordContract } from '../../../shared/contracts'
import { PronunciationControls } from '../../features/pronunciation/PronunciationControls'
import { WordArtwork } from '../../learning/WordArtwork'
import { Pressable } from '../../ui/Pressable'
import type { WordPlanetApi } from '../api/client'

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
  const [loadStatus, setLoadStatus] = useState<'idle' | 'loading' | 'error' | 'empty'>(api && !word ? 'loading' : 'idle')
  const inputRef = useRef<HTMLInputElement>(null)
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeMode = modes.find((mode) => mode.id === selected)!
  const activeWord = sessionWords[currentIndex]
  const resolvedMode = selected === 'mixed' ? (currentIndex % 2 === 0 ? 'listen' : 'spell') : selected
  const activeWordIdRef = useRef(activeWord?.id)
  activeWordIdRef.current = activeWord?.id

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
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  function chooseMode(mode: (typeof modes)[number]['id']) {
    clearAdvanceTimer()
    setSelected(mode)
    setAnswer('')
    setFeedback('')
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
        let bookId = word?.bookId
        if (!bookId) {
          const { books } = await api.getBooks(controller.signal)
          bookId = books.find((candidate) => (candidate.availableWordCount ?? candidate.verifiedWordCount) > 0)?.id
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
        const startIndex = word ? Math.max(0, words.findIndex((candidate) => candidate.id === word.id)) : 0
        setSessionWords(words)
        setCurrentIndex(startIndex)
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
    if (!activeWord || !answer.trim()) return
    const outcome = answer.trim().toLocaleLowerCase('en') === activeWord.term.toLocaleLowerCase('en') ? 'correct' : 'missed'
    const answeredWordId = activeWord.id
    const hasNext = currentIndex < sessionWords.length - 1
    setFeedback(outcome === 'correct'
      ? hasNext ? '答对了，马上进入下一个单词' : '答对了，本册练习完成'
      : '再听一遍试试，答案会保留在当前单词')
    if (outcome === 'correct' && hasNext) {
      clearAdvanceTimer()
      advanceTimerRef.current = setTimeout(() => moveTo(currentIndex + 1), 520)
    }
    if (!progressRecorder) return
    void progressRecorder.record({
      id: eventId(activeWord.id), profileId: 'local-child', wordId: activeWord.id, outcome, source: 'spelling', occurredAt: Date.now(),
    }).then((status) => {
      if (activeWordIdRef.current !== answeredWordId) return
      setFeedback(outcome === 'correct'
        ? status === 'memory-only' ? '答对了；本次记录未保存，马上进入下一词' : hasNext ? '答对了，已保存在此设备，马上进入下一词' : '答对了，已保存在此设备，本册练习完成'
        : status === 'memory-only' ? '再练一次；本次错词记录未保存' : '再练一次，错词已保存在此设备')
    }).catch(() => {
      if (activeWordIdRef.current === answeredWordId) setFeedback(outcome === 'correct' ? '答对了，记录稍后自动重试' : '再练一次，记录稍后自动重试')
    })
  }

  function chooseMeaning(chosenWordId: string) {
    if (!activeWord) return
    const outcome = chosenWordId === activeWord.id ? 'correct' : 'missed'
    const answeredWordId = activeWord.id
    const hasNext = currentIndex < sessionWords.length - 1
    setFeedback(outcome === 'correct'
      ? hasNext ? '选对了，马上进入下一个单词' : '选对了，本册练习完成'
      : '再听一遍，继续选择当前单词')
    if (outcome === 'correct' && hasNext) {
      clearAdvanceTimer()
      advanceTimerRef.current = setTimeout(() => moveTo(currentIndex + 1), 520)
    }
    if (!progressRecorder) return
    void progressRecorder.record({
      id: eventId(activeWord.id), profileId: 'local-child', wordId: activeWord.id, outcome, source: 'recognition', occurredAt: Date.now(),
    }).then((status) => {
      if (activeWordIdRef.current !== answeredWordId) return
      setFeedback(outcome === 'correct'
        ? status === 'memory-only' ? '选对了；本次记录未保存，马上进入下一词' : hasNext ? '选对了，已保存在此设备，马上进入下一词' : '选对了，已保存在此设备，本册练习完成'
        : status === 'memory-only' ? '再练一次；本次错词记录未保存' : '再练一次，错词已保存在此设备')
    }).catch(() => {
      if (activeWordIdRef.current === answeredWordId) setFeedback(outcome === 'correct' ? '选对了，记录稍后自动重试' : '再练一次，记录稍后自动重试')
    })
  }

  const recognitionChoices = activeWord
    ? [activeWord, ...sessionWords.filter((candidate) => candidate.id !== activeWord.id)]
      .filter((candidate, index, choices) => choices.findIndex((item) => item.meaningZh === candidate.meaningZh) === index)
      .slice(0, 4)
    : []

  if (activeWord) return (
    <section className="route-empty-state verified-practice" aria-labelledby="practice-title">
      <div className="verified-practice__topbar">
        {onBack && <Pressable className="verified-practice__back" onClick={onBack}><ArrowLeft aria-hidden="true" />返回今天</Pressable>}
        <p className="status-pill">{activeWord.sourceConfidence === 'public-secondary' ? '公开来源匹配 · 待教材页复核' : '已核验教材词条'}</p>
        <p className="verified-practice__progress" aria-live="polite">第 {currentIndex + 1} / {sessionWords.length} 词</p>
      </div>
      <h2 id="practice-title" data-route-heading tabIndex={-1}>{selected === 'learn' ? '学习' : '练习'} · {activeWord.meaningZh}</h2>
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
          <WordArtwork image={activeWord.image} term={activeWord.term} meaningZh={activeWord.meaningZh} wordId={activeWord.id} />
          <figcaption>{activeWord.image.license.startsWith('original-') ? '词星球原创词义记忆卡' : '公开来源配图 · 权利归原来源'}</figcaption>
        </figure>
        <div>
          {resolvedMode === 'learn' && <section className="verified-practice__word-card" aria-label={`正在学习单词 ${activeWord.term}`}>
            <span>NEW WORD</span>
            <strong lang="en">{activeWord.term}</strong>
            <p>{activeWord.meaningZh}</p>
            <small>看图、听音，再大声读三遍</small>
          </section>}
          <PronunciationControls word={activeWord} />
          {resolvedMode === 'spell' && <form onSubmit={submit}>
              <label htmlFor="verified-spelling">根据中文写英文</label>
              <div>
                <input ref={inputRef} id="verified-spelling" value={answer} onChange={(event) => setAnswer(event.target.value)} autoComplete="off" spellCheck={false} />
                <Pressable type="submit" className="dashboard-primary-button">检查拼写</Pressable>
              </div>
            </form>}
          {resolvedMode === 'listen' && <section className="verified-practice__recognition" aria-labelledby="recognition-title">
            <h3 id="recognition-title">听发音，选择正确的中文意思</h3>
            <div>
              {recognitionChoices.map((choice) => <Pressable key={choice.id} aria-label={`选择中文：${choice.meaningZh}`} onClick={() => chooseMeaning(choice.id)}>{choice.meaningZh}</Pressable>)}
            </div>
          </section>}
          {resolvedMode === 'speak' && <section className="verified-practice__speaking" aria-label="跟读练习说明">
            <p>完成跟读后继续；没有真实评测时不会生成分数。</p>
            <Pressable className="dashboard-primary-button" onClick={() => currentIndex < sessionWords.length - 1 ? moveTo(currentIndex + 1) : setFeedback('本册跟读完成')}>跟读完成，下一词</Pressable>
          </section>}
          {feedback && <p className="verified-practice__feedback" role="status">{feedback}</p>}
          <p className="verified-practice__source">词表来源：{activeWord.sourceConfidence === 'public-secondary' ? '公开来源匹配，待手中教材复核' : '正式核验'} · 来源页 {activeWord.source.page}</p>
        </div>
      </div>
      <nav className="verified-practice__navigation" aria-label="连续学习导航">
        <Pressable aria-label="上一个单词" disabled={currentIndex === 0} onClick={() => moveTo(currentIndex - 1)}><ArrowLeft aria-hidden="true" />上一个</Pressable>
        {currentIndex < sessionWords.length - 1
          ? <Pressable aria-label="下一个单词" onClick={() => moveTo(currentIndex + 1)}>下一个<ArrowRight aria-hidden="true" /></Pressable>
          : <Pressable aria-label="重新开始本册" disabled={sessionWords.length < 2} onClick={() => moveTo(0)}>重新开始</Pressable>}
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
