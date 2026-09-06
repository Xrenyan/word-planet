import { ArrowLeft, ArrowRight, ShieldCheck, SpeakerHigh, Star } from '@phosphor-icons/react'
import { FormEvent, useEffect, useId, useMemo, useReducer, useRef } from 'react'
import { WordArtwork } from '../learning/WordArtwork'
import { loadWordAudio } from '../features/pronunciation/audioClient'
import { playAudioUrl } from '../features/pronunciation/playback'
import { createSpeechController, speechRates, type SpeechDependencies, type SpeechResult } from '../pronunciation/speech'
import type { Accent } from '../pronunciation/voiceCatalog'
import type { GameAttempt, GameCompletionCallbacks, GameWord } from './engine'
import { createGuardianStages, type GuardianStage } from './guardianEngine'

type PlanetGuardianGameProps = GameCompletionCallbacks & { words: readonly GameWord[]; seed?: number; onAttempt?: (attempt: GameAttempt) => void; onReviewMiss?: (word: GameWord) => void; onReturnToLearning: () => void; onBackToHub: () => void; speechDependencies?: SpeechDependencies; audioLoader?: typeof loadWordAudio; audioPlayer?: typeof playAudioUrl }
type StageOutcome = 'pending' | 'solved-after-miss' | 'solved-first-try' | 'solved-with-help'
type GuardianState = Readonly<{ stageIndex: number; outcomes: Readonly<Record<string, StageOutcome>>; missedStageIds: readonly string[]; helpedStageIds: readonly string[]; feedback: string; answer: string; finished: boolean; fallbackAccent: Accent | null }>
type GuardianAction =
  | { type: 'miss'; stageId: string; message: string }
  | { type: 'solve'; stageId: string }
  | { type: 'advance'; stageId: string; stageCount: number }
  | { type: 'answer'; stageId: string; value: string }
  | { type: 'feedback'; stageId: string; message: string }
  | { type: 'speech-pending'; stageId: string; message: string }
  | { type: 'speech-result'; stageId: string; message: string; fallbackAccent: Accent | null }
const stageNames = ['看图', '听音', '拼写'] as const

function initialState(stages: readonly GuardianStage[]): GuardianState { return { stageIndex: 0, outcomes: Object.freeze(Object.fromEntries(stages.map((stage) => [stage.id, 'pending' as const]))), missedStageIds: Object.freeze([]), helpedStageIds: Object.freeze([]), feedback: '', answer: '', finished: false, fallbackAccent: null } }
function guardianReducer(stages: readonly GuardianStage[], state: GuardianState, action: GuardianAction): GuardianState {
  const stage = stages[state.stageIndex]
  if (!stage || action.stageId !== stage.id || state.finished) return state
  const outcome = state.outcomes[stage.id]
  if (action.type === 'miss') {
    if (outcome !== 'pending') return state
    return { ...state, missedStageIds: state.missedStageIds.includes(stage.id) ? state.missedStageIds : Object.freeze([...state.missedStageIds, stage.id]), feedback: action.message }
  }
  if (action.type === 'solve') {
    if (outcome !== 'pending') return state
    const nextOutcome: StageOutcome = state.helpedStageIds.includes(stage.id) ? 'solved-with-help' : state.missedStageIds.includes(stage.id) ? 'solved-after-miss' : 'solved-first-try'
    const outcomes = { ...state.outcomes, [stage.id]: nextOutcome }
    return { ...state, outcomes: Object.freeze(outcomes), feedback: '这一层点亮啦！', fallbackAccent: null }
  }
  if (action.type === 'advance') {
    if (outcome === 'pending') return state
    if (state.stageIndex + 1 >= action.stageCount) return { ...state, finished: true }
    return { ...state, stageIndex: state.stageIndex + 1, feedback: '', answer: '', fallbackAccent: null }
  }
  if (action.type === 'answer') return outcome === 'pending' ? { ...state, answer: action.value, feedback: '' } : state
  if (action.type === 'feedback') return outcome === 'pending' ? { ...state, feedback: action.message } : state
  if (outcome !== 'pending') return state
  if (action.type === 'speech-pending') return { ...state, feedback: action.message, fallbackAccent: null }
  const helpedStageIds = action.fallbackAccent && !state.helpedStageIds.includes(stage.id) ? Object.freeze([...state.helpedStageIds, stage.id]) : state.helpedStageIds
  return { ...state, feedback: action.message, fallbackAccent: action.fallbackAccent, helpedStageIds }
}
function normalizeSpelling(value: string) { return value.trim().toLocaleLowerCase('en-US') }
function speechMessage(result: SpeechResult) {
  switch (result.status) {
    case 'spoken': return result.rate === speechRates.slow ? '慢速发音播放完成。' : '发音播放完成。'
    case 'unavailable': return result.accent === 'en-GB' ? '英式发音暂时播不了，看看下方提示吧。' : '美式发音暂时播不了，看看下方提示吧。'
    case 'unsupported': return '暂时播不了声音，看看下方提示吧。'
    case 'invalid-term': return '这个单词暂时不能播放。'
    case 'invalid-rate': return '暂时播不了，请再试一次。'
    case 'cancelled': return '正在切换发音…'
    case 'error': return '暂时播不了声音，看看下方提示吧。'
  }
}
function audioMessage(accent: Accent) {
  const accentLabel = accent === 'en-GB' ? '英式' : '美式'
  return `${accentLabel}发音播放完成。`
}
function sourceWord(stage: GuardianStage) { return stage.round.sourceWords.find((word) => word.id === stage.round.target.id)! }
function outcomeLabel(index: number, outcome: StageOutcome, current: boolean) {
  if (outcome === 'solved-first-try') return `${stageNames[index]}：首次答对`
  if (outcome === 'solved-after-miss') return `${stageNames[index]}：再次尝试后完成`
  if (outcome === 'solved-with-help') return `${stageNames[index]}：借助提示完成`
  return `${stageNames[index]}：${current ? '当前挑战' : '等待开始'}`
}

