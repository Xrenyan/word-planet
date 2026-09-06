import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PronunciationControls } from './PronunciationControls'
import type { WordAudioResult } from './audioClient'

const word = {
  id: 'verified-apple', term: 'apple', ipaUk: '/ˈæp.əl/', ipaUs: '/ˈæp.əl/',
}

class BrowserRecorder {
  static latest: BrowserRecorder
  static failStop = false
  state = 'inactive'
  mimeType = 'audio/webm'
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  onerror: ((event: Event) => void) | null = null
  constructor() { BrowserRecorder.latest = this }
  start() { this.state = 'recording' }
  stop() {
    this.state = 'inactive'
    if (BrowserRecorder.failStop) { this.onerror?.(new Event('error')); return }
    this.ondataavailable?.({ data: new Blob(['recorded speech'], { type: this.mimeType }) })
    this.onstop?.()
  }
}

function setupMicrophone(getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream))) {
  BrowserRecorder.failStop = false
  vi.stubGlobal('MediaRecorder', BrowserRecorder)
  vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia } })
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:local-recording')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  return getUserMedia
}

const readyAudio = async (_wordId: string, locale: 'en-GB' | 'en-US'): Promise<WordAudioResult> => ({ status: 'audio', source: 'local', url: `audio/${locale}.mp3` })

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('PronunciationControls', () => {
  it.each(['pending', 'failed'] as const)('uses a prepared UK voice synchronously while US preparation is %s', async (usState) => {
    let finishUk!: (result: WordAudioResult) => void
    let failUs!: (error: Error) => void
    const uk = new Promise<WordAudioResult>(resolve => { finishUk = resolve })
    const us = new Promise<WordAudioResult>((_resolve, reject) => { failUs = reject })
    const loadAudio = vi.fn((_id: string, locale: 'en-GB' | 'en-US') => locale === 'en-GB' ? uk : us)
    const playUrl = vi.fn(async () => undefined)
    render(<PronunciationControls word={word} loadAudio={loadAudio} playUrl={playUrl} />)
    await act(async () => {
      finishUk({ status: 'audio', source: 'local', url: 'uk-ready.mp3' })
      if (usState === 'failed') failUs(new Error('US network unavailable'))
    })
    fireEvent.click(screen.getByRole('button', { name: '播放英式发音' }))
    expect(playUrl).toHaveBeenCalledWith('uk-ready.mp3', expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(loadAudio).toHaveBeenCalledTimes(2)
    expect(await screen.findByText('英式发音播放完成')).toBeVisible()
  })
  it('passes the selected slow rate to real audio playback', async () => {
    const playUrl = vi.fn(async () => undefined)
    render(<PronunciationControls word={word} loadAudio={readyAudio} playUrl={playUrl} />)
    await userEvent.click(screen.getByRole('button', { name: '慢速播放' }))
    await userEvent.click(screen.getByRole('button', { name: '播放英式发音' }))
    expect(playUrl).toHaveBeenCalledWith('audio/en-GB.mp3', expect.objectContaining({ rate: 0.72 }))
  })

  it('does not play a previous word after its delayed audio load resolves', async () => {
    let finish!: (value: WordAudioResult) => void
    const loadAudio = (id: string) => id === word.id ? new Promise<WordAudioResult>(resolve => { finish = resolve }) : readyAudio(id, 'en-US')
    const playUrl = vi.fn(async () => undefined)
    const view = render(<PronunciationControls word={word} loadAudio={loadAudio} playUrl={playUrl} />)
    fireEvent.click(screen.getByRole('button', { name: '播放英式发音' }))
    view.rerender(<PronunciationControls word={{ ...word, id: 'next', term: 'pear' }} loadAudio={loadAudio} playUrl={playUrl} />)
    await act(async () => { finish({ status: 'audio', source: 'local', url: 'old-apple.mp3' }) })
    expect(playUrl).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('releases a microphone permission result that arrives after changing words', async () => {
    let finish!: (stream: MediaStream) => void
    const stop = vi.fn()
    setupMicrophone(vi.fn(() => new Promise<MediaStream>(resolve => { finish = resolve })))
    const view = render(<PronunciationControls word={word} loadAudio={readyAudio} />)
    await userEvent.click(screen.getByRole('button', { name: '开始跟读' }))
    view.rerender(<PronunciationControls word={{ ...word, id: 'next', term: 'pear' }} loadAudio={readyAudio} />)
    await act(async () => { finish({ getTracks: () => [{ stop }] } as unknown as MediaStream) })
    expect(stop).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: '开始跟读' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: '结束跟读' })).not.toBeInTheDocument()
  })

  it('stops device speech when microphone recording starts and prevents overlapping permission requests', async () => {
    let finish!: (stream: MediaStream) => void
    const getUserMedia = setupMicrophone(vi.fn(() => new Promise<MediaStream>(resolve => { finish = resolve })))
    const cancel = vi.fn()
    vi.stubGlobal('speechSynthesis', { cancel })
    render(<PronunciationControls word={word} loadAudio={readyAudio} />)
    await userEvent.click(screen.getByRole('button', { name: '开始跟读' }))
    expect(screen.getByRole('button', { name: '播放英式发音' })).toBeDisabled()
    expect(getUserMedia).toHaveBeenCalledOnce()
    expect(cancel).toHaveBeenCalled()
    await act(async () => { finish({ getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream) })
    expect(screen.getByRole('button', { name: '结束跟读' })).toBeEnabled()
  })

  it('recovers from a native recorder stop error without claiming a replay exists', async () => {
    setupMicrophone()
    render(<PronunciationControls word={word} loadAudio={readyAudio} />)
    await userEvent.click(screen.getByRole('button', { name: '开始跟读' }))
    BrowserRecorder.failStop = true
    await userEvent.click(screen.getByRole('button', { name: '结束跟读' }))
    expect(await screen.findByRole('button', { name: '开始跟读' })).toBeEnabled()
    expect(screen.getByText(/录音未能保存/)).toBeVisible()
    expect(screen.queryByLabelText('本次跟读回放')).not.toBeInTheDocument()
  })

  it('pauses a recorded replay before model pronunciation and releases it on word change', async () => {
    setupMicrophone()
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    const playUrl = vi.fn(async () => undefined)
    const view = render(<PronunciationControls word={word} loadAudio={readyAudio} playUrl={playUrl} />)
    await userEvent.click(screen.getByRole('button', { name: '开始跟读' }))
    await userEvent.click(screen.getByRole('button', { name: '结束跟读' }))
    const replay = await screen.findByLabelText('本次跟读回放')
    expect(replay).toHaveAttribute('src', 'blob:local-recording')
    await userEvent.click(screen.getByRole('button', { name: '播放英式发音' }))
    expect(pause).toHaveBeenCalled()
    view.rerender(<PronunciationControls word={{ ...word, id: 'next', term: 'pear' }} loadAudio={readyAudio} playUrl={playUrl} />)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-recording')
    expect(screen.queryByLabelText('本次跟读回放')).not.toBeInTheDocument()
  })

  it('pauses a recording replay when leaving the page', async () => {
    setupMicrophone()
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    const view = render(<PronunciationControls word={word} loadAudio={readyAudio} />)
    await userEvent.click(screen.getByRole('button', { name: '开始跟读' }))
    await userEvent.click(screen.getByRole('button', { name: '结束跟读' }))
    await screen.findByLabelText('本次跟读回放')
    pause.mockClear()
    view.unmount()
    expect(pause).toHaveBeenCalledOnce()
  })
  it('prepares both accents before interaction and announces playback immediately', async () => {
    let finishPlayback!: () => void
    const loadAudio = vi.fn(async (_wordId: string, locale: 'en-GB' | 'en-US') => ({ status: 'audio' as const, source: 'local' as const, url: `blob:${locale}` }))
    const playUrl = vi.fn(() => new Promise<void>((resolve) => { finishPlayback = resolve }))
    render(<PronunciationControls word={word} loadAudio={loadAudio} playUrl={playUrl} />)

    await waitFor(() => expect(loadAudio.mock.calls.map(call => call[1])).toEqual(['en-GB', 'en-US']))
    await userEvent.click(screen.getByRole('button', { name: '播放英式发音' }))
    expect(screen.getByRole('status')).toHaveTextContent('英式发音正在播放')
    finishPlayback()
    expect(await screen.findByText('英式发音播放完成')).toBeVisible()
  })

  it('does not claim a fallback voice works before it is played', async () => {
    const loadAudio = vi.fn(async (_wordId: string, locale: 'en-GB' | 'en-US') => ({ status: 'device-fallback' as const, locale, reason: 'provider-not-configured' }))
    render(<PronunciationControls word={word} loadAudio={loadAudio} />)

    await waitFor(() => expect(loadAudio).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('waits for an actual click then immediately announces pending playback', async () => {
    let resolve!: (value: WordAudioResult) => void
    const loadAudio = vi.fn(() => new Promise<WordAudioResult>((done) => { resolve = done }))
    const deviceSpeak = vi.fn(async () => ({ status: 'spoken' as const, accent: 'en-GB' as const, rate: .86 }))
    render(<PronunciationControls word={word} loadAudio={loadAudio} deviceSpeak={deviceSpeak} />)
    const button = screen.getByRole('button', { name: '播放英式发音' })

    fireEvent.pointerDown(button)
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    fireEvent.click(button)
    expect(screen.getByRole('status')).toHaveTextContent('正在准备英式发音')
    resolve({ status: 'device-fallback', locale: 'en-GB', reason: 'provider-not-configured' })

    expect(await screen.findByText('英式发音播放完成')).toBeVisible()
    expect(deviceSpeak).toHaveBeenCalledWith('apple', 'en-GB', .86)
  })

  it('keeps UK and US controls mapped to their exact locales', async () => {
    const user = userEvent.setup()
    const loadAudio = vi.fn(async (_wordId: string, locale: 'en-GB' | 'en-US') => ({ status: 'device-fallback' as const, locale, reason: 'provider-not-configured' }))
    const deviceSpeak = vi.fn(async (_term: string, accent: 'en-GB' | 'en-US', rate: number) => ({ status: 'spoken' as const, accent, rate }))
    render(<PronunciationControls word={word} loadAudio={loadAudio} deviceSpeak={deviceSpeak} />)

    await user.click(screen.getByRole('button', { name: '播放英式发音' }))
    await user.click(screen.getByRole('button', { name: '播放美式发音' }))

    expect(loadAudio.mock.calls.map((call) => call[1])).toEqual(['en-GB', 'en-US'])
    expect(deviceSpeak.mock.calls.map((call) => call[1])).toEqual(['en-GB', 'en-US'])
  })
})
