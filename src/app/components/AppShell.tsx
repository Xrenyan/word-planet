import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import type { RouteId } from '../routes'
import { Mascot } from './Mascot'
import { Navigation } from './Navigation'

type AppShellProps = {
  activeRoute: RouteId
  children: ReactNode
  onRouteChange?: (route: RouteId) => void
}

export function AppShell({ activeRoute, children, onRouteChange }: AppShellProps) {
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
      </div>
      <main className="app-shell__main" id="main-content" ref={mainContentRef} tabIndex={-1}>
        {children}
      </main>
    </div>
  )
}
