import { Lightbulb } from '@phosphor-icons/react'
import { useState } from 'react'

type WordArtworkProps = {
  image: { src: string; alt: string; license: string }
  term: string
  meaningZh?: string
  wordId?: string
  revealTerm?: boolean
  priority?: boolean
}

export function artworkSource(src: string, revealTerm = true) {
  if (/^word-art\/[\w-]+\.(svg|webp)$/.test(src)) return `${import.meta.env.BASE_URL}${src}`
  return /^https:\/\//.test(src) && revealTerm ? src : null
}

export function WordArtwork({ image, meaningZh = '', revealTerm = true, priority = false }: WordArtworkProps) {
  const [settled, setSettled] = useState<{ source: string; status: 'loaded' | 'failed' } | null>(null)
  const bundledArtwork = /^word-art\/[\w-]+\.(svg|webp)$/.test(image.src)
  const source = artworkSource(image.src, revealTerm)

  const status = settled?.source === source ? settled.status : 'loading'
  if (!source || status === 'failed') {
    return (
      <div className="word-artwork word-artwork--clue" role="img" aria-label={`词义联想：${meaningZh || '看提示想一想'}`}>
        <Lightbulb aria-hidden="true" weight="duotone" />
        <small>词义联想</small>
        <strong>{meaningZh || '看提示想一想'}</strong>
      </div>
    )
  }

  return (
    <div className="word-artwork word-artwork--frame" data-bundled={bundledArtwork} data-ready={status === 'loaded'}>
      {status !== 'loaded' && <div className="word-artwork__placeholder" aria-hidden="true"><Lightbulb weight="duotone" /><span>{meaningZh || '看提示想一想'}</span></div>}
      <img
        key={source}
        className="word-artwork__image"
        src={source}
        alt={image.alt}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding="async"
        onLoad={() => setSettled({ source, status: 'loaded' })}
        onError={() => setSettled({ source, status: 'failed' })}
      />
    </div>
  )
}
