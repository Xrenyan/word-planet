type AudioLike = Pick<HTMLAudioElement, 'addEventListener' | 'removeEventListener' | 'play'>

export function playAudioUrl(
  url: string,
  dependencies: { createAudio?: (url: string) => AudioLike } = {},
) {
  const audio = (dependencies.createAudio ?? ((source) => new Audio(source)))(url)
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('error', onError)
    }
    const onEnded = () => { cleanup(); resolve() }
    const onError = () => { cleanup(); reject(new Error('Audio playback failed')) }
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('error', onError)
    void audio.play().catch(onError)
  })
}
