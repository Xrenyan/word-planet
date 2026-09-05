type AudioLike = Pick<HTMLAudioElement, 'addEventListener' | 'removeEventListener' | 'play'> & Partial<Pick<HTMLAudioElement, 'pause' | 'currentTime' | 'playbackRate'>>
let stopCurrent: (() => void) | undefined

export function stopAudioPlayback() { stopCurrent?.() }

export function playAudioUrl(
  url: string,
  dependencies: { createAudio?: (url: string) => AudioLike; signal?: AbortSignal; timeoutMs?: number; rate?: number } = {},
) {
  stopAudioPlayback()
  if (dependencies.signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'))
  const audio = (dependencies.createAudio ?? ((source) => new Audio(source)))(url)
  audio.playbackRate = dependencies.rate ?? 1
  return new Promise<void>((resolve, reject) => {
    let settled = false
    const cleanup = () => {
      clearTimeout(timeout)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('error', onError)
      dependencies.signal?.removeEventListener('abort', cancel)
      if (stopCurrent === cancel) stopCurrent = undefined
    }
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      cleanup()
      if (error) { audio.pause?.(); reject(error) } else resolve()
    }
    const onEnded = () => finish()
    const onError = () => finish(new Error('Audio playback failed'))
    const cancel = () => finish(new DOMException('Aborted', 'AbortError'))
    const timeout = setTimeout(onError, dependencies.timeoutMs ?? 20000)
    stopCurrent = cancel
    dependencies.signal?.addEventListener('abort', cancel, { once: true })
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('error', onError)
    try { void audio.play().catch(onError) } catch { onError() }
  })
}