export function PlanetGuardianGame({ words, seed = 20260822, ...props }: PlanetGuardianGameProps) {
  const stages = createGuardianStages(words, seed)
  return <PlanetGuardianSession key={JSON.stringify(stages)} stages={stages} {...props} />
}

function PlanetGuardianSession({ stages, onAttempt, onReviewMiss, onReturnToLearning, onBackToHub, onComplete, onReplay, onNextChallenge, speechDependencies = {}, audioLoader = loadWordAudio, audioPlayer = playAudioUrl }: Omit<PlanetGuardianGameProps, 'words' | 'seed'> & { stages: readonly GuardianStage[] }) {
  const [state, dispatch] = useReducer((current: GuardianState, action: GuardianAction) => guardianReducer(stages, current, action), stages, initialState)
  const reactId = useId(), titleId = `guardian-game-title-${reactId}`, inputId = `guardian-spelling-answer-${reactId}`
  const titleRef = useRef<HTMLHeadingElement>(null), inputRef = useRef<HTMLInputElement>(null), nextRef = useRef<HTMLButtonElement>(null)
  const requestGenerationRef = useRef(0), solveLockRef = useRef(false), advanceLockRef = useRef(false), reportedWordIdsRef = useRef(new Set<string>())
  const playbackRef = useRef<AbortController | null>(null)
  const completionReportedRef = useRef(false)
  const stage = stages[state.stageIndex], targetWord = sourceWord(stage), solved = state.outcomes[stage.id] !== 'pending'
  const firstTryCount = Object.values(state.outcomes).filter((outcome) => outcome === 'solved-first-try').length
  useEffect(() => {
    if (!state.finished || completionReportedRef.current || !onComplete) return
    completionReportedRef.current = true
    onComplete({ completedRounds: Object.values(state.outcomes).filter(outcome => outcome !== 'pending').length, totalRounds: stages.length, firstTryCorrect: firstTryCount, usedHelp: state.helpedStageIds.length > 0 })
  }, [state.finished, state.outcomes, state.helpedStageIds, stages.length, firstTryCount, onComplete])
  const speechController = useMemo(() => createSpeechController(speechDependencies), [speechDependencies.synthesis, speechDependencies.voices, speechDependencies.createUtterance, stage.id])
  const lookAgainWords = useMemo(() => {
    const unique = new Map<string, GameWord>()
    for (const stageId of state.missedStageIds) {
      const word = sourceWord(stages.find((item) => item.id === stageId)!)
      if (!unique.has(word.id)) unique.set(word.id, word)
    }
    return Object.freeze([...unique.values()])
  }, [state.missedStageIds, stages])

  useEffect(() => { requestGenerationRef.current += 1; return () => { requestGenerationRef.current += 1; playbackRef.current?.abort(); speechController.dispose() } }, [speechController])
  useEffect(() => {
    if (audioLoader === loadWordAudio) void Promise.all((['en-GB', 'en-US'] as const).map(accent => audioLoader(targetWord.id, accent, targetWord.term)))
  }, [audioLoader, targetWord.id, targetWord.term])
  useEffect(() => { solveLockRef.current = false; advanceLockRef.current = false; titleRef.current?.focus({ preventScroll: true }) }, [state.stageIndex, state.finished])
  useEffect(() => { if (solved) queueMicrotask(() => nextRef.current?.focus({ preventScroll: true })) }, [solved])

  function recordMiss(message: string) { if (!solveLockRef.current) { onAttempt?.({ wordId: targetWord.id, outcome: 'missed' }); if (!reportedWordIdsRef.current.has(targetWord.id)) { reportedWordIdsRef.current.add(targetWord.id); onReviewMiss?.(targetWord) } dispatch({ type: 'miss', stageId: stage.id, message }) } }
  function markSolved() { if (!solveLockRef.current) { solveLockRef.current = true; onAttempt?.({ wordId: targetWord.id, outcome: 'correct' }); dispatch({ type: 'solve', stageId: stage.id }) } }
  function advance() { if (solved && !advanceLockRef.current) { advanceLockRef.current = true; speechController.dispose(); dispatch({ type: 'advance', stageId: stage.id, stageCount: stages.length }) } }
  async function play(accent: Accent) {
    if (solveLockRef.current || solved) return
    playbackRef.current?.abort()
    const controller = new AbortController()
    playbackRef.current = controller
    const request = ++requestGenerationRef.current
    const useInjectedDeviceSpeech = Object.keys(speechDependencies).length > 0
    dispatch({ type: 'speech-pending', stageId: stage.id, message: `正在准备${accent === 'en-GB' ? '英式' : '美式'}发音…` })
    if (!useInjectedDeviceSpeech) {
      const audio = await audioLoader(targetWord.id, accent, targetWord.term)
      if (request !== requestGenerationRef.current) return
      if (audio.status === 'audio') {
        try {
          await audioPlayer(audio.url, { signal: controller.signal })
          if (request === requestGenerationRef.current) dispatch({ type: 'speech-result', stageId: stage.id, message: audioMessage(accent), fallbackAccent: null })
          return
        } catch {
          if (request !== requestGenerationRef.current) return
        }
      }
    }
    const result = await speechController.speak(targetWord.term, accent, speechRates.normal)
    if (request !== requestGenerationRef.current) return
    dispatch({ type: 'speech-result', stageId: stage.id, message: speechMessage(result), fallbackAccent: result.status !== 'spoken' && result.status !== 'cancelled' ? accent : null })
  }
  function submitSpelling(event: FormEvent) {
    event.preventDefault()
    if (solveLockRef.current || solved) return
    if (!state.answer.trim()) { dispatch({ type: 'feedback', stageId: stage.id, message: '先写下你的答案，再来检查吧。' }); inputRef.current?.focus(); return }
    if (normalizeSpelling(state.answer) !== normalizeSpelling(targetWord.term)) { recordMiss('还差一点，检查有没有漏掉或多写字母吧！'); inputRef.current?.focus(); return }
    markSolved()
  }
  function backToHub() { requestGenerationRef.current += 1; speechController.dispose(); onBackToHub() }

  if (state.finished) return <section className="guardian-game guardian-game--complete" aria-labelledby={titleId}>
    <div className="guardian-game__complete-badge"><ShieldCheck aria-hidden="true" weight="fill" /></div><p className="demo-disclaimer">游戏星岛</p>
    <h2 ref={titleRef} id={titleId} data-route-heading tabIndex={-1}>三层护盾已点亮</h2><p className="guardian-game__result">首次答对 {firstTryCount} / 3 层</p>
    {lookAgainWords.length ? <p>再看看：{lookAgainWords.map((word) => word.term).join('、')}</p> : <p>这一局没有需要再看的词。</p>}
    <p>星球又亮起来啦！再选个游戏，或回去学单词吧。</p><div className="guardian-game__complete-actions">
      {onReplay && <button className="game-back" type="button" onClick={onReplay}>再玩一次</button>}
      {onNextChallenge && <button className="guardian-game__return" type="button" onClick={onNextChallenge}>下一关 <ArrowRight aria-hidden="true" weight="bold" /></button>}
      <button className="game-back" type="button" onClick={backToHub}><ArrowLeft aria-hidden="true" weight="bold" /> 返回游戏中心</button><button className="guardian-game__return" type="button" onClick={onReturnToLearning}>回到学习 <ArrowRight aria-hidden="true" weight="bold" /></button></div>
  </section>

  return <section className="guardian-game" aria-labelledby={titleId}>
    <header className="guardian-game__header"><div><button className="game-back" type="button" onClick={backToHub}><ArrowLeft aria-hidden="true" weight="bold" /> 返回游戏中心</button><p className="demo-disclaimer">游戏星岛</p><h2 ref={titleRef} id={titleId} data-route-heading tabIndex={-1}>守护星球</h2><p>点亮三层星球护盾，完成看图、听音和拼写挑战。</p></div><ShieldCheck aria-hidden="true" weight="duotone" /></header>
    <div className="guardian-game__progress" aria-label={`护盾进度，第 ${state.stageIndex + 1} 层，共 3 层`}><strong>第 {state.stageIndex + 1} / 3 层</strong><ol aria-label="各层护盾状态">{stages.map((item, index) => { const label = outcomeLabel(index, state.outcomes[item.id], index === state.stageIndex); return <li key={item.id} data-outcome={state.outcomes[item.id]} data-current={index === state.stageIndex}><span className="visually-hidden">{label}</span><ShieldCheck aria-hidden="true" weight={state.outcomes[item.id] === 'pending' ? 'regular' : 'fill'} /></li> })}</ol></div>
    {stage.mode === 'picture-choice' && <div className="guardian-game__stage guardian-game__stage--picture"><figure data-testid="guardian-picture-target" data-word-id={stage.round.target.id}><WordArtwork priority revealTerm={false} wordId={stage.round.target.id} meaningZh={stage.round.target.meaningZh} image={stage.round.target.image} term={stage.round.target.term} /><figcaption>选择与“{stage.round.target.meaningZh}”对应的英文</figcaption></figure><div className="guardian-game__choices" aria-label="看图选择英文">{stage.round.choices.map((choice) => <button key={choice.id} type="button" data-word-id={choice.id} disabled={solved} onClick={() => choice.id === stage.round.target.id ? markSolved() : recordMiss('再看看图片和中文提示，试一次吧！')}>{choice.term}</button>)}</div></div>}
    {stage.mode === 'audio-choice' && <div className="guardian-game__stage guardian-game__stage--audio" data-testid="guardian-audio-target" data-word-id={stage.round.target.id}><div className="guardian-game__audio-panel"><SpeakerHigh aria-hidden="true" weight="duotone" /><h3>听一听，选择对应的中文</h3><div className="guardian-game__audio-actions"><button type="button" disabled={solved} onClick={() => play('en-GB')} aria-label="播放守护关英式发音">英式发音</button><button type="button" disabled={solved} onClick={() => play('en-US')} aria-label="播放守护关美式发音">美式发音</button></div>{state.fallbackAccent && <p className="guardian-game__fallback">无声提示（{state.fallbackAccent === 'en-GB' ? '英式' : '美式'}）：{state.fallbackAccent === 'en-GB' ? `英 ${targetWord.ipaUk}` : `美 ${targetWord.ipaUs}`} · {targetWord.meaningZh}</p>}</div><div className="guardian-game__choices" aria-label="听音选择中文">{stage.round.choices.map((choice) => <button key={choice.id} type="button" data-word-id={choice.id} aria-label={`选择中文：${choice.meaningZh}`} disabled={solved} onClick={() => choice.id === stage.round.target.id ? markSolved() : recordMiss('再听一次，或者使用无声提示继续吧！')}>{choice.meaningZh}</button>)}</div></div>}
    {stage.mode === 'spelling' && <div className="guardian-game__stage guardian-game__stage--spelling" data-testid="guardian-spelling-stage"><div className="guardian-game__spelling-cue"><h3>根据中文写英文</h3><p>{stage.round.target.meaningZh}</p></div><form onSubmit={submitSpelling}><label htmlFor={inputId}>输入守护词英文</label><input ref={inputRef} id={inputId} value={state.answer} autoComplete="off" spellCheck={false} disabled={solved} onChange={(event) => dispatch({ type: 'answer', stageId: stage.id, value: event.target.value })} /><button type="submit" disabled={solved}>检查守护拼写</button></form></div>}
    {state.feedback && <p className="guardian-game__feedback" role="status" aria-live="polite">{state.feedback}</p>}
    {solved && <button ref={nextRef} className="guardian-game__next" type="button" onClick={advance}>{state.stageIndex + 1 === stages.length ? '查看守护结果' : '点亮下一层'} <ArrowRight aria-hidden="true" weight="bold" /></button>}
    <ol className="guardian-game__stars" aria-label={`本局首次答对 ${firstTryCount} 层`}>{stages.map((item, index) => <li key={item.id}><span className="visually-hidden">{`星标·${outcomeLabel(index, state.outcomes[item.id], index === state.stageIndex)}`}</span><Star aria-hidden="true" weight={state.outcomes[item.id] === 'solved-first-try' ? 'fill' : 'regular'} /></li>)}</ol>
    <p className="guardian-game__note">一层一层来，答错了也能再试一次。</p>
  </section>
}
