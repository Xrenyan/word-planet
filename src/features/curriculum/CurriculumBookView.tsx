import { ArrowLeft } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { VocabularyWordContract } from '../../../shared/contracts'
import type { WordPlanetApi } from '../../app/api/client'
import { Pressable } from '../../ui/Pressable'
import { PronunciationControls } from '../pronunciation/PronunciationControls'
import { WordArtwork } from '../../learning/WordArtwork'
import { unitLabel } from '../../curriculum/labels'
import { readBookmark } from '../../learning/bookmark'
import { WordDetails } from '../help/ParentGuide'

type CurriculumBookViewProps = {
  api: WordPlanetApi
  bookId: string
  bookLabel?: string
  onBack: () => void
  onStudy: (word: VocabularyWordContract) => void
}

export function CurriculumBookView({ api, bookId, bookLabel, onBack, onStudy }: CurriculumBookViewProps) {
  const [words, setWords] = useState<readonly VocabularyWordContract[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [selectedUnit, setSelectedUnit] = useState(1)
  const [selectedWordId, setSelectedWordId] = useState('')
  const [query, setQuery] = useState('')
  const [retry, setRetry] = useState(0)
  const [previewRequest, setPreviewRequest] = useState(0)
  const focusRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (previewRequest > 0) focusRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [previewRequest])

  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    setQuery('')
    api.getWords(bookId, undefined, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return
        const bookmark = readBookmark()
        const initial = response.words.find(word => word.bookId === bookmark?.bookId && word.id === bookmark.wordId) ?? response.words[0]
        setWords(response.words)
        setSelectedUnit(initial?.unit ?? 1)
        setSelectedWordId(initial?.id ?? '')
        setStatus('ready')
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        if (error instanceof DOMException && error.name === 'AbortError') return
        setStatus('error')
      })
    return () => controller.abort()
  }, [api, bookId, retry])

  const units = useMemo(() => {
    const grouped = new Map<number, VocabularyWordContract[]>()
    for (const word of words) grouped.set(word.unit, [...(grouped.get(word.unit) ?? []), word])
    return [...grouped.entries()]
  }, [words])
  const activeUnitWords = units.find(([unit]) => unit === selectedUnit)?.[1] ?? []
  const selectedWord = activeUnitWords.find((word) => word.id === selectedWordId) ?? activeUnitWords[0]
  const filteredWords = (query.trim() ? words : activeUnitWords).filter(word => `${word.term} ${word.meaningZh}`.toLowerCase().includes(query.trim().toLowerCase()))

  function chooseUnit(unit: number, unitWords: readonly VocabularyWordContract[]) {
    setSelectedUnit(unit)
    setSelectedWordId(unitWords[0]?.id ?? '')
  }

  function previewWord(word: VocabularyWordContract) {
    setSelectedUnit(word.unit)
    setSelectedWordId(word.id)
    setQuery('')
    setPreviewRequest(value => value + 1)
  }

  return (
    <section className="curriculum-book-view" aria-labelledby="curriculum-book-title">
      <header>
        <Pressable className="curriculum-book-view__back" aria-label="返回教材" onClick={onBack}><ArrowLeft aria-hidden="true" /><span>返回教材</span></Pressable>
        <div>
          <h2 id="curriculum-book-title" data-route-heading tabIndex={-1}>{bookLabel || '单元词表'}</h2>
          <p>选一个单元，听音、跟读，再开始练习。</p>
        </div>
      </header>
      {status === 'loading' && <p role="status">正在读取单词</p>}
      {status === 'error' && <div role="alert"><p>单词还没加载好，点一下再试试。</p><Pressable onClick={() => setRetry(value => value + 1)}>再试一次</Pressable></div>}
      {status === 'ready' && <>
        <nav className="curriculum-book-view__unit-tabs" aria-label="选择单元">
          {units.map(([unit, unitWords]) => <Pressable key={unit} aria-pressed={unit === selectedUnit} onClick={() => { setQuery(''); chooseUnit(unit, unitWords) }}>{unitLabel(unitWords[0])}<small>{unitWords.length}词</small></Pressable>)}
        </nav>
        <label className="curriculum-search">查找本册单词<input type="search" placeholder="输入英文或中文，例如 sport / 运动" value={query} onChange={event => setQuery(event.target.value)} /></label>
        {selectedWord && !query.trim() && <section ref={focusRef} className="curriculum-book-view__focus" aria-label={`当前单词 ${selectedWord.term}`}>
          <WordArtwork image={selectedWord.image} term={selectedWord.term} meaningZh={selectedWord.meaningZh} wordId={selectedWord.id} />
          <div><p className="status-pill">{unitLabel(selectedWord)}</p><h3>{selectedWord.term}</h3><p>{selectedWord.meaningZh}</p><PronunciationControls key={selectedWord.id} word={selectedWord} showRecorder={false} /><Pressable className="dashboard-primary-button" onClick={() => onStudy(selectedWord)}>从这里开始学习</Pressable><WordDetails word={selectedWord} /></div>
        </section>}
        <section className="curriculum-book-view__unit">
          <h3>{query.trim() ? '本册搜索结果' : unitLabel(selectedWord)} · {filteredWords.length} 个词</h3>
          {filteredWords.length === 0 && <div className="curriculum-book-view__empty"><p role="status">没有找到这个词，试试其他拼写或中文。</p>{query.trim() && <Pressable onClick={() => setQuery('')}>清空搜索</Pressable>}</div>}
          <div className="curriculum-book-view__words">
            {filteredWords.map((word) => (
              <article key={word.id} data-selected={word.id === selectedWord?.id}>
                <WordArtwork image={word.image} term={word.term} meaningZh={word.meaningZh} wordId={word.id} />
                <div className="curriculum-book-view__word-content">
                  <h4>{word.term}</h4>
                  <p>{word.meaningZh}</p>
                  <small>{word.ipaCommon ?? (word.ipaUk !== '待核实' ? word.ipaUk : word.ipaUs !== '待核实' ? word.ipaUs : '音标暂缺')}</small>
                </div>
                <div className="curriculum-book-view__word-actions">
                  <Pressable className="curriculum-book-view__word-preview" aria-label={`查看 ${word.term}`} aria-pressed={word.id === selectedWord?.id} onClick={() => previewWord(word)}>查看</Pressable>
                  <Pressable className="curriculum-book-view__word-study" aria-label={`学习 ${word.term}`} onClick={() => onStudy(word)}>学习</Pressable>
                </div>
              </article>
            ))}
          </div>
        </section>
      </>}
    </section>
  )
}
