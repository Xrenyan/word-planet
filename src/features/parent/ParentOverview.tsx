import { ChartLineUp, PencilLine } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import type { ServerProgress } from '../../../shared/contracts'
import type { WordPlanetApi } from '../../app/api/client'

export function ParentOverview({ api }: { api: WordPlanetApi }) {
  const [progress, setProgress] = useState<ServerProgress | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading')

  useEffect(() => {
    if (!api.getProgress) { setStatus('unavailable'); return }
    const controller = new AbortController()
    api.getProgress('local-child', controller.signal).then((result) => {
      setProgress(result); setStatus('ready')
    }).catch((error) => {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setStatus('unavailable')
    })
    return () => controller.abort()
  }, [api])

  const correct = useMemo(() => progress?.events.filter((event) => event.outcome === 'correct').length ?? 0, [progress])
  const accuracy = progress?.totalEvents ? Math.round(correct / progress.totalEvents * 100) : null

  return (
    <section className="parent-overview" aria-labelledby="parent-overview-title">
      <div className="parent-overview__header"><ChartLineUp aria-hidden="true" weight="fill" /><div><p>家长概览</p><h3 id="parent-overview-title">孩子的学习情况</h3></div><span><PencilLine aria-hidden="true" weight="fill" />汇总已完成的练习</span></div>
      {status === 'loading' && <p aria-live="polite">正在整理学习记录…</p>}
      {status === 'unavailable' && <p aria-live="polite">暂时读不到学习记录，请稍后重新打开本页。</p>}
      {status === 'ready' && progress?.totalEvents === 0 && <p aria-live="polite">孩子完成练习后，您可以在这里查看答题情况和需要巩固的单词。</p>}
      {status === 'ready' && progress && progress.totalEvents > 0 && (
        <dl>
          <div><dt>累计答题（次）</dt><dd>{progress.totalEvents}</dd></div>
          <div><dt>答题正确率</dt><dd>{accuracy}%</dd></div>
          <div><dt>需要巩固（词）</dt><dd>{progress.priorityWordIds.length}</dd></div>
        </dl>
      )}
    </section>
  )
}
