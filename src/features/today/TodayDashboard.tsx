import { unitLabel } from '../../curriculum/labels'
import { WordDetails } from '../help/ParentGuide'
import { ArrowRight, BookOpen, GameController } from '@phosphor-icons/react'
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
  | { status: 'ready'; word: VocabularyWordContract; bookLabel: string; completed: number }

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
  onOpenGames?: () => void
}

export function TodayDashboard({ api, onStartLearning, onOpenCurriculum, onOpenGames }: TodayDashboardProps) {
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
      if (signal?.aborted) return
      setState(word ? { status: 'ready', word, bookLabel: available.label, completed } : { status: 'empty' })
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
          <p>每天学一点，单词记得牢。</p>
        </div>
        <Pressable className="dashboard-secondary-button" onClick={onOpenCurriculum}><BookOpen aria-hidden="true" />换课本</Pressable>
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
          <p>检查一下网络，再试一次吧。</p>
          <Pressable className="dashboard-secondary-button" onClick={() => void load()}>重新读取</Pressable>
        </div>
      )}

      {state.status === 'empty' && (
        <div className="today-dashboard__state today-dashboard__state--empty" role="status">
          <img src={`${import.meta.env.BASE_URL}mascot/cibao.png`} alt="词宝等你一起学单词" />
          <div>
            <strong>先选一本课本吧</strong>
            <p>找到你正在学的那一册，和词宝一起出发。</p>
            <Pressable className="dashboard-primary-button" onClick={onOpenCurriculum}>选择课本</Pressable>
          </div>
        </div>
      )}

      {state.status === 'ready' && (
        <>
        <div className="today-dashboard__lesson">
          <div className="today-dashboard__word">
            <p className="today-dashboard__context">{state.bookLabel} · {unitLabel(state.word)}</p>
            <h3 lang="en">{state.word.term}</h3>
            <p className="today-dashboard__meaning">{state.word.meaningZh}</p>
          </div>
          <figure className="today-dashboard__art">
            <WordArtwork image={state.word.image} term={state.word.term} meaningZh={state.word.meaningZh} wordId={state.word.id} />
          </figure>
          <div className="today-dashboard__controls">
            <PronunciationControls word={state.word} showRecorder={false} />
            <Pressable className="dashboard-primary-button" onClick={() => onStartLearning?.(state.word)}>
              <BookOpen aria-hidden="true" />开始学习<ArrowRight aria-hidden="true" />
            </Pressable>
          </div>
        </div>
        <div className="today-dashboard__footer">
          <p className="today-dashboard__progress">今天答对了 {state.completed} 个单词</p>
          <WordDetails word={state.word} />
        </div>
        <div className="today-dashboard__shortcuts">
          <Pressable onClick={onOpenCurriculum}><BookOpen aria-hidden="true" /><strong>教材</strong><span>跟着课本学单词</span><ArrowRight aria-hidden="true" /></Pressable>
          <Pressable onClick={onOpenGames}><GameController aria-hidden="true" /><strong>游戏</strong><span>换个方式练一练</span><ArrowRight aria-hidden="true" /></Pressable>
        </div>
        </>
      )}
    </section>
  )
}
