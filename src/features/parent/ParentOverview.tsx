import { ChartLineUp, ShieldCheck } from '@phosphor-icons/react'
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
      <div className="parent-overview__header"><ChartLineUp aria-hidden="true" weight="fill" /><div><p>家长概览</p><h3 id="parent-overview-title">真实学习数据</h3></div><span><ShieldCheck aria-hidden="true" weight="fill" />所有数字都来自真实作答事件</span></div>
      {status === 'loading' && <p aria-live="polite">正在读取真实记录</p>}
      {status === 'unavailable' && <p aria-live="polite">本机记录暂时无法读取，不展示推测数据。</p>}
      {status === 'ready' && progress?.totalEvents === 0 && <p aria-live="polite">完成正式教材练习后，这里会出现真实数据。</p>}
      {status === 'ready' && progress && progress.totalEvents > 0 && (
        <dl>
          <div><dt>真实作答</dt><dd>{progress.totalEvents}</dd></div>
          <div><dt>正确率</dt><dd>{accuracy}%</dd></div>
          <div><dt>待优先复习</dt><dd>{progress.priorityWordIds.length}</dd></div>
        </dl>
      )}
    </section>
  )
}
