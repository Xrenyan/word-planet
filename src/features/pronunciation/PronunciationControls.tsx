import { Microphone, PauseCircle, SpeakerHigh } from '@phosphor-icons/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createRecorder, type LocalRecorder, type MediaRecorderLike, type RecorderDependencies } from '../../pronunciation/recorder'
import { disposeSharedSpeechController, speakWord, type SpeechResult } from '../../pronunciation/speech'
import type { Accent } from '../../pronunciation/voiceCatalog'
import { Pressable } from '../../ui/Pressable'
import { loadWordAudio, type WordAudioResult } from './audioClient'
import { playAudioUrl, stopAudioPlayback } from './playback'

type Pronounceable = { id: string; term: string; ipaUk: string; ipaUs: string; ipaCommon?: string; ipaSource?: string; ipaNote?: string; ipaStatus?: 'official' | 'public-source' | 'dictionary-api' | 'unavailable' }
type LoadAudio = (wordId: string, locale: Accent, term?: string) => Promise<WordAudioResult>
type DeviceSpeak = (term: string, accent: Accent, rate: number) => Promise<SpeechResult>

function recorderDependencies(): RecorderDependencies | null {
  if (typeof window.MediaRecorder !== 'function' || typeof URL.createObjectURL !== 'function') return null
  return {
    MediaRecorder: window.MediaRecorder as unknown as new (stream: MediaStream) => MediaRecorderLike,
    Blob,
    createObjectURL: URL.createObjectURL,
    revokeObjectURL: URL.revokeObjectURL,
  }
}

function label(locale: Accent) { return locale === 'en-GB' ? '英式' : '美式' }

