import { ArrowLeft } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import type { VocabularyWordContract } from '../../../shared/contracts'
import type { WordPlanetApi } from '../../app/api/client'
import { Pressable } from '../../ui/Pressable'
import { PronunciationControls } from '../pronunciation/PronunciationControls'
import { WordArtwork } from '../../learning/WordArtwork'

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
          <p>公开来源匹配词均保留原始页面；不等同于出版社逐词核验。</p>
        </div>
      </header>
      {status === 'loading' && <p role="status">正在读取单词</p>}
      {status === 'error' && <p role="alert">单词列表暂时无法读取，请返回后重试。</p>}
      {status === 'ready' && <>
        <nav className="curriculum-book-view__unit-tabs" aria-label="选择单元">
          {units.map(([unit, unitWords]) => <Pressable key={unit} aria-pressed={unit === selectedUnit} onClick={() => chooseUnit(unit, unitWords)}>Unit {unit}<small>{unitWords.length}词</small></Pressable>)}
        </nav>
        {selectedWord && <section className="curriculum-book-view__focus" aria-label={`当前单词 ${selectedWord.term}`}>
          <WordArtwork image={selectedWord.image} term={selectedWord.term} meaningZh={selectedWord.meaningZh} wordId={selectedWord.id} />
          <div><p className="status-pill">{selectedWord.sourceConfidence === 'public-secondary' ? '公开来源匹配 · 待教材页复核' : '正式核验'}</p><h3>{selectedWord.term}</h3><p>{selectedWord.meaningZh}</p><small>{selectedWord.editionNote}</small><PronunciationControls word={selectedWord} /></div>
        </section>}
        <section className="curriculum-book-view__unit">
          <h3>Unit {selectedUnit} · {activeUnitWords.length} 个词</h3>
          <div className="curriculum-book-view__words">
            {activeUnitWords.map((word) => (
              <article key={word.id} data-selected={word.id === selectedWord?.id}>
                <WordArtwork image={word.image} term={word.term} meaningZh={word.meaningZh} wordId={word.id} />
                <div>
                  <h4>{word.term}</h4>
                  <p>{word.meaningZh}</p>
                  <small>{word.ipaStatus === 'unavailable' ? '音标待核' : word.ipaUk}</small>
                  <a href={word.source.url} target="_blank" rel="noreferrer">来源 · {word.sourceConfidence === 'public-secondary' ? '公开匹配' : '正式核验'}</a>
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
