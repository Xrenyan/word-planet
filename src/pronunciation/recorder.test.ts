import { describe, expect, it, vi } from 'vitest'

import { createRecorder } from './recorder'

class FakeMediaRecorder {
  static instance: FakeMediaRecorder | null = null
  static autoStop = true
  state = 'inactive'
  mimeType = 'audio/webm'
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  onerror: ((event: Event) => void) | null = null

  constructor(_stream: MediaStream) {
    FakeMediaRecorder.instance = this
  }

  start() {
    this.state = 'recording'
  }

  stop() {
    this.state = 'inactive'
    if (!FakeMediaRecorder.autoStop) {
      return
    }
    this.ondataavailable?.({ data: new Blob(['hello'], { type: this.mimeType }) })
    this.onstop?.()
  }
}

function createStream() {
  const stop = vi.fn()
  return {
    stream: { getTracks: () => [{ stop }] } as unknown as MediaStream,
    stop,
  }
}

describe('createRecorder', () => {
  it('keeps a recording local, replaces old URLs, and releases tracks and URLs on disposal', async () => {
    const { stream, stop } = createStream()
    const createObjectURL = vi.fn()
      .mockReturnValueOnce('blob:first')
      .mockReturnValueOnce('blob:second')
    const revokeObjectURL = vi.fn()
    const recorder = createRecorder(stream, {
      MediaRecorder: FakeMediaRecorder,
      Blob,
      createObjectURL,
      revokeObjectURL,
    })

    expect(recorder.start()).toBe(true)
    const first = await recorder.stop()
    expect(first?.url).toBe('blob:first')
    expect(stop).toHaveBeenCalled()
    expect(recorder.start()).toBe(false)
    expect(await recorder.stop()).toBeNull()

    recorder.dispose()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:first')
    expect(stop).toHaveBeenCalled()
  })

  it('prevents double starts and cleans up tracks after a recorder error', async () => {
    const { stream, stop } = createStream()
    const recorder = createRecorder(stream, {
      MediaRecorder: FakeMediaRecorder,
      Blob,
      createObjectURL: vi.fn(() => 'blob:test'),
      revokeObjectURL: vi.fn(),
    })

    FakeMediaRecorder.autoStop = false
    expect(recorder.start()).toBe(true)
    expect(recorder.start()).toBe(false)
    const stopping = recorder.stop()
    expect(recorder.stop()).toBe(stopping)
    FakeMediaRecorder.instance?.onerror?.(new Event('error'))
    await expect(stopping).rejects.toThrow('recording-error')
    expect(stop).toHaveBeenCalled()
    FakeMediaRecorder.autoStop = true
  })

  it('settles a pending stop exactly once when disposal happens before an async stop event', async () => {
    const { stream } = createStream()
    FakeMediaRecorder.autoStop = false
    const recorder = createRecorder(stream, {
      MediaRecorder: FakeMediaRecorder,
      Blob,
      createObjectURL: vi.fn(() => 'blob:test'),
      revokeObjectURL: vi.fn(),
    })
    recorder.start()
    const pending = recorder.stop()
    recorder.dispose()

    await expect(pending).resolves.toBeNull()
    FakeMediaRecorder.instance?.onstop?.()
    await expect(pending).resolves.toBeNull()
    FakeMediaRecorder.autoStop = true
  })

  it('does not claim an empty recording can be replayed', async () => {
    const { stream } = createStream()
    class EmptyMediaRecorder extends FakeMediaRecorder {
      stop() {
        this.state = 'inactive'
        this.onstop?.()
      }
    }
    const createObjectURL = vi.fn(() => 'blob:empty')
    const recorder = createRecorder(stream, {
      MediaRecorder: EmptyMediaRecorder,
      Blob,
      createObjectURL,
      revokeObjectURL: vi.fn(),
    })
    recorder.start()

    await expect(recorder.stop()).resolves.toBeNull()
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('cleans up an acquired stream when the recorder constructor throws', () => {
    const { stream, stop } = createStream()
    class ThrowingRecorder {
      constructor(_stream: MediaStream) { throw new Error('constructor-failed') }
    }

    expect(() => createRecorder(stream, {
      MediaRecorder: ThrowingRecorder as unknown as new (stream: MediaStream) => FakeMediaRecorder,
      Blob,
      createObjectURL: vi.fn(() => 'blob:test'),
      revokeObjectURL: vi.fn(),
    })).toThrow('constructor-failed')
    expect(stop).toHaveBeenCalledOnce()
  })
})
