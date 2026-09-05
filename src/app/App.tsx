import { lazy, Suspense, useEffect, useState } from 'react'
import type { BookSummary, VocabularyWordContract } from '../../shared/contracts'
import type { LearningEvent } from '../../shared/contracts'
import { ParentOverview } from '../features/parent/ParentOverview'
import { TodayDashboard } from '../features/today/TodayDashboard'
import '../styles/app-shell.css'
import '../styles/games.css'
import '../styles/print.css'
import type { WordPlanetApi } from './api/client'
import { localProgressRepository, staticWordPlanetApi } from './api/staticClient'
import { AppShell } from './components/AppShell'
import { navigationItems, type RouteId } from './routes'
import { readBookmark } from '../learning/bookmark'
import { ParentGuide } from '../features/help/ParentGuide'

const CurriculumBookView = lazy(() => import('../features/curriculum/CurriculumBookView').then(module => ({ default: module.CurriculumBookView })))
const CurriculumBrowser = lazy(() => import('../features/curriculum/CurriculumBrowser').then(module => ({ default: module.CurriculumBrowser })))
const ProgressDataControls = lazy(() => import('../features/progress/ProgressDataControls').then(module => ({ default: module.ProgressDataControls })))
const ReviewCenter = lazy(() => import('../features/review/ReviewCenter').then(module => ({ default: module.ReviewCenter })))
const WorksheetStudio = lazy(() => import('../features/worksheets/WorksheetStudio').then(module => ({ default: module.WorksheetStudio })))
const GameHub = lazy(() => import('../games/GameHub').then(module => ({ default: module.GameHub })))
const PracticePage = lazy(() => import('./pages/PracticePage').then(module => ({ default: module.PracticePage })))
const SyncDataControls = lazy(() => import('../features/sync/SyncDataControls').then(module => ({ default: module.SyncDataControls })))

function readLocation(): { route: RouteId; view: TextbookView } {
  const [route, bookId] = window.location.hash.slice(1).split('/')
  return {
    route: navigationItems.some(item => item.id === route) ? route as RouteId : 'today',
    view: route === 'textbook' && /^[a-z0-9-]{1,80}$/.test(bookId ?? '') ? { kind: 'server-book', bookId } : { kind: 'library' },
  }
}

type TextbookView = { kind: 'library' } | { kind: 'server-book'; bookId: string }
type ProgressRecorder = {
  record(event: LearningEvent): Promise<'saved' | 'memory-only' | 'synced' | 'queued'>
  flush(): Promise<number>
}

export function App({ apiClient = staticWordPlanetApi, progressRecorder }: { apiClient?: WordPlanetApi; progressRecorder?: ProgressRecorder }) {
  const [activeRoute, setActiveRoute] = useState<RouteId>(() => readLocation().route)
  const [books, setBooks] = useState<readonly BookSummary[]>([])
  const [progressVersion, setProgressVersion] = useState(0)
  const [localProgressVersion, setLocalProgressVersion] = useState(0)
  const [hasOpenedTools, setHasOpenedTools] = useState(() => readLocation().route === 'toolbox')
  const [selectedWord, setSelectedWord] = useState<VocabularyWordContract | null>(null)
  const [textbookView, setTextbookView] = useState<TextbookView>(() => readLocation().view)
  const [localProgress] = useState<ProgressRecorder>(() => progressRecorder ?? localProgressRepository)
  useEffect(() => { if (activeRoute === 'toolbox') setHasOpenedTools(true) }, [activeRoute])

  useEffect(() => {
    function restoreRoute() {
      const location = readLocation()
      setActiveRoute(location.route)
      setTextbookView(location.view)
      setSelectedWord(null)
      resetMainScroll()
    }
    window.addEventListener('hashchange', restoreRoute)
    window.addEventListener('popstate', restoreRoute)
    return () => { window.removeEventListener('hashchange', restoreRoute); window.removeEventListener('popstate', restoreRoute) }
  }, [])

  useEffect(() => {
    const heading = document.querySelector<HTMLElement>('[data-route-heading]')
    heading?.focus({ preventScroll: true })
  }, [activeRoute, textbookView.kind])

  useEffect(() => {
    const controller = new AbortController()
    void apiClient.getBooks(controller.signal).then(({ books }) => {
      if (controller.signal.aborted) return
      setBooks(books)
    }).catch((error) => {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setBooks([])
    })
    return () => controller.abort()
  }, [apiClient])

  function resetMainScroll() { window.scrollTo(0, 0) }
  function navigate(route: RouteId, bookId?: string) {
    const hash = `#${route}${bookId ? `/${bookId}` : ''}`
    if (window.location.hash !== hash) window.history.pushState(null, '', hash)
    setActiveRoute(route)
    setTextbookView(bookId ? { kind: 'server-book', bookId } : { kind: 'library' })
    resetMainScroll()
  }
  function study(word: VocabularyWordContract) { setSelectedWord(word); navigate('practice') }
  function changeRoute(route: RouteId) { setSelectedWord(null); navigate(route) }
  function openCurriculum() { changeRoute('textbook') }
  function returnToWordList() {
    const bookId = readBookmark()?.bookId ?? selectedWord?.bookId
    setSelectedWord(null)
    navigate('textbook', bookId)
  }

  return <AppShell activeRoute={activeRoute} onRouteChange={changeRoute}>
    <Suspense fallback={<p className="route-loading" role="status">正在打开，请稍候…</p>}>
    {activeRoute === 'today' && <TodayDashboard api={apiClient} onOpenCurriculum={openCurriculum} onOpenGames={() => changeRoute('games')} onStartLearning={study} />}
    {activeRoute === 'practice' && <PracticePage word={selectedWord ?? undefined} progressRecorder={localProgress} api={apiClient} onBack={returnToWordList} />}
    {activeRoute === 'textbook' && textbookView.kind === 'library' && <CurriculumBrowser api={apiClient} onSelectBook={(bookId) => navigate('textbook', bookId)} />}
    {activeRoute === 'textbook' && textbookView.kind === 'server-book' && <CurriculumBookView api={apiClient} bookId={textbookView.bookId} bookLabel={books.find(book => book.id === textbookView.bookId)?.label} onBack={() => navigate('textbook')} onStudy={study} />}
    {activeRoute === 'games' && <GameHub api={apiClient} progressRecorder={localProgress} onReturnToLearning={() => changeRoute('textbook')} />}
    {activeRoute === 'mistakes' && <ReviewCenter api={apiClient} onStudy={study} onOpenCurriculum={openCurriculum} />}
    {activeRoute === 'toolbox' && <WorksheetStudio api={apiClient} />}
    {(hasOpenedTools || activeRoute === 'toolbox') && <div className="sync-route-panel" hidden={activeRoute !== 'toolbox'}><details className="parent-tools"><summary>家长工具</summary><p className="parent-tools__intro">学习情况、教材说明、记录备份，以及换设备继续学。</p>{activeRoute === 'toolbox' && <ParentOverview key={`overview-${progressVersion}-${localProgressVersion}`} api={apiClient} />}<ParentGuide books={books} />{activeRoute === 'toolbox' && <ProgressDataControls key={progressVersion} api={apiClient} onChanged={() => setLocalProgressVersion(version => version + 1)} />}<SyncDataControls api={apiClient} apiOrigin="https://word-planet-sync.zhanyiqing514.chatgpt.site" onSynced={() => setProgressVersion(version => version + 1)} /></details></div>}
    </Suspense>
  </AppShell>
}
