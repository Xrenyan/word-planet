import { sourceLabel } from '../../curriculum/sourceLabel'
import { BookOpen } from '@phosphor-icons/react'
import { useCallback, useEffect, useState } from 'react'
import type { VocabularyWordContract } from '../../../shared/contracts'
import type { WordPlanetApi } from '../../app/api/client'
import { Pressable } from '../../ui/Pressable'
import { PronunciationControls } from '../pronunciation/PronunciationControls'
import { WordArtwork } from '../../learning/WordArtwork'
import { readBookmark } from '../../learning/bookmark'

type DashboardState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'empty' }
  | { status: 'ready'; word: VocabularyWordContract; total: number; completed: number }

const shanghaiDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function shanghaiDateKey(timestamp: number) {
  return shanghaiDateFormatter.format(new Date(timestamp))
}

type TodayDashboardProps = {
  api: WordPlanetApi
  onStartLearning?: (word: VocabularyWordContract) => void
  onOpenCurriculum?: () => void
}

export function TodayDashboard({ api, onStartLearning, onOpenCurriculum }: TodayDashboardProps) {
  const [state, setState] = useState<DashboardState>({ status: 'loading' })

  const load = useCallback(async (signal?: AbortSignal) => {
    setState({ status: 'loading' })
    try {
      const { books } = await api.getBooks(signal)
      const bookmark = readBookmark()
      const availableBooks = books.filter((book) => (book.availableWordCount ?? book.verifiedWordCount) > 0)
      const available = availableBooks.find(book => book.id === bookmark?.bookId) ?? availableBooks[0]
      if (!available) {
        setState({ status: 'empty' })
        return
      }
      const { words } = await api.getWords(available.id, undefined, signal)
      let word = words.find(word => word.id === bookmark?.wordId) ?? words[0]
      let completed = 0
      if (word && api.getProgress) {
        try {
          const progress = await api.getProgress('local-child', signal)
          word = progress.priorityWordIds
            .map((wordId) => words.find((candidate) => candidate.id === wordId))
            .find(Boolean) ?? word
          const currentBookWordIds = new Set(words.map((candidate) => candidate.id))
          const todayKey = shanghaiDateKey(Date.now())
          completed = new Set(progress.events
            .filter((event) => event.outcome === 'correct'
              && currentBookWordIds.has(event.wordId)
              && shanghaiDateKey(event.occurredAt) === todayKey)
            .map((event) => event.wordId)).size
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') throw error
          // Curriculum remains usable when progress synchronization is temporarily offline.
        }
      }
      setState(word ? { status: 'ready', word, total: words.length, completed } : { status: 'empty' })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setState({ status: 'error' })
    }
  }, [api])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  return (
    <section className="today-dashboard" aria-labelledby="today-dashboard-title">
      <div className="today-dashboard__header">
        <div>
          <h2 id="today-dashboard-title" data-route-heading tabIndex={-1}>今天的学习</h2>
          <p>听清楚、读准确，再把单词写出来。</p>
        </div>
      </div>

      {state.status === 'loading' && (
        <div className="today-dashboard__state" role="status">
          <span className="loading-orbit" aria-hidden="true" />
          正在读取教材
        </div>
      )}

      {state.status === 'error' && (
        <div className="today-dashboard__state" role="alert">
          <strong>教材暂时没有读取成功</strong>
          <p>请刷新页面重试；本机学习记录不会因此改变。</p>
          <Pressable className="dashboard-secondary-button" onClick={() => void load()}>重新读取</Pressable>
        </div>
      )}

      {state.status === 'empty' && (
        <div className="today-dashboard__state today-dashboard__state--empty" role="status">
          <img src={`${import.meta.env.BASE_URL}mascot/cibao.png`} alt="词宝正在检查教材来源" />
          <div>
            <strong>正式词表仍在来源核验中</strong>
            <p>已确认八册教材范围，但不会把来源不明的网络词表冒充最新版教材。</p>
            <Pressable className="dashboard-primary-button" onClick={onOpenCurriculum}>查看教材状态</Pressable>
          </div>
        </div>
      )}

      {state.status === 'ready' && (
        <div className="today-dashboard__lesson">
          <div className="today-dashboard__word">
            <p className="today-dashboard__context">当前学习单词</p>
            <h3>{state.word.term}</h3>
            <p className="today-dashboard__meaning">{state.word.meaningZh}</p>
            <p className="today-dashboard__context">{sourceLabel(state.word)}</p>
          </div>
          <figure className="today-dashboard__art">
            <WordArtwork image={state.word.image} term={state.word.term} meaningZh={state.word.meaningZh} wordId={state.word.id} />
            <figcaption>{state.word.image.src.startsWith('word-art/') ? 'OpenMoji 词义配图' : state.word.image.src.startsWith('https:') ? '公开来源配图 · 权利归原来源' : '词义联想提示'}</figcaption>
          </figure>
          <div className="today-dashboard__controls">
            <PronunciationControls word={state.word} />
            <Pressable className="dashboard-primary-button" onClick={() => onStartLearning?.(state.word)}>
              <BookOpen aria-hidden="true" weight="fill" />开始学习
            </Pressable>
          </div>
          <p className="today-dashboard__progress">今日已完成 {state.completed} / {state.total}</p>
        </div>
      )}
    </section>
  )
}
