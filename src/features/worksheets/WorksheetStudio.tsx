import { FilePdf, Printer } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { BookSummary, Worksheet } from '../../../shared/contracts'
import type { WordPlanetApi } from '../../app/api/client'
import { Pressable } from '../../ui/Pressable'
import { WordArtwork } from '../../learning/WordArtwork'
import { generateWorksheet, type WorksheetRequest } from '../../worksheets/worksheet'
import { unitLabel } from '../../curriculum/labels'

function chunk<T>(values: readonly T[], size: number): readonly (readonly T[])[] {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size))
}

export function WorksheetStudio({ api, fetchWorksheet }: { api: WordPlanetApi; fetchWorksheet?: (request: WorksheetRequest) => Promise<Worksheet> }) {
  const [books, setBooks] = useState<readonly BookSummary[]>([])
  const [bookId, setBookId] = useState('')
  const [unit, setUnit] = useState(1)
  const [count, setCount] = useState(10)
  const [status, setStatus] = useState<'loading' | 'ready' | 'generating' | 'error'>('loading')
  const [unitStatus, setUnitStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [unitOptions, setUnitOptions] = useState<readonly { unit: number; count: number; label?: string }[]>([{ unit: 1, count: 0 }])
  const [worksheet, setWorksheet] = useState<Worksheet | null>(null)
  const generation = useRef(0)
  const [direction, setDirection] = useState<'zh-en' | 'en-zh'>('zh-en')
  useEffect(() => {
    generation.current += 1
    setWorksheet(null)
    setStatus(current => current === 'generating' ? 'ready' : current)
  }, [bookId, unit, count, direction])
  useEffect(() => {
    const cleanup = () => { delete document.body.dataset.worksheetPrintMode }
    window.addEventListener('afterprint', cleanup)
    return () => { generation.current += 1; cleanup(); window.removeEventListener('afterprint', cleanup) }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    api.getBooks(controller.signal).then(({ books: values }) => {
      const available = values.filter((book) => (book.availableWordCount ?? book.verifiedWordCount) > 0)
      setBooks(available)
      setBookId(available[0]?.id ?? '')
      setStatus('ready')
    }).catch((error) => {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setStatus('error')
    })
    return () => controller.abort()
  }, [api])

  useEffect(() => {
    if (!bookId) return
    const controller = new AbortController()
    setUnitStatus('loading')
    setWorksheet(null)
    void (async () => {
      try {
        const response = await api.getWords(bookId, undefined, controller.signal)
        const counts = new Map<number, number>()
        for (const word of response?.words ?? []) counts.set(word.unit, (counts.get(word.unit) ?? 0) + 1)
        const options = [...counts.entries()].sort(([left], [right]) => left - right).map(([value, wordCount]) => ({ unit: value, count: wordCount, label: unitLabel(response.words.find(word => word.unit === value)) }))
        const resolved = options.length > 0 ? options : [{ unit: 1, count: 0 }]
        setUnitOptions(resolved)
        setUnit(resolved[0].unit)
        setCount((current) => resolved[0].count > 0 ? Math.min(current, resolved[0].count) : current)
        setUnitStatus('ready')
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setUnitOptions([{ unit: 1, count: 0 }])
        setUnit(1)
        setUnitStatus('error')
      }
    })()
    return () => controller.abort()
  }, [api, bookId])

  const selectedBook = useMemo(() => books.find((book) => book.id === bookId), [bookId, books])
  const selectedUnitCount = unitOptions.find((option) => option.unit === unit)?.count ?? 0
  const questionPages = useMemo(() => worksheet ? chunk(worksheet.questions, 12) : [], [worksheet])
  const answerPages = useMemo(() => worksheet ? chunk(worksheet.answers, 30) : [], [worksheet])

  async function generate() {
    if (!bookId || unitStatus !== 'ready' || !selectedUnitCount || status === 'generating') return
    const requestId = ++generation.current
    setStatus('generating')
    try {
      const request = { bookId, unit, count, direction, seed: `${bookId}-u${unit}-${Date.now()}-${Math.random()}` }
      const result = await (fetchWorksheet ? fetchWorksheet(request) : generateWorksheet(api, request))
      if (requestId !== generation.current) return
      setWorksheet(result)
      setStatus('ready')
    } catch {
      if (requestId === generation.current) setStatus('error')
    }
  }

  function printWorksheet(mode: 'questions' | 'all') {
    document.body.dataset.worksheetPrintMode = mode
    try {
      window.print()
    } catch {
      delete document.body.dataset.worksheetPrintMode
      setStatus('error')
    }
  }

  return (
    <section className="worksheet-studio" aria-labelledby="worksheet-studio-title">
      <header>
        <FilePdf aria-hidden="true" weight="fill" />
        <div>
          <p className="status-pill">八册学练通道</p>
          <h2 id="worksheet-studio-title" data-route-heading tabIndex={-1}>单元默写纸</h2>
          <p>题目保留内容状态；公开匹配词不会冒充出版社核验词</p>
        </div>
      </header>
      {status === 'loading' && <p role="status">正在读取可用教材</p>}
      {status === 'error' && <p role="status">默写纸暂时无法生成，请检查教材和题数设置。</p>}
      {status === 'ready' && books.length === 0 && <p className="worksheet-studio__empty" role="status">当前没有可追溯词表，暂不生成默写题。</p>}
      {books.length > 0 && (
        <div className="worksheet-studio__controls">
          <label>教材<select value={bookId} onChange={(event) => setBookId(event.target.value)}>{books.map((book) => <option key={book.id} value={book.id}>{book.label}</option>)}</select></label>
          <label>单元<select value={unit} disabled={unitStatus === 'loading'} onChange={(event) => { const nextUnit = Number(event.target.value); setUnit(nextUnit); const nextCount = unitOptions.find((option) => option.unit === nextUnit)?.count ?? 0; if (nextCount > 0) setCount((current) => Math.min(current, nextCount)) }}>{unitOptions.map((option) => <option key={option.unit} value={option.unit}>{option.label ?? `Unit ${option.unit}`}{option.count > 0 ? ` · ${option.count} 词` : ''}</option>)}</select></label>
          <label>题型<select value={direction} onChange={event => setDirection(event.target.value as typeof direction)}><option value="zh-en">看中文写英文</option><option value="en-zh">看英文写中文</option></select></label>
          <label>题数<input type="number" min="1" max={Math.min(50, selectedUnitCount || 50)} value={count} onChange={(event) => setCount(Math.min(50, selectedUnitCount || 50, Math.max(1, Math.floor(Number(event.target.value)) || 1)))} /></label>
          <Pressable className="dashboard-primary-button" disabled={status === 'generating' || unitStatus !== 'ready' || !selectedUnitCount} onClick={() => void generate()}>{status === 'generating' ? '正在生成' : '生成单元默写纸'}</Pressable>
        </div>
      )}
      {books.length > 0 && unitStatus === 'loading' && <p className="worksheet-studio__hint" role="status">正在读取这册教材的单元范围……</p>}
      {books.length > 0 && unitStatus === 'error' && <p className="worksheet-studio__hint" role="status">单元范围暂时无法读取，已保留 Unit 1 供重试。</p>}
      {worksheet && (
        <div className="worksheet-studio__preview">
          <div className="worksheet-studio__toolbar">
            <strong>{selectedBook?.label} · {unitOptions.find(option => option.unit === worksheet.source.unit)?.label ?? `Unit ${worksheet.source.unit}`}</strong>
            <div><Pressable onClick={() => printWorksheet('questions')}><Printer aria-hidden="true" />仅打印题目</Pressable><Pressable className="worksheet-studio__print-all" onClick={() => printWorksheet('all')}><Printer aria-hidden="true" />打印题目与答案</Pressable></div>
          </div>
          {questionPages.map((questions, pageIndex) => <section key={`questions-${pageIndex}`} className="worksheet-print-page worksheet-print-page--questions" data-last-page={pageIndex === questionPages.length - 1} aria-label={`默写题目页 ${pageIndex + 1}/${questionPages.length}`}>
              <header className="worksheet-print-page__header"><div><p>WORD PLANET · 词星球</p><h3>{worksheet.title}</h3></div><strong>{selectedBook?.label}</strong></header>
              <div className="worksheet-print-page__student-fields"><span>班级：<i /></span><span>姓名：<i /></span><span>日期：<i /></span></div>
              <p className="worksheet-print-page__instruction">{direction === 'zh-en' ? '看中文提示，在横线上写出正确的英文单词或短语。' : '看英文提示，在横线上写出对应的中文意思。'}</p>
              <ol start={pageIndex * 12 + 1}>{questions.map((question) => <li key={question.wordId} data-illustrated={direction === 'zh-en' && question.image.src.startsWith('word-art/')}>{direction === 'zh-en' && question.image.src.startsWith('word-art/') && <WordArtwork revealTerm={false} image={question.image} term="" meaningZh={question.prompt} wordId={question.wordId} />}<div><span>{question.number}. {question.prompt}</span><b aria-label="书写横线">{question.blank}</b></div></li>)}</ol>
              <footer>{selectedBook?.editionLabel?.startsWith('照片') ? '教材照片核对词表 · 第82–85页' : worksheet.source.contentStatus === 'source-matched' ? '公开来源匹配 · 请按手中教材页复核' : '正式核验词条'} · 共 {worksheet.questions.length} 题 · 第 {pageIndex + 1}/{questionPages.length} 页</footer>
            </section>)}
          {answerPages.map((answers, pageIndex) => <section key={`answers-${pageIndex}`} className="worksheet-print-page worksheet-print-page--answers" aria-label={`默写答案页 ${pageIndex + 1}/${answerPages.length}`}>
              <header className="worksheet-print-page__header"><div><p>WORD PLANET · 词星球</p><h3>{worksheet.title} · 答案</h3></div><strong>{selectedBook?.label}</strong></header>
              <ol>{answers.map((answer) => <li key={answer.wordId}>{answer.number}. <strong>{answer.answer}</strong></li>)}</ol>
              <footer>答案页 · 建议完成题目后由家长核对 · 第 {pageIndex + 1}/{answerPages.length} 页</footer>
            </section>)}
        </div>
      )}
    </section>
  )
}
