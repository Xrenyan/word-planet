import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './app/App'
import { AppErrorBoundary } from './app/components/AppErrorBoundary'
import { registerWordPlanetPwa } from './storage/pwaRegistration'
import './styles/global.css'

registerWordPlanetPwa(registerSW)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary><App /></AppErrorBoundary>
  </StrictMode>,
)
