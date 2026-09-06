type AudioLike = Pick<HTMLAudioElement, 'addEventListener' | 'removeEventListener' | 'play'> & Partial<Pick<HTMLAudioElement, 'pause' | 'currentTime' | 'playbackRate' | 'preload' | 'removeAttribute' | 'ended'>>
let stopCurrent: (() => void) | undefined
let activeAudio: AudioLike | undefined
type PreparedAudio = { audio: AudioLike; objectUrl?: string }
const prepared = new Map<string, PreparedAudio>()
const MAX_PREPARED_PLAYERS = 12

function releasePrepared(entry: PreparedAudio) {
  entry.audio.pause?.()
  entry.audio.removeAttribute?.('src')
  if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl)
}

/** Start the native media preparation from bytes already fetched by preloading. */
export function prepareAudioUrl(url: string, data?: ArrayBuffer) {
  const cached = prepared.get(url)
  if (cached) { prepared.delete(url); prepared.set(url, cached); return }
  if (typeof Audio !== 'function') return
  let objectUrl: string | undefined
  try {
    if (data && typeof URL.createObjectURL === 'function') objectUrl = URL.createObjectURL(new Blob([data], { type: 'audio/mpeg' }))
    const audio = new Audio(objectUrl ?? url)
    audio.preload = 'auto'
    prepared.set(url, { audio, objectUrl })
    for (const [oldUrl, entry] of prepared) {
      if (prepared.size <= MAX_PREPARED_PLAYERS) break
      if (entry.audio === activeAudio) continue
      prepared.delete(oldUrl)
      releasePrepared(entry)
    }
  } catch {
    // Native URL playback remains usable if this browser cannot prewarm blobs.
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
}

export function clearPreparedAudio() {
  stopAudioPlayback()
  for (const entry of prepared.values()) releasePrepared(entry)
  prepared.clear()
}

export function stopAudioPlayback() { stopCurrent?.() }

export function playAudioUrl(
  url: string,
  dependencies: { createAudio?: (url: string) => AudioLike; signal?: AbortSignal; timeoutMs?: number; rate?: number } = {},
) {
  stopAudioPlayback()
  if (dependencies.signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'))
  const cached = dependencies.createAudio ? undefined : prepared.get(url)
  if (cached) { prepared.delete(url); prepared.set(url, cached) }
  const audio = dependencies.createAudio?.(url) ?? cached?.audio ?? new Audio(url)
  try { audio.currentTime = 0 } catch { /* A newly loading media element already starts at zero. */ }
  audio.playbackRate = dependencies.rate ?? 1
  activeAudio = audio
  return new Promise<void>((resolve, reject) => {
    let settled = false
    const cleanup = () => {
      clearTimeout(timeout)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('error', onError)
      dependencies.signal?.removeEventListener('abort', cancel)
      if (stopCurrent === cancel) stopCurrent = undefined
      if (activeAudio === audio) activeAudio = undefined
    }
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      cleanup()
      if (error) {
        const failed = prepared.get(url)
        if (error.name !== 'AbortError' && failed?.audio === audio) {
          prepared.delete(url)
          releasePrepared(failed)
        } else audio.pause?.()
        reject(error)
      } else resolve()
    }
    const onEnded = () => { if (audio.ended !== false) finish() }
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
