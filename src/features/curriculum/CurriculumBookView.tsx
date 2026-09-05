import { sourceLabel } from '../../curriculum/sourceLabel'
import { ArrowLeft } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import type { VocabularyWordContract } from '../../../shared/contracts'
import type { WordPlanetApi } from '../../app/api/client'
import { Pressable } from '../../ui/Pressable'
import { PronunciationControls } from '../pronunciation/PronunciationControls'
import { WordArtwork } from '../../learning/WordArtwork'
import { unitLabel } from '../../curriculum/labels'

type CurriculumBookViewProps = {
  api: WordPlanetApi
  bookId: string
  onBack: () => void
  onStudy: (word: VocabularyWordContract) => void
}

export function CurriculumBookView({ api, bookId, onBack, onStudy }: CurriculumBookViewProps) {
  const [words, setWords] = useState<readonly VocabularyWordContract[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [selectedUnit, setSelectedUnit] = useState(1)
  const [selectedWordId, setSelectedWordId] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    api.getWords(bookId, undefined, controller.signal)
      .then((response) => {
        setWords(response.words)
        setSelectedUnit(response.words[0]?.unit ?? 1)
        setSelectedWordId(response.words[0]?.id ?? '')
        setStatus('ready')
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setStatus('error')
      })
    return () => controller.abort()
  }, [api, bookId])

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

  return (
    <section className="curriculum-book-view" aria-labelledby="curriculum-book-title">
      <header>
        <Pressable aria-label="返回教材" onClick={onBack}><ArrowLeft aria-hidden="true" /></Pressable>
        <div>
          <h2 id="curriculum-book-title" data-route-heading tabIndex={-1}>单元词表</h2>
          <p>选一个单元，听音、跟读，再开始练习。</p>
        </div>
      </header>
      {status === 'loading' && <p role="status">正在读取单词</p>}
      {status === 'error' && <p role="alert">单词列表暂时无法读取，请返回后重试。</p>}
      {status === 'ready' && <>
        <nav className="curriculum-book-view__unit-tabs" aria-label="选择单元">
          {units.map(([unit, unitWords]) => <Pressable key={unit} aria-pressed={unit === selectedUnit} onClick={() => { setQuery(''); chooseUnit(unit, unitWords) }}>{unitLabel(unitWords[0])}<small>{unitWords.length}词</small></Pressable>)}
        </nav>
        <label className="curriculum-search">查找本册单词<input type="search" placeholder="输入英文或中文，例如 sport / 运动" value={query} onChange={event => setQuery(event.target.value)} /></label>
        {selectedWord && <section className="curriculum-book-view__focus" aria-label={`当前单词 ${selectedWord.term}`}>
          <WordArtwork image={selectedWord.image} term={selectedWord.term} meaningZh={selectedWord.meaningZh} wordId={selectedWord.id} />
          <div><p className="status-pill">{sourceLabel(selectedWord)}</p><h3>{selectedWord.term}</h3><p>{selectedWord.meaningZh}</p><PronunciationControls key={selectedWord.id} word={selectedWord} /><Pressable className="dashboard-primary-button" onClick={() => onStudy(selectedWord)}>从这里开始学习</Pressable><details className="pronunciation-source"><summary>教材版本与来源</summary><p>{selectedWord.editionNote}</p></details></div>
        </section>}
        <section className="curriculum-book-view__unit">
          <h3>{query.trim() ? '本册搜索结果' : unitLabel(selectedWord)} · {filteredWords.length} 个词</h3>
          {filteredWords.length === 0 && <p role="status">没有找到这个词，试试其他拼写或中文。</p>}
          <div className="curriculum-book-view__words">
            {filteredWords.map((word) => (
              <article key={word.id} data-selected={word.id === selectedWord?.id}>
                <WordArtwork image={word.image} term={word.term} meaningZh={word.meaningZh} wordId={word.id} />
                <div>
                  <h4>{word.term}</h4>
                  <p>{word.meaningZh}</p>
                  <small>{word.ipaCommon ?? (word.ipaUk !== '待核实' ? word.ipaUk : word.ipaUs)}</small>
                  <a href={word.source.url} target="_blank" rel="noreferrer">来源 · {word.sourceConfidence === 'user-photo' ? '照片核对' : word.sourceConfidence === 'public-secondary' ? '公开匹配' : '正式核验'}</a>
                </div>
                <Pressable aria-label={`学习 ${word.term}`} onClick={() => onStudy(word)}>学习</Pressable>
              </article>
            ))}
          </div>
        </section>
      </>}
    </section>
  )
}
