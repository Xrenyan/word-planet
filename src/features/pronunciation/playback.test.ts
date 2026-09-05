import { describe, expect, it, vi } from 'vitest'
import { playAudioUrl, stopAudioPlayback } from './playback'

function browserAudio() {
  const events = new EventTarget()
  return {
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    play: vi.fn(async () => undefined),
    pause: vi.fn(),
    playbackRate: 1,
    end: () => events.dispatchEvent(new Event('ended')),
    fail: () => events.dispatchEvent(new Event('error')),
  }
}

describe('playAudioUrl', () => {
  it('pauses and settles the old clip immediately when another pronunciation starts', async () => {
    const previous = browserAudio()
    const next = browserAudio()
    const first = playAudioUrl('old.mp3', { createAudio: () => previous }).catch(error => error.name)
    const second = playAudioUrl('new.mp3', { createAudio: () => next, rate: .72 })
    await expect(first).resolves.toBe('AbortError')
    expect(previous.pause).toHaveBeenCalledOnce()
    expect(next.playbackRate).toBe(.72)
    next.end()
    await second
  })

  it('settles aborted playback and prevents delayed media events from changing its result', async () => {
    const audio = browserAudio()
    const controller = new AbortController()
    const playing = playAudioUrl('old.mp3', { createAudio: () => audio, signal: controller.signal }).catch(error => error.name)
    controller.abort()
    audio.end()
    await expect(playing).resolves.toBe('AbortError')
    expect(audio.pause).toHaveBeenCalledOnce()
  })

  it('reports a loading error and settles media that never emits events at the timeout', async () => {
    const audio = browserAudio()
    const failing = playAudioUrl('broken.mp3', { createAudio: () => audio }).catch(error => error.message)
    audio.fail()
    await expect(failing).resolves.toBe('Audio playback failed')
    vi.useFakeTimers()
    try {
      const stalled = browserAudio()
      const timed = playAudioUrl('stalled.mp3', { createAudio: () => stalled, timeoutMs: 3000 }).catch(error => error.message)
      await vi.advanceTimersByTimeAsync(3000)
      await expect(timed).resolves.toBe('Audio playback failed')
      expect(stalled.pause).toHaveBeenCalledOnce()
    } finally {
      stopAudioPlayback()
      vi.useRealTimers()
    }
  })
  it('does not report completion until the decoded audio reaches its ended event', async () => {
    const listeners: Record<string, (() => void) | undefined> = {}
    const audio = {
      addEventListener: vi.fn((event: string, listener: () => void) => { listeners[event] = listener }),
      removeEventListener: vi.fn(),
      play: vi.fn(async () => undefined),
    }

    let completed = false
    const playing = playAudioUrl('blob:real-wave', { createAudio: () => audio as never }).then(() => { completed = true })
    await Promise.resolve()

    expect(audio.play).toHaveBeenCalledOnce()
    expect(completed).toBe(false)
    listeners.ended?.()
    await playing
    expect(completed).toBe(true)
  })
})