export function PronunciationControls({
  word,
  loadAudio = loadWordAudio,
  deviceSpeak = speakWord,
  playUrl = playAudioUrl,
  showIpa = true,
  showRecorder = true,
}: {
  word: Pronounceable
  loadAudio?: LoadAudio
  deviceSpeak?: DeviceSpeak
  playUrl?: typeof playAudioUrl
  showIpa?: boolean
  showRecorder?: boolean
}) {
  const [audioMessage, setAudioMessage] = useState('')
  const [activeAccent, setActiveAccent] = useState<Accent | null>(null)
  const [preparedAudio, setPreparedAudio] = useState<Partial<Record<Accent, WordAudioResult>>>({})
  const [recordingMessage, setRecordingMessage] = useState('听一遍，再读一遍。')
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [recordingPending, setRecordingPending] = useState(false)
  const [slow, setSlow] = useState(false)
  const recorderRef = useRef<LocalRecorder | null>(null)
  const replayRef = useRef<HTMLAudioElement | null>(null)
  const attachReplay = useCallback((element: HTMLAudioElement | null) => {
    if (!element) replayRef.current?.pause()
    replayRef.current = element
  }, [])
  const playbackRef = useRef<AbortController | null>(null)
  const generation = useRef(0)
  const recordingRequest = useRef(false)

  useEffect(() => {
    let active = true
    generation.current += 1
    setActiveAccent(null)
    setRecording(false)
    setRecordingUrl(null)
    setRecordingPending(false)
    recordingRequest.current = false
    setRecordingMessage('听一遍，再读一遍。')
    setPreparedAudio({})
    setAudioMessage('')
    void Promise.all((['en-GB', 'en-US'] as const).map(async (locale) => [locale, await loadAudio(word.id, locale, word.term)] as const))
      .then((entries) => {
        if (!active) return
        setPreparedAudio(Object.fromEntries(entries))
      })
      .catch(() => { /* The play action retries and reports any failure. */ })
    return () => {
      active = false
      generation.current += 1
      playbackRef.current?.abort()
      disposeSharedSpeechController()
      replayRef.current?.pause()
      recorderRef.current?.dispose()
      recorderRef.current = null
    }
  }, [loadAudio, word.id, word.term])

  async function play(locale: Accent) {
    if (recording || recordingRequest.current) return
    playbackRef.current?.abort()
    disposeSharedSpeechController()
    replayRef.current?.pause()
    const controller = new AbortController()
    playbackRef.current = controller
    const current = () => !controller.signal.aborted
    setActiveAccent(locale)
    const accentLabel = label(locale)
    setAudioMessage(`正在准备${accentLabel}发音`)
    try {
      const result = preparedAudio[locale] ?? await loadAudio(word.id, locale, word.term)
      if (!current()) return
      if (result.status === 'audio') {
        setAudioMessage(`${accentLabel}发音正在播放`)
        await playUrl(result.url, { signal: controller.signal, rate: slow ? .72 : 1 })
        if (!current()) return
        setAudioMessage(`${accentLabel}发音播放完成`)
        return
      }
      if (result.status === 'device-fallback') {
        setAudioMessage(`${accentLabel}发音正在播放`)
        const speaking = deviceSpeak(word.term, locale, slow ? .72 : .86)
        const spoken = await speaking
        if (!current()) return
        setAudioMessage(spoken.status === 'spoken' ? `${accentLabel}发音播放完成` : `${accentLabel}发音暂时无法播放，请家长检查一下声音设置`)
        return
      }
      setAudioMessage(`${accentLabel}语音暂不可用`)
    } catch {
      if (current()) setAudioMessage(`${accentLabel}语音暂不可用，请重试并检查设备音量`)
    } finally {
      if (current()) setActiveAccent(null)
    }
  }

  async function startRecording() {
    if (recordingRequest.current) return
    const request = generation.current
    recordingRequest.current = true
    setRecordingPending(true)
    playbackRef.current?.abort()
    stopAudioPlayback()
    disposeSharedSpeechController()
    window.speechSynthesis?.cancel()
    replayRef.current?.pause()
    setRecordingUrl(null)
    recorderRef.current?.dispose()
    recorderRef.current = null
    setActiveAccent(null)
    setRecordingMessage('正在请求麦克风权限…')
    const mediaDevices = navigator.mediaDevices
    if (!mediaDevices?.getUserMedia) {
      recordingRequest.current = false
      setRecordingPending(false)
      setRecordingMessage('此设备暂不支持录音；发音播放仍可使用。')
      return
    }
    try {
      const stream = await mediaDevices.getUserMedia({ audio: true })
      if (request !== generation.current) { stream.getTracks().forEach(track => track.stop()); return }
      const dependencies = recorderDependencies()
      if (!dependencies) {
        stream.getTracks().forEach((track) => track.stop())
        setRecordingMessage('此浏览器暂不支持本地录音。')
        return
      }
      const recorder = createRecorder(stream, dependencies)
      recorderRef.current = recorder
      if (!recorder.start()) {
        setRecordingMessage('录音没有开始成功，可以再试一次。')
        return
      }
      setRecording(true)
      setRecordingMessage('正在录音，读完后点“结束跟读”。')
    } catch {
      if (request === generation.current) setRecordingMessage('麦克风未授权或暂不可用；发音播放仍可使用。')
    } finally {
      if (request === generation.current) {
        recordingRequest.current = false
        setRecordingPending(false)
      }
    }
  }

  async function stopRecording() {
    if (recordingRequest.current) return
    const request = generation.current
    recordingRequest.current = true
    setRecordingPending(true)
    try {
      const result = await recorderRef.current?.stop()
      if (request !== generation.current) return
      setRecordingUrl(result?.url ?? null)
      setRecordingMessage(result ? '读好啦！听听自己的声音，再和示范比一比。' : '没有录到声音，可以再试一次。')
    } catch {
      if (request === generation.current) setRecordingMessage('录音未能保存，可以再试一次；发音播放仍可使用。')
    } finally {
      if (request === generation.current) {
        recordingRequest.current = false
        setRecordingPending(false)
        setRecording(false)
      }
    }
  }

  return (
    <section className="pronunciation-controls" aria-label="发音与跟读">
      {showIpa && <div className="pronunciation-controls__ipa">
        {word.ipaStatus === 'dictionary-api' || word.ipaStatus === 'unavailable'
          ? <span>参考音标 <b>{word.ipaStatus === 'unavailable' ? '暂缺' : word.ipaUs}</b></span>
          : <><span>英 <b className="today-dashboard__ipa--uk">{word.ipaUk}</b></span><span>美 <b className="today-dashboard__ipa--us">{word.ipaUs}</b></span>{word.ipaCommon && <span>通用参考 <b>{word.ipaCommon}</b></span>}</>}
      </div>}
      <div className="pronunciation-controls__actions">
        {(['en-GB', 'en-US'] as const).map((locale) => (
          <Pressable
            key={locale}
            className="audio-action"
            aria-label={`播放${label(locale)}发音`}
            disabled={recording || recordingPending}
            onClick={() => void play(locale)}
          >
            <SpeakerHigh aria-hidden="true" weight="fill" />{activeAccent === locale ? '播放中' : `${label(locale)}发音`}
          </Pressable>
        ))}
        <Pressable className="audio-action" aria-label="慢速播放" aria-pressed={slow} disabled={recording || recordingPending} onClick={() => setSlow(value => !value)}>
          {slow ? '慢速 0.72×' : '慢速播放'}
        </Pressable>
      </div>
      <p className="pronunciation-controls__status" role="status">{audioMessage}</p>
      {showRecorder && <div className="pronunciation-controls__follow">
        <Pressable className="follow-action" disabled={recordingPending} onClick={() => void (recording ? stopRecording() : startRecording())}>
          {recording ? <PauseCircle aria-hidden="true" weight="fill" /> : <Microphone aria-hidden="true" weight="fill" />}
          {recording ? '结束跟读' : '开始跟读'}
        </Pressable>
        <p aria-live="polite">{recordingMessage}</p>
      </div>}
      {recordingUrl && <audio key={recordingUrl} ref={attachReplay} controls src={recordingUrl} aria-label="本次跟读回放" onPlay={() => {
        playbackRef.current?.abort()
        stopAudioPlayback()
        disposeSharedSpeechController()
        setActiveAccent(null)
      }}>你的浏览器暂不支持本地录音回放。</audio>}
    </section>
  )
}
