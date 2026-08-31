import { describe, expect, it, vi } from 'vitest'
import { playAudioUrl } from './playback'

describe('playAudioUrl', () => {
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
