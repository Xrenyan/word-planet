export type ServiceWorkerRegisterOptions = Readonly<{
  onNeedRefresh?: () => void
  onOfflineReady?: () => void
}>

export type ServiceWorkerRegister = (
  options: ServiceWorkerRegisterOptions,
) => (reloadPage?: boolean) => Promise<void>

export function registerWordPlanetPwa(register: ServiceWorkerRegister) {
  let updateServiceWorker: ReturnType<ServiceWorkerRegister>
  updateServiceWorker = register({
    onNeedRefresh: () => {
      void updateServiceWorker(true)
    },
  })
  return updateServiceWorker
}
