import { ArrowRight, BookOpenText, Sparkle } from '@phosphor-icons/react'
import { useCallback, useEffect, useState } from 'react'
import type { ReviewItem, VocabularyWordContract } from '../../../shared/contracts'
import type { WordPlanetApi } from '../../app/api/client'
import { Pressable } from '../../ui/Pressable'
import { WordArtwork } from '../../learning/WordArtwork'

type ReviewState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; items: readonly ReviewItem[] }

export function ReviewCenter({ api, onStudy }: { api: WordPlanetApi; onStudy: (word: VocabularyWordContract) => void }) {
  const [state, setState] = useState<ReviewState>({ status: 'loading' })
  const load = useCallback(async (signal?: AbortSignal) => {
    if (!api.getReview) { setState({ status: 'error' }); return }
    setState({ status: 'loading' })
    try {
      const response = await api.getReview('local-child', signal)
      setState({ status: 'ready', items: response.items })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setState({ status: 'error' })
    }
  }, [api])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  return (
    <section className="review-center" aria-labelledby="review-center-title">
      <header className="review-center__header">
        <div className="review-center__icon"><BookOpenText aria-hidden="true" weight="duotone" /></div>
        <div><p className="status-pill">错词巩固 · 间隔复习</p><h2 id="review-center-title" data-route-heading tabIndex={-1}>需要再练的单词</h2><p>先巩固错词，再复习到期词。跨天答对后，复习间隔逐步延长至 1、3、7、14、30 天。</p></div>
      </header>
      {state.status === 'loading' && <p className="review-center__state" role="status">正在整理真实作答记录…</p>}
      {state.status === 'error' && <div className="review-center__state" role="alert"><p>本机错题记录暂时无法读取，没有展示推测数据。</p><Pressable onClick={() => void load()}>重新读取</Pressable></div>}
      {state.status === 'ready' && state.items.length === 0 && <div className="review-center__empty" role="status"><Sparkle aria-hidden="true" weight="fill" /><div><strong>现在没有需要优先复习的单词</strong><p>继续完成教材学习或游戏，真实错词会自动出现在这里。</p></div></div>}
      {state.status === 'ready' && state.items.length > 0 && <ul className="review-center__list">{state.items.map((item) => <li key={item.word.id}>
        <WordArtwork image={item.word.image} term={item.word.term} meaningZh={item.word.meaningZh} wordId={item.word.id} />
        <div><h3>{item.word.term}</h3><p>{item.word.meaningZh}</p><small>{item.weakness > 0 ? '错词巩固' : '到期复习'} · 错 {item.misses} 次 · 对 {item.correct} 次</small></div>
        <Pressable aria-label={`复习 ${item.word.term}`} onClick={() => onStudy(item.word)}>开始复习 <ArrowRight aria-hidden="true" weight="bold" /></Pressable>
      </li>)}</ul>}
    </section>
  )
}
