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
    <div className="app-shell">
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
            <p>{availableWordCount ? '三到六年级 · 八册已连接' : '正在连接教材词表'}</p>
          </div>
        </section>
        <section className="progress-orbit" aria-labelledby="progress-title">
          <h2 id="progress-title">可学习词表</h2>
          <div className="progress-orbit__ring" role="img" aria-label={availableWordCount ? `已接入 ${availableWordCount} 个公开来源匹配词` : '正在读取可学习词表'}>
            <strong>{availableWordCount ?? '—'}</strong>
            <span>来源匹配词</span>
          </div>
          <p>每个词保留来源状态，不冒充出版社逐词核验</p>
        </section>
        <section className="streak-panel" aria-labelledby="streak-title">
          <h2 id="streak-title">学习记录</h2>
          <strong>保存在此设备</strong>
          <p>练习和游戏的真实作答会在本机整理成复习计划</p>
        </section>
      </aside>
    </div>
  )
}
