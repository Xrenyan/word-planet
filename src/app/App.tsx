import { useEffect, useState } from 'react'
import type { VocabularyWordContract } from '../../shared/contracts'
import type { LearningEvent } from '../../shared/contracts'
import { CurriculumBookView } from '../features/curriculum/CurriculumBookView'
import { CurriculumBrowser } from '../features/curriculum/CurriculumBrowser'
import { ParentOverview } from '../features/parent/ParentOverview'
import { ProgressDataControls } from '../features/progress/ProgressDataControls'
import { ReviewCenter } from '../features/review/ReviewCenter'
import { TodayDashboard } from '../features/today/TodayDashboard'
import { WorksheetStudio } from '../features/worksheets/WorksheetStudio'
import { GameHub } from '../games/GameHub'
import '../styles/app-shell.css'
import '../styles/liquid-glass.css'
import '../styles/print.css'
import type { WordPlanetApi } from './api/client'
import { localProgressRepository, staticWordPlanetApi } from './api/staticClient'
import { AppShell } from './components/AppShell'
import { PracticePage } from './pages/PracticePage'
import type { RouteId } from './routes'

type TextbookView = { kind: 'library' } | { kind: 'server-book'; bookId: string }
type ProgressRecorder = {
  record(event: LearningEvent): Promise<'saved' | 'memory-only' | 'synced' | 'queued'>
  flush(): Promise<number>
}

export function App({ apiClient = staticWordPlanetApi, progressRecorder }: { apiClient?: WordPlanetApi; progressRecorder?: ProgressRecorder }) {
  const [activeRoute, setActiveRoute] = useState<RouteId>('today')
  const [availableWordCount, setAvailableWordCount] = useState<number>()
  const [selectedWord, setSelectedWord] = useState<VocabularyWordContract | null>(null)
  const [textbookView, setTextbookView] = useState<TextbookView>({ kind: 'library' })
  const [localProgress] = useState<ProgressRecorder>(() => progressRecorder ?? localProgressRepository)

  useEffect(() => {
    const heading = document.querySelector<HTMLElement>('[data-route-heading]')
    heading?.focus({ preventScroll: true })
  }, [activeRoute, textbookView.kind])

  useEffect(() => {
    const controller = new AbortController()
    void apiClient.getBooks(controller.signal).then(({ books }) => {
      setAvailableWordCount(books.reduce((total, book) => total + (book.availableWordCount ?? book.verifiedWordCount), 0))
    }).catch((error) => {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setAvailableWordCount(undefined)
    })
    return () => controller.abort()
  }, [apiClient])

  function resetMainScroll() { window.scrollTo(0, 0) }
  function study(word: VocabularyWordContract) { setSelectedWord(word); setActiveRoute('practice'); resetMainScroll() }
  function changeRoute(route: RouteId) { setActiveRoute(route); setTextbookView({ kind: 'library' }); resetMainScroll() }
  function openCurriculum() { changeRoute('textbook') }

  return <AppShell activeRoute={activeRoute} onRouteChange={changeRoute} availableWordCount={availableWordCount}>
    {activeRoute === 'today' && <><TodayDashboard api={apiClient} onOpenCurriculum={openCurriculum} onStartLearning={study} /><ParentOverview api={apiClient} /></>}
    {activeRoute === 'practice' && <PracticePage word={selectedWord ?? undefined} progressRecorder={localProgress} api={apiClient} onBack={() => changeRoute('today')} />}
    {activeRoute === 'textbook' && textbookView.kind === 'library' && <CurriculumBrowser api={apiClient} onSelectBook={(bookId) => { setTextbookView({ kind: 'server-book', bookId }); resetMainScroll() }} />}
    {activeRoute === 'textbook' && textbookView.kind === 'server-book' && <CurriculumBookView api={apiClient} bookId={textbookView.bookId} onBack={() => setTextbookView({ kind: 'library' })} onStudy={study} />}
    {activeRoute === 'games' && <GameHub api={apiClient} progressRecorder={localProgress} onReturnToLearning={() => changeRoute('textbook')} />}
    {activeRoute === 'mistakes' && <ReviewCenter api={apiClient} onStudy={study} />}
    {activeRoute === 'toolbox' && <><WorksheetStudio api={apiClient} /><ProgressDataControls api={apiClient} /></>}
  </AppShell>
}
