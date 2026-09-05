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
  const [audioMessage, setAudioMessage] = useState('选择英式或美式发音')
  const [activeAccent, setActiveAccent] = useState<Accent | null>(null)
  const [preparedAudio, setPreparedAudio] = useState<Partial<Record<Accent, WordAudioResult>>>({})
  const [recordingMessage, setRecordingMessage] = useState('录音只保留在当前页面，可回放跟读；本站不会生成虚假分数。')
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
  const audioInteractionRef = useRef(false)
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
    setRecordingMessage('录音只保留在当前单词，可回放跟读；本站不会生成虚假分数。')
    audioInteractionRef.current = false
    setPreparedAudio({})
    setAudioMessage('正在预载英式和美式发音…')
    void Promise.all((['en-GB', 'en-US'] as const).map(async (locale) => [locale, await loadAudio(word.id, locale, word.term)] as const))
      .then((entries) => {
        if (!active) return
        setPreparedAudio(Object.fromEntries(entries))
        if (!audioInteractionRef.current) {
          const actualAudioReady = entries.every(([, result]) => result.status === 'audio')
          const deviceOnly = entries.every(([, result]) => result.status === 'device-fallback')
          setAudioMessage(actualAudioReady ? '英式、美式发音已就绪' : deviceOnly ? '点击时检查设备英式或美式语音' : '发音准备完成；部分语音暂不可用')
        }
      })
      .catch(() => {
        if (active && !audioInteractionRef.current) setAudioMessage('设备语音仍可使用')
      })
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
    audioInteractionRef.current = true
    setActiveAccent(locale)
    const accentLabel = label(locale)
    try {
      const result = preparedAudio[locale] ?? await loadAudio(word.id, locale, word.term)
      if (!current()) return
      if (result.status === 'audio') {
        setAudioMessage(`${accentLabel}发音正在播放`)
        await playUrl(result.url, { signal: controller.signal, rate: slow ? .72 : 1 })
        if (!current()) return
        const sourceLabel = result.source === 'cache' ? '缓存' : result.source === 'local' ? '本地' : '云端'
        setAudioMessage(`${accentLabel}${sourceLabel}发音播放完成`)
        return
      }
      if (result.status === 'device-fallback') {
        setAudioMessage(`${accentLabel}发音正在播放`)
        const speaking = deviceSpeak(word.term, locale, slow ? .72 : .86)
        const spoken = await speaking
        if (!current()) return
        setAudioMessage(spoken.status === 'spoken' ? `${accentLabel}设备语音播放完成` : `${accentLabel}语音暂不可用，请检查系统语音设置`)
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
      setRecordingMessage(result ? '录音已保留在当前页面，请立即回放对照；本站不提供云端评分。' : '没有录到声音，可以再试一次。')
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
          ? <span>参考 IPA <b>{word.ipaStatus === 'unavailable' ? '音标待核' : word.ipaUs}</b></span>
          : <><span>英 <b className="today-dashboard__ipa--uk">{word.ipaUk}</b></span><span>美 <b className="today-dashboard__ipa--us">{word.ipaUs}</b></span>{word.ipaCommon && <span>通用参考 <b>{word.ipaCommon}</b></span>}</>}
      </div>}
      {showIpa && word.ipaNote && <details className="pronunciation-source"><summary>音标来源与说明</summary><p>{word.ipaNote}</p><a href={word.ipaSource} target="_blank" rel="noreferrer">查看词典原词条</a></details>}
      <div className="pronunciation-controls__actions">
        {(['en-GB', 'en-US'] as const).map((locale) => (
          <Pressable
            key={locale}
            className="audio-action"
            aria-label={`播放${label(locale)}发音`}
            disabled={recording || recordingPending}
            onPointerDown={() => { audioInteractionRef.current = true; setAudioMessage(`正在准备${label(locale)}发音`) }}
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
      {showIpa && <small className="pronunciation-source">本站英美合成语音 · 非教材原声录音</small>}
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
