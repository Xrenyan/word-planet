import { Microphone, PauseCircle, SpeakerHigh } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { createRecorder, type LocalRecorder, type MediaRecorderLike, type RecorderDependencies } from '../../pronunciation/recorder'
import { speakWord, type SpeechResult } from '../../pronunciation/speech'
import type { Accent } from '../../pronunciation/voiceCatalog'
import { Pressable } from '../../ui/Pressable'
import { assessWordPronunciation, loadWordAudio, type WordAudioResult } from './audioClient'
import { playAudioUrl } from './playback'

type Pronounceable = { id: string; term: string; ipaUk: string; ipaUs: string; ipaStatus?: 'official' | 'public-source' | 'dictionary-api' | 'unavailable' }
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
}: {
  word: Pronounceable
  loadAudio?: LoadAudio
  deviceSpeak?: DeviceSpeak
  playUrl?: (url: string) => Promise<void>
}) {
  const [audioMessage, setAudioMessage] = useState('选择英式或美式发音')
  const [activeAccent, setActiveAccent] = useState<Accent | null>(null)
  const [preparedAudio, setPreparedAudio] = useState<Partial<Record<Accent, WordAudioResult>>>({})
  const [recordingMessage, setRecordingMessage] = useState('录音只保留在当前页面，可回放跟读；本站不会生成虚假分数。')
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [assessment, setAssessment] = useState<Awaited<ReturnType<typeof assessWordPronunciation>> | null>(null)
  const recorderRef = useRef<LocalRecorder | null>(null)
  const audioInteractionRef = useRef(false)

  useEffect(() => () => recorderRef.current?.dispose(), [])

  useEffect(() => {
    let active = true
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
    return () => { active = false }
  }, [loadAudio, word.id])

  async function play(locale: Accent) {
    audioInteractionRef.current = true
    setActiveAccent(locale)
    const accentLabel = label(locale)
    try {
      const result = preparedAudio[locale] ?? await loadAudio(word.id, locale, word.term)
      if (result.status === 'audio') {
        setAudioMessage(`${accentLabel}发音正在播放`)
        await playUrl(result.url)
        const sourceLabel = result.source === 'cache' ? '缓存' : result.source === 'local' ? '本地' : '云端'
        setAudioMessage(`${accentLabel}${sourceLabel}发音播放完成`)
        return
      }
      if (result.status === 'device-fallback') {
        setAudioMessage(`${accentLabel}发音正在播放`)
        const speaking = deviceSpeak(word.term, locale, .86)
        const spoken = await speaking
        setAudioMessage(spoken.status === 'spoken' ? `${accentLabel}设备语音播放完成` : `${accentLabel}语音暂不可用，请检查系统语音设置`)
        return
      }
      setAudioMessage(`${accentLabel}语音暂不可用`)
    } catch {
      setAudioMessage(`${accentLabel}语音暂不可用`)
    } finally {
      setActiveAccent(null)
    }
  }

  async function startRecording() {
    setAssessment(null)
    setRecordingMessage('正在请求麦克风权限…')
    const mediaDevices = navigator.mediaDevices
    if (!mediaDevices?.getUserMedia) {
      setRecordingMessage('此设备暂不支持录音；发音播放仍可使用。')
      return
    }
    try {
      const stream = await mediaDevices.getUserMedia({ audio: true })
      const dependencies = recorderDependencies()
      if (!dependencies) {
        stream.getTracks().forEach((track) => track.stop())
        setRecordingMessage('此浏览器暂不支持本地录音。')
        return
      }
      recorderRef.current?.dispose()
      const recorder = createRecorder(stream, dependencies)
      recorderRef.current = recorder
      if (!recorder.start()) {
        setRecordingMessage('录音没有开始成功，可以再试一次。')
        return
      }
      setRecording(true)
      setRecordingMessage('正在录音，读完后点“结束跟读”。')
    } catch {
      setRecordingMessage('麦克风未授权或暂不可用；发音播放仍可使用。')
    }
  }

  async function stopRecording() {
    const result = await recorderRef.current?.stop()
    setRecording(false)
    if (!result) {
      setRecordingMessage('没有录到声音，可以再试一次。')
      return
    }
    setRecordingUrl(result.url)
    setRecordingMessage('录音已保留在当前页面，可以立即回放对照。')
    try {
      const assessed = await assessWordPronunciation(word.id, 'en-GB', result.blob)
      setAssessment(assessed)
      setRecordingMessage(assessed.status === 'assessed' ? '真实评测完成。' : '本站不提供云端评分；请回放录音自行对照。')
    } catch {
      setRecordingMessage('本站不提供云端评分；请回放录音自行对照。')
    }
  }

  return (
    <section className="pronunciation-controls" aria-label="发音与跟读">
      <div className="pronunciation-controls__ipa">
        {word.ipaStatus === 'dictionary-api' || word.ipaStatus === 'unavailable'
          ? <span>参考 IPA <b>{word.ipaStatus === 'unavailable' ? '音标待核' : word.ipaUs}</b></span>
          : <><span>英 <b className="today-dashboard__ipa--uk">{word.ipaUk}</b></span><span>美 <b className="today-dashboard__ipa--us">{word.ipaUs}</b></span></>}
      </div>
      <div className="pronunciation-controls__actions">
        {(['en-GB', 'en-US'] as const).map((locale) => (
          <Pressable
            key={locale}
            className="audio-action"
            aria-label={`播放${label(locale)}发音`}
            disabled={activeAccent !== null}
            onPointerDown={() => { audioInteractionRef.current = true; setAudioMessage(`正在准备${label(locale)}发音`) }}
            onClick={() => void play(locale)}
          >
            <SpeakerHigh aria-hidden="true" weight="fill" />{activeAccent === locale ? '播放中' : `${label(locale)}发音`}
          </Pressable>
        ))}
      </div>
      <p className="pronunciation-controls__status" role="status">{audioMessage}</p>
      <div className="pronunciation-controls__follow">
        <Pressable className="follow-action" onClick={() => void (recording ? stopRecording() : startRecording())}>
          {recording ? <PauseCircle aria-hidden="true" weight="fill" /> : <Microphone aria-hidden="true" weight="fill" />}
          {recording ? '结束跟读' : '开始跟读'}
        </Pressable>
        <p aria-live="polite">{recordingMessage}</p>
      </div>
      {recordingUrl && <audio controls src={recordingUrl} aria-label="本次跟读回放">你的浏览器暂不支持本地录音回放。</audio>}
      {assessment?.status === 'assessed' && (
        <dl className="pronunciation-controls__scores" aria-label="真实云端跟读评测">
          <div><dt>准确度</dt><dd>{assessment.accuracy}</dd></div>
          <div><dt>流利度</dt><dd>{assessment.fluency}</dd></div>
          <div><dt>完整度</dt><dd>{assessment.completeness}</dd></div>
        </dl>
      )}
    </section>
  )
}
