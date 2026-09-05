import { lazy, Suspense, useEffect, useState } from 'react'
import type { VocabularyWordContract } from '../../shared/contracts'
import type { LearningEvent } from '../../shared/contracts'
import { ParentOverview } from '../features/parent/ParentOverview'
import { TodayDashboard } from '../features/today/TodayDashboard'
import '../styles/app-shell.css'
import '../styles/liquid-glass.css'
import '../styles/print.css'
import '../styles/refinements.css'
import type { WordPlanetApi } from './api/client'
import { localProgressRepository, staticWordPlanetApi } from './api/staticClient'
import { AppShell } from './components/AppShell'
import { navigationItems, type RouteId } from './routes'

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
  const [availableWordCount, setAvailableWordCount] = useState<number>()
  const [progressVersion, setProgressVersion] = useState(0)
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
      setAvailableWordCount(books.reduce((total, book) => total + (book.availableWordCount ?? book.verifiedWordCount), 0))
    }).catch((error) => {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setAvailableWordCount(undefined)
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

  return <AppShell activeRoute={activeRoute} onRouteChange={changeRoute} availableWordCount={availableWordCount}>
    <Suspense fallback={<p className="route-loading" role="status">正在打开，请稍候…</p>}>
    {activeRoute === 'today' && <><TodayDashboard api={apiClient} onOpenCurriculum={openCurriculum} onStartLearning={study} /><ParentOverview api={apiClient} /></>}
    {activeRoute === 'practice' && <PracticePage word={selectedWord ?? undefined} progressRecorder={localProgress} api={apiClient} onBack={() => changeRoute('today')} />}
    {activeRoute === 'textbook' && textbookView.kind === 'library' && <CurriculumBrowser api={apiClient} onSelectBook={(bookId) => navigate('textbook', bookId)} />}
    {activeRoute === 'textbook' && textbookView.kind === 'server-book' && <CurriculumBookView api={apiClient} bookId={textbookView.bookId} onBack={() => navigate('textbook')} onStudy={study} />}
    {activeRoute === 'games' && <GameHub api={apiClient} progressRecorder={localProgress} onReturnToLearning={() => changeRoute('textbook')} />}
    {activeRoute === 'mistakes' && <ReviewCenter api={apiClient} onStudy={study} />}
    {activeRoute === 'toolbox' && <><WorksheetStudio api={apiClient} /><ProgressDataControls key={progressVersion} api={apiClient} /></>}
    {(hasOpenedTools || activeRoute === 'toolbox') && <div className="sync-route-panel" hidden={activeRoute !== 'toolbox'}><SyncDataControls api={apiClient} apiOrigin="https://word-planet-sync.zhanyiqing514.chatgpt.site" onSynced={() => setProgressVersion(version => version + 1)} /></div>}
    </Suspense>
  </AppShell>
}
