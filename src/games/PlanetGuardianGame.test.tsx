import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { demoWords } from '../test/fixtures/gameWords'
import { PlanetGuardianGame } from './PlanetGuardianGame'
import { createGuardianStages } from './guardianEngine'

function targetId(testId: string) {
  return screen.getByTestId(testId).getAttribute('data-word-id')!
}

function choiceByWordId(name: RegExp, wordId: string) {
  return screen.getAllByRole('button', { name }).find((button) => button.getAttribute('data-word-id') === wordId)!
}

describe('PlanetGuardianGame', () => {
  it('exposes per-stage outcomes through semantic list items and real text', () => {
    render(<PlanetGuardianGame words={demoWords} seed={83} onReviewMiss={vi.fn()} onBackToHub={vi.fn()} onReturnToLearning={vi.fn()} speechDependencies={{ synthesis: null }} />)
    const list = screen.getByRole('list', { name: '各层护盾状态' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
    expect(within(list).getByText('看图：当前挑战')).toBeInTheDocument()
    expect(within(list).getByText('听音：等待开始')).toBeInTheDocument()
    expect(within(list).getByText('拼写：等待开始')).toBeInTheDocument()
  })

  it.each(['', '   '])('keeps %j spelling submissions as guidance rather than misses', async (blank) => {
    const user = userEvent.setup()
    const onReviewMiss = vi.fn()
    render(<PlanetGuardianGame words={[demoWords[0]]} seed={0} onReviewMiss={onReviewMiss} onBackToHub={vi.fn()} onReturnToLearning={vi.fn()} speechDependencies={{ synthesis: null }} />)
    await user.click(screen.getByRole('button', { name: demoWords[0].term }))
    await user.click(screen.getByRole('button', { name: '点亮下一层' }))
    await user.click(screen.getByRole('button', { name: `选择中文：${demoWords[0].meaningZh}` }))
    await user.click(screen.getByRole('button', { name: '点亮下一层' }))
    if (blank) await user.type(screen.getByLabelText('输入守护词英文'), blank)
    await user.click(screen.getByRole('button', { name: '检查守护拼写' }))
    await user.click(screen.getByRole('button', { name: '检查守护拼写' }))
    expect(screen.getByRole('status')).toHaveTextContent('先写下你的答案')
    expect(onReviewMiss).not.toHaveBeenCalled()
    await user.type(screen.getByLabelText('输入守护词英文'), demoWords[0].term)
    await user.click(screen.getByRole('button', { name: '检查守护拼写' }))
    expect(within(screen.getByRole('list', { name: '各层护盾状态' })).getByText('拼写：首次答对')).toBeInTheDocument()
    expect(screen.getByLabelText('本局首次答对 3 层')).toBeVisible()
  })

  it('reports and summarizes a nonadjacent repeated target only once per word', async () => {
    const user = userEvent.setup()
    const onReviewMiss = vi.fn()
    const stages = createGuardianStages(demoWords, 0)
    expect(stages[0].round.target.id).toBe(stages[2].round.target.id)
    const repeated = demoWords.find((word) => word.id === stages[0].round.target.id)!
    render(<PlanetGuardianGame words={demoWords} seed={0} onReviewMiss={onReviewMiss} onBackToHub={vi.fn()} onReturnToLearning={vi.fn()} speechDependencies={{ synthesis: null }} />)
    const pictureButtons = screen.getAllByRole('button', { name: /^(planet|cat|dog|sun)$/ })
    await user.click(pictureButtons.find((button) => button.getAttribute('data-word-id') !== repeated.id)!)
    await user.click(pictureButtons.find((button) => button.getAttribute('data-word-id') === repeated.id)!)
    await user.click(screen.getByRole('button', { name: '点亮下一层' }))
    const audioTarget = targetId('guardian-audio-target')
    await user.click(choiceByWordId(/^选择中文：/, audioTarget))
    await user.click(screen.getByRole('button', { name: '点亮下一层' }))
    await user.type(screen.getByLabelText('输入守护词英文'), 'wrong')
    await user.click(screen.getByRole('button', { name: '检查守护拼写' }))
    await user.clear(screen.getByLabelText('输入守护词英文'))
    await user.type(screen.getByLabelText('输入守护词英文'), repeated.term)
    await user.click(screen.getByRole('button', { name: '检查守护拼写' }))
    await user.click(screen.getByRole('button', { name: '查看守护结果' }))
    expect(onReviewMiss).toHaveBeenCalledOnce()
    expect(screen.getByText(`再看看：${repeated.term}`)).toBeVisible()
  })
  it('uses unique exported heading and input labels and omits empty feedback panels', async () => {
    const user = userEvent.setup()
    const view = render(<><PlanetGuardianGame words={demoWords} onReviewMiss={vi.fn()} onBackToHub={vi.fn()} onReturnToLearning={vi.fn()} speechDependencies={{ synthesis: null }} /><PlanetGuardianGame words={demoWords} onReviewMiss={vi.fn()} onBackToHub={vi.fn()} onReturnToLearning={vi.fn()} speechDependencies={{ synthesis: null }} /></>)
    const sections = view.container.querySelectorAll('section[aria-labelledby]')
    expect(sections[0].getAttribute('aria-labelledby')).not.toBe(sections[1].getAttribute('aria-labelledby'))
    expect(within(sections[0] as HTMLElement).queryByRole('status')).not.toBeInTheDocument()
    view.unmount()

    render(<PlanetGuardianGame words={[demoWords[0]]} onReviewMiss={vi.fn()} onBackToHub={vi.fn()} onReturnToLearning={vi.fn()} speechDependencies={{ synthesis: null }} />)
    await user.click(screen.getByRole('button', { name: demoWords[0].term }))
    await user.click(screen.getByRole('button', { name: '点亮下一层' }))
    await user.click(screen.getByRole('button', { name: `选择中文：${demoWords[0].meaningZh}` }))
    await user.click(screen.getByRole('button', { name: '点亮下一层' }))
    const input = screen.getByLabelText('输入守护词英文')
    expect(input.id).not.toBe('guardian-spelling-answer')
  })

  it.each(demoWords)('conceals $term from the untouched spelling DOM', async (word) => {
    const user = userEvent.setup()
    const view = render(<PlanetGuardianGame words={[word]} onReviewMiss={vi.fn()} onBackToHub={vi.fn()} onReturnToLearning={vi.fn()} speechDependencies={{ synthesis: null }} />)
    await user.click(screen.getByRole('button', { name: word.term }))
    await user.click(screen.getByRole('button', { name: '点亮下一层' }))
    await user.click(screen.getByRole('button', { name: `选择中文：${word.meaningZh}` }))
    await user.click(screen.getByRole('button', { name: '点亮下一层' }))
    const spelling = screen.getByTestId('guardian-spelling-stage')
    expect(spelling.outerHTML.toLocaleLowerCase('en-US')).not.toContain(word.term.toLocaleLowerCase('en-US'))
    view.unmount()
    cleanup()
  })

  it('labels an unavailable US request with the US transcription and disables solved audio', async () => {
    const user = userEvent.setup()
    const words = demoWords.map((word) => ({ ...word, ipaUs: `/us-${word.term}/` }))
    render(<PlanetGuardianGame words={words} seed={61} onReviewMiss={vi.fn()} onBackToHub={vi.fn()} onReturnToLearning={vi.fn()} speechDependencies={{ synthesis: null }} />)
    const pictureTarget = targetId('guardian-picture-target')
    await user.click(choiceByWordId(/^(planet|cat|dog|sun)$/, pictureTarget))
    await user.click(screen.getByRole('button', { name: '点亮下一层' }))
    const audioTarget = targetId('guardian-audio-target')
    const audioWord = words.find((word) => word.id === audioTarget)!
    await user.click(screen.getByRole('button', { name: '播放守护关美式发音' }))
    expect(await screen.findByText(`无声提示（美式）：美 ${audioWord.ipaUs} · ${audioWord.meaningZh}`)).toBeVisible()
    await user.click(choiceByWordId(/^选择中文：/, audioTarget))
    expect(screen.getByRole('button', { name: '播放守护关英式发音' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '播放守护关美式发音' })).toBeDisabled()
  })

  it('disposes the exact pending speech controller when dependencies change and on unmount', async () => {
    const user = userEvent.setup()
    const utterances: Array<{ onend: (() => void) | null; onerror: (() => void) | null }> = []
    const make = (label: string) => {
      const synthesis = { cancel: vi.fn(), speak: vi.fn(), getVoices: vi.fn(() => [{ name: label, lang: 'en-GB' } as SpeechSynthesisVoice]) }
      return { synthesis, dependencies: { synthesis: synthesis as unknown as SpeechSynthesis, voices: [{ name: label, lang: 'en-GB' } as SpeechSynthesisVoice], createUtterance: () => { const value = { onend: null, onerror: null }; utterances.push(value); return value as unknown as SpeechSynthesisUtterance } } }
    }
    const a = make('A'); const b = make('B')
    const view = render(<PlanetGuardianGame words={[demoWords[0]]} onReviewMiss={vi.fn()} onBackToHub={vi.fn()} onReturnToLearning={vi.fn()} speechDependencies={a.dependencies} />)
    await user.click(screen.getByRole('button', { name: demoWords[0].term }))
    await user.click(screen.getByRole('button', { name: '点亮下一层' }))
    await user.click(screen.getByRole('button', { name: '播放守护关英式发音' }))
    view.rerender(<PlanetGuardianGame words={[demoWords[0]]} onReviewMiss={vi.fn()} onBackToHub={vi.fn()} onReturnToLearning={vi.fn()} speechDependencies={b.dependencies} />)
    expect(a.synthesis.cancel).toHaveBeenCalled()
    utterances[0].onend?.()
    expect(screen.queryByText('系统语音播放完成。')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '播放守护关英式发音' }))
    view.unmount()
    expect(b.synthesis.cancel).toHaveBeenCalled()
  })
  it('atomically records same-frame wrong then correct as solved after a miss', () => {
    const onReviewMiss = vi.fn()
    render(<PlanetGuardianGame words={demoWords} seed={47} onReviewMiss={onReviewMiss} onBackToHub={vi.fn()} onReturnToLearning={vi.fn()} speechDependencies={{ synthesis: null }} />)
    const target = targetId('guardian-picture-target')
    const buttons = screen.getAllByRole('button', { name: /^(planet|cat|dog|sun)$/ })
    const wrong = buttons.find((button) => button.getAttribute('data-word-id') !== target)!
    const correct = buttons.find((button) => button.getAttribute('data-word-id') === target)!

    act(() => { wrong.click(); correct.click() })

    expect(onReviewMiss).toHaveBeenCalledOnce()
    expect(within(screen.getByRole('list', { name: '各层护盾状态' })).getByText('看图：再次尝试后完成')).toBeInTheDocument()
    expect(screen.getByLabelText('本局首次答对 0 层')).toBeVisible()
  })

  it('accepts only one same-frame solve and one same-frame advance for a stage', () => {
    render(<PlanetGuardianGame words={demoWords} seed={49} onReviewMiss={vi.fn()} onBackToHub={vi.fn()} onReturnToLearning={vi.fn()} speechDependencies={{ synthesis: null }} />)
    const target = targetId('guardian-picture-target')
    const correct = screen.getAllByRole('button', { name: /^(planet|cat|dog|sun)$/ }).find((button) => button.getAttribute('data-word-id') === target)!

    act(() => { correct.click(); correct.click() })
    expect(screen.getByLabelText('本局首次答对 1 层')).toBeVisible()
    const next = screen.getByRole('button', { name: '点亮下一层' })
    act(() => { next.click(); next.click() })

    expect(screen.getByText('第 2 / 3 层')).toBeVisible()
    expect(screen.queryByText('第 3 / 3 层')).not.toBeInTheDocument()
  })

  it('ignores a same-frame wrong action after the stage was solved first try', () => {
    const onReviewMiss = vi.fn()
    render(<PlanetGuardianGame words={demoWords} seed={53} onReviewMiss={onReviewMiss} onBackToHub={vi.fn()} onReturnToLearning={vi.fn()} speechDependencies={{ synthesis: null }} />)
    const target = targetId('guardian-picture-target')
    const buttons = screen.getAllByRole('button', { name: /^(planet|cat|dog|sun)$/ })
    const correct = buttons.find((button) => button.getAttribute('data-word-id') === target)!
    const wrong = buttons.find((button) => button.getAttribute('data-word-id') !== target)!

    act(() => { correct.click(); wrong.click() })

    expect(onReviewMiss).not.toHaveBeenCalled()
    expect(within(screen.getByRole('list', { name: '各层护盾状态' })).getByText('看图：首次答对')).toBeInTheDocument()
    expect(screen.getByLabelText('本局首次答对 1 层')).toBeVisible()
  })

  it('keeps picture misses on stage, de-duplicates review reporting, and counts first-try outcomes once', async () => {
    const user = userEvent.setup()
    const onReviewMiss = vi.fn()
    render(<PlanetGuardianGame words={demoWords} seed={23} onReviewMiss={onReviewMiss} onBackToHub={vi.fn()} onReturnToLearning={vi.fn()} speechDependencies={{ synthesis: null }} />)

    expect(screen.getByText('第 1 / 3 层')).toBeVisible()
    const pictureTarget = targetId('guardian-picture-target')
    const wrongChoices = screen.getAllByRole('button', { name: /^(planet|cat|dog|sun)$/ }).filter((button) => button.getAttribute('data-word-id') !== pictureTarget)
    await user.click(wrongChoices[0])
    await user.click(wrongChoices[1])
    expect(screen.getByRole('status')).toHaveTextContent('再看看图片')
    expect(onReviewMiss).toHaveBeenCalledOnce()
    expect(onReviewMiss.mock.calls[0][0].id).toBe(pictureTarget)

    await user.click(choiceByWordId(/^(planet|cat|dog|sun)$/, pictureTarget))
    await user.click(screen.getByRole('button', { name: '点亮下一层' }))
    expect(screen.getByText('第 2 / 3 层')).toBeVisible()

    const audioTarget = targetId('guardian-audio-target')
    await user.click(choiceByWordId(/^选择中文：/, audioTarget))
    await user.click(screen.getByRole('button', { name: '点亮下一层' }))

    const stars = screen.getByRole('list', { name: '本局首次答对 1 层' })
    expect(within(stars).getAllByRole('listitem')).toHaveLength(3)
    expect(within(stars).getByText('星标·看图：再次尝试后完成')).toBeInTheDocument()
    expect(within(stars).getByText('星标·听音：首次答对')).toBeInTheDocument()
    expect(within(stars).getByText('星标·拼写：当前挑战')).toBeInTheDocument()

    const spellingTarget = createGuardianStages(demoWords, 23)[2].round.target.id
    const spellingWord = demoWords.find((word) => word.id === spellingTarget)!
    expect(screen.queryByText(spellingWord.term, { exact: true })).not.toBeInTheDocument()
    expect(screen.getByTestId('guardian-spelling-stage').outerHTML.toLocaleLowerCase('en-US')).not.toContain(spellingWord.term.toLocaleLowerCase('en-US'))
    await user.type(screen.getByLabelText('输入守护词英文'), ' wrong ')
    await user.click(screen.getByRole('button', { name: '检查守护拼写' }))
    expect(screen.getByRole('status')).toHaveTextContent('还差一点')
    expect(screen.getByText('第 3 / 3 层')).toBeVisible()
    await user.clear(screen.getByLabelText('输入守护词英文'))
    await user.type(screen.getByLabelText('输入守护词英文'), ` ${spellingWord.term.toUpperCase()} `)
    await user.click(screen.getByRole('button', { name: '检查守护拼写' }))
    await user.click(screen.getByRole('button', { name: '查看守护结果' }))

    expect(screen.getByRole('heading', { name: '三层护盾已点亮' })).toHaveFocus()
    expect(screen.getByText('首次答对 1 / 3 层')).toBeVisible()
    expect(screen.getByText(/再看看：/)).toHaveTextContent(spellingWord.term)
    expect(screen.getByText(/真实作答已保存在此设备/)).toBeVisible()
  })

  it('reports unsupported speech honestly, exposes a real fallback, and keeps audio stage completable', async () => {
    const user = userEvent.setup()
    render(<PlanetGuardianGame words={demoWords} seed={29} onReviewMiss={vi.fn()} onBackToHub={vi.fn()} onReturnToLearning={vi.fn()} speechDependencies={{ synthesis: null }} />)
    const pictureTarget = targetId('guardian-picture-target')
    await user.click(choiceByWordId(/^(planet|cat|dog|sun)$/, pictureTarget))
    await user.click(screen.getByRole('button', { name: '点亮下一层' }))

    await user.click(screen.getByRole('button', { name: '播放守护关英式发音' }))
    expect(await screen.findByRole('status')).toHaveTextContent('此浏览器暂不支持系统语音。')
    const audioTarget = targetId('guardian-audio-target')
    const word = demoWords.find((candidate) => candidate.id === audioTarget)!
    expect(screen.getByText(`无声提示（英式）：英 ${word.ipaUk} · ${word.meaningZh}`)).toBeVisible()
    await user.click(choiceByWordId(/^选择中文：/, audioTarget))
    expect(screen.getByRole('button', { name: '点亮下一层' })).toBeEnabled()
  })

  it('plays the real server audio path in the game before considering device speech', async () => {
    const user = userEvent.setup()
    const audioLoader = vi.fn().mockResolvedValue({ status: 'audio', source: 'local', url: 'blob:guardian-uk' })
    const audioPlayer = vi.fn().mockResolvedValue(undefined)
    render(<PlanetGuardianGame words={demoWords} seed={29} onReviewMiss={vi.fn()} onBackToHub={vi.fn()} onReturnToLearning={vi.fn()} audioLoader={audioLoader} audioPlayer={audioPlayer} />)
    const pictureTarget = targetId('guardian-picture-target')
    await user.click(choiceByWordId(/^(planet|cat|dog|sun)$/, pictureTarget))
    await user.click(screen.getByRole('button', { name: '点亮下一层' }))
    const audioTarget = targetId('guardian-audio-target')

    await user.click(screen.getByRole('button', { name: '播放守护关英式发音' }))

    expect(audioLoader).toHaveBeenCalledWith(audioTarget, 'en-GB')
    expect(audioPlayer).toHaveBeenCalledWith('blob:guardian-uk')
    expect(await screen.findByText('英式发音播放完成 · 本机语音。')).toBeVisible()
  })

  it('cancels an active speech request on stage change and ignores its stale completion', async () => {
    const user = userEvent.setup()
    const synthesis = { cancel: vi.fn(), speak: vi.fn(), getVoices: vi.fn(() => [{ name: 'UK', lang: 'en-GB' } as SpeechSynthesisVoice]) }
    const utterances: Array<{ onend: (() => void) | null; onerror: (() => void) | null }> = []
    const dependencies = {
      synthesis: synthesis as unknown as SpeechSynthesis,
      voices: [{ name: 'UK', lang: 'en-GB' } as SpeechSynthesisVoice],
      createUtterance: () => {
        const utterance = { onend: null, onerror: null }
        utterances.push(utterance)
        return utterance as unknown as SpeechSynthesisUtterance
      },
    }
    render(<PlanetGuardianGame words={demoWords} seed={31} onReviewMiss={vi.fn()} onBackToHub={vi.fn()} onReturnToLearning={vi.fn()} speechDependencies={dependencies} />)
    const pictureTarget = targetId('guardian-picture-target')
    await user.click(choiceByWordId(/^(planet|cat|dog|sun)$/, pictureTarget))
    await user.click(screen.getByRole('button', { name: '点亮下一层' }))
    await user.click(screen.getByRole('button', { name: '播放守护关英式发音' }))
    const audioTarget = targetId('guardian-audio-target')
    await user.click(choiceByWordId(/^选择中文：/, audioTarget))
    await user.click(screen.getByRole('button', { name: '点亮下一层' }))
    utterances[0].onend?.()

    expect(synthesis.cancel).toHaveBeenCalled()
    expect(screen.getByText('第 3 / 3 层')).toBeVisible()
    expect(screen.queryByText('系统语音播放完成。')).not.toBeInTheDocument()
  })

  it('keeps only the latest rapid UK-to-US speech request observable', async () => {
    const user = userEvent.setup()
    const utterances: Array<{ onend: (() => void) | null; onerror: (() => void) | null }> = []
    const synthesis = { cancel: vi.fn(), speak: vi.fn(), getVoices: vi.fn() }
    const voices = [{ name: 'UK', lang: 'en-GB' }, { name: 'US', lang: 'en-US' }] as SpeechSynthesisVoice[]
    render(<PlanetGuardianGame words={[demoWords[0]]} onReviewMiss={vi.fn()} onBackToHub={vi.fn()} onReturnToLearning={vi.fn()} speechDependencies={{ synthesis: synthesis as unknown as SpeechSynthesis, voices, createUtterance: () => { const value = { onend: null, onerror: null }; utterances.push(value); return value as unknown as SpeechSynthesisUtterance } }} />)
    await user.click(screen.getByRole('button', { name: demoWords[0].term }))
    await user.click(screen.getByRole('button', { name: '点亮下一层' }))
    await user.click(screen.getByRole('button', { name: '播放守护关英式发音' }))
    await user.click(screen.getByRole('button', { name: '播放守护关美式发音' }))
    act(() => { utterances[0].onend?.(); utterances[1].onend?.() })
    expect(await screen.findByText('系统语音播放完成。')).toBeVisible()
    expect(synthesis.cancel).toHaveBeenCalled()
  })

  it('remounts a clean first stage when the complete configuration changes', async () => {
    const user = userEvent.setup()
    const view = render(<PlanetGuardianGame words={demoWords.slice(0, 2)} seed={5} onReviewMiss={vi.fn()} onBackToHub={vi.fn()} onReturnToLearning={vi.fn()} speechDependencies={{ synthesis: null }} />)
    const target = targetId('guardian-picture-target')
    await user.click(choiceByWordId(/^(planet|cat)$/, target))
    view.rerender(<PlanetGuardianGame words={demoWords.slice(2)} seed={6} onReviewMiss={vi.fn()} onBackToHub={vi.fn()} onReturnToLearning={vi.fn()} speechDependencies={{ synthesis: null }} />)

    expect(screen.getByText('第 1 / 3 层')).toBeVisible()
    expect(screen.getByRole('heading', { name: '守护星球' })).toHaveFocus()
    expect(screen.queryByRole('button', { name: '点亮下一层' })).not.toBeInTheDocument()
  })
})
