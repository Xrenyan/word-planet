import { ImageSquare } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'

import { wordFallbackDataUrl } from '../media/wordArtwork'

type WordArtworkProps = {
  image: { src: string; alt: string; license: string }
  term: string
  meaningZh?: string
  wordId?: string
}

export function WordArtwork({ image, term, meaningZh = '', wordId }: WordArtworkProps) {
  const [fallbackStage, setFallbackStage] = useState(0)
  const hasRemoteArtwork = /^(https?:|data:)/.test(image.src)
  const localArtwork = wordFallbackDataUrl({ id: wordId ?? term, term, meaningZh })

  useEffect(() => setFallbackStage(0), [image.src, wordId])

  if (fallbackStage >= 2) {
    return (
      <div className="word-artwork__fallback" role="img" aria-label={`图片暂不可用：${term}`}>
        <ImageSquare aria-hidden="true" weight="duotone" />
        <span aria-hidden="true">{term.slice(0, 1).toUpperCase()}</span>
      </div>
    )
  }

  return (
    <img
      className="word-artwork"
      src={fallbackStage === 0 && hasRemoteArtwork ? image.src : localArtwork}
      alt={image.alt}
      style={{ backgroundImage: `url("${localArtwork}")`, backgroundPosition: 'center', backgroundSize: 'cover' }}
      onError={() => setFallbackStage((stage) => (stage === 0 && hasRemoteArtwork ? 1 : 2))}
    />
  )
}
