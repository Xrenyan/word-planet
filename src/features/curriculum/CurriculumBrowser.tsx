import { BookOpen, ArrowRight } from '@phosphor-icons/react'
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
          <p>选好课本，开始今天的单词冒险。</p>
        </div>
        <span><BookOpen aria-hidden="true" weight="fill" />外研社 · 三年级起点</span>
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
            <Pressable
              key={book.id}
              className="curriculum-browser__book"
              aria-label={available ? `打开${book.label}，${count}个词` : `${book.label} 词表准备中`}
              disabled={!available}
              onClick={() => onSelectBook(book.id)}
            >
              <span className="curriculum-browser__grade">{book.grade}</span>
              <span className="curriculum-browser__book-content">
                <span className="curriculum-browser__book-title">{book.label}</span>
                {book.editionLabel && <strong className="edition-label">{book.editionLabel.includes('Module') || book.editionLabel.includes('旧版') ? 'Module 单元 · 旧版' : 'Unit 单元'}</strong>}
                <span className="curriculum-browser__book-count">{available ? `${count} 个单词` : '词表准备中'}</span>
              </span>
              <span className="curriculum-browser__book-arrow">
                {available ? <ArrowRight aria-hidden="true" weight="bold" /> : <BookOpen aria-hidden="true" />}
              </span>
            </Pressable>
          )
        })}
      </div>
      <p className="curriculum-browser__note">请按课本单元选择版本；详细说明在工具箱的“家长工具”里。</p>
    </section>
  )
}
