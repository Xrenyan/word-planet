import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PronunciationControls } from './PronunciationControls'
import type { WordAudioResult } from './audioClient'

const word = {
  id: 'verified-apple', term: 'apple', ipaUk: '/ˈæp.əl/', ipaUs: '/ˈæp.əl/',
}

describe('PronunciationControls', () => {
  it('prepares both accents before interaction and announces playback immediately', async () => {
    let finishPlayback!: () => void
    const loadAudio = vi.fn(async (_wordId: string, locale: 'en-GB' | 'en-US') => ({ status: 'audio' as const, source: 'local' as const, url: `blob:${locale}` }))
    const playUrl = vi.fn(() => new Promise<void>((resolve) => { finishPlayback = resolve }))
    render(<PronunciationControls word={word} loadAudio={loadAudio} playUrl={playUrl} />)

    expect(await screen.findByText('英式、美式发音已就绪')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: '播放英式发音' }))
    expect(screen.getByRole('status')).toHaveTextContent('英式发音正在播放')
    finishPlayback()
    expect(await screen.findByText('英式本地发音播放完成')).toBeVisible()
  })

  it('honestly says device voices are checked at click time', async () => {
    const loadAudio = vi.fn(async (_wordId: string, locale: 'en-GB' | 'en-US') => ({ status: 'device-fallback' as const, locale, reason: 'provider-not-configured' }))
    render(<PronunciationControls word={word} loadAudio={loadAudio} />)

    expect(await screen.findByText('点击时检查设备英式或美式语音')).toBeVisible()
    expect(screen.queryByText('英式、美式发音已就绪')).not.toBeInTheDocument()
  })

  it('announces pointerdown immediately while the real audio request is still pending', async () => {
    let resolve!: (value: WordAudioResult) => void
    const loadAudio = vi.fn(() => new Promise<WordAudioResult>((done) => { resolve = done }))
    const deviceSpeak = vi.fn(async () => ({ status: 'spoken' as const, accent: 'en-GB' as const, rate: .86 }))
    render(<PronunciationControls word={word} loadAudio={loadAudio} deviceSpeak={deviceSpeak} />)
    const button = screen.getByRole('button', { name: '播放英式发音' })

    fireEvent.pointerDown(button)
    expect(screen.getByRole('status')).toHaveTextContent('正在准备英式发音')
    fireEvent.click(button)
    resolve({ status: 'device-fallback', locale: 'en-GB', reason: 'provider-not-configured' })

    expect(await screen.findByText('英式设备语音播放完成')).toBeVisible()
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
