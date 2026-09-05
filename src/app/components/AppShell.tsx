import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import type { RouteId } from '../routes'
import { Mascot } from './Mascot'
import { Navigation } from './Navigation'

type AppShellProps = {
  activeRoute: RouteId
  children: ReactNode
  onRouteChange?: (route: RouteId) => void
  availableWordCount?: number
}

export function AppShell({ activeRoute, children, onRouteChange, availableWordCount }: AppShellProps) {
  const mainContentRef = useRef<HTMLElement>(null)
  const focusMainContent = () => mainContentRef.current?.focus()

  function handleSkipKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') {
      return
    }

    event.preventDefault()
    focusMainContent()
  }

  return (
    <div className="app-shell" data-route={activeRoute}>
      <button className="skip-link" type="button" onClick={focusMainContent} onKeyDown={handleSkipKeyDown}>
        跳到主要内容
      </button>
      <div className="app-shell__rail">
        <header className="app-shell__brand" aria-label="词星球品牌">
          <Mascot className="app-shell__brand-mark" />
          <h1>词星球</h1>
        </header>
        <Navigation activeRoute={activeRoute} onNavigate={onRouteChange} />
        <div className="app-shell__mascot-container">
          <Mascot className="app-shell__mascot" decorative />
        </div>
      </div>
      <main className="app-shell__main" id="main-content" ref={mainContentRef} tabIndex={-1}>
        {children}
      </main>
      <aside className="app-shell__secondary" aria-label="学习结构">
        <section className="learner-profile" aria-labelledby="learner-name">
          <Mascot className="learner-profile__avatar" decorative />
          <div>
            <h2 id="learner-name">小星同学</h2>
            <p>你的英语学习伙伴</p>
          </div>
        </section>
        <section className="progress-orbit" aria-labelledby="progress-title">
          <h2 id="progress-title">我的单词库</h2>
          <div className="progress-orbit__ring" role="img" aria-label={availableWordCount ? `共有 ${availableWordCount} 个单词` : '正在准备单词'}>
            <strong>{availableWordCount ?? '—'}</strong>
            <span>个单词</span>
          </div>
          <p>三到六年级 · 跟着课本学</p>
        </section>
        <section className="streak-panel" aria-labelledby="streak-title">
          <h2 id="streak-title">词宝小贴士</h2>
          <strong>听一听，读一读</strong>
          <p>先认识单词，再试着不看答案拼出来。记不牢的词，去错词本再练练。</p>
        </section>
      </aside>
    </div>
  )
}
