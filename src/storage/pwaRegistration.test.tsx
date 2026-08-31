import { describe, expect, it, vi } from 'vitest'

import { registerWordPlanetPwa, type ServiceWorkerRegister } from './pwaRegistration'

describe('PWA update registration', () => {
  it('activates a waiting service worker immediately so clients cannot remain on a stale release', () => {
    const updateServiceWorker = vi.fn(async () => undefined)
    let options: Parameters<ServiceWorkerRegister>[0] | undefined
    const register: ServiceWorkerRegister = (received) => { options = received; return updateServiceWorker }

    registerWordPlanetPwa(register)
    options?.onNeedRefresh?.()

    expect(updateServiceWorker).toHaveBeenCalledWith(true)
  })
})
