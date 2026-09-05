import { BookOpen, CheckCircle, ShieldCheck } from '@phosphor-icons/react'
import { useCallback, useEffect, useState } from 'react'
import type { BookSummary } from '../../../shared/contracts'
import type { WordPlanetApi } from '../../app/api/client'
import { Pressable } from '../../ui/Pressable'

type CurriculumBrowserProps = {
  api: WordPlanetApi
  onSelectBook: (bookId: string) => void
}

export function CurriculumBrowser({ api, onSelectBook }: CurriculumBrowserProps) {
  const [books, setBooks] = useState<readonly BookSummary[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  const load = useCallback(async (signal?: AbortSignal) => {
    setStatus('loading')
    try {
      const result = await api.getBooks(signal)
      setBooks(result.books)
      setStatus('ready')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setStatus('error')
    }
  }, [api])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  return (
    <section className="curriculum-browser" aria-labelledby="curriculum-browser-title">
      <header>
        <div>
          <h2 id="curriculum-browser-title" data-route-heading tabIndex={-1}>教材</h2>
          <p>外研社三年级起点 · 四上已按教材照片更新 · 各册版本如实标注</p>
        </div>
        <span><ShieldCheck aria-hidden="true" weight="fill" />来源状态实时显示</span>
      </header>
      {status === 'loading' && <p role="status">正在读取教材目录</p>}
      {status === 'error' && (
        <div role="alert">
          <p>教材数据暂时无法读取。</p>
          <Pressable onClick={() => void load()}>重新读取</Pressable>
        </div>
      )}
      <div className="curriculum-browser__books">
        {books.map((book) => {
          const count = book.availableWordCount ?? book.verifiedWordCount
          const available = count > 0
          return (
            <article key={book.id} className="curriculum-browser__book">
              <span className="curriculum-browser__grade">{book.grade}</span>
              <div>
                <h3>{book.label}</h3>
                {book.editionLabel && <strong className="edition-label">{book.editionLabel}</strong>}
                <p>{book.editionLabel?.includes('照片核对') ? `${count} 个教材照片核对词` : book.status === 'verified' ? `${count} 个正式核验词` : available ? `${count} 个公开来源匹配词 · 待教材页复核` : '等待来源核验'}</p>
                {book.editionNote && <details><summary>版本说明</summary><p>{book.editionNote}</p></details>}
              </div>
              <Pressable
                aria-label={available ? `打开${book.label}，${count}个词` : `${book.label} 等待来源核验`}
                disabled={!available}
                onClick={() => onSelectBook(book.id)}
              >
                {available ? <CheckCircle aria-hidden="true" weight="fill" /> : <BookOpen aria-hidden="true" />}
              </Pressable>
            </article>
          )
        })}
      </div>
    </section>
  )
}
