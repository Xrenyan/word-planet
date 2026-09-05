import { Lightbulb } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'

type WordArtworkProps = {
  image: { src: string; alt: string; license: string }
  term: string
  meaningZh?: string
  wordId?: string
  revealTerm?: boolean
}

export function WordArtwork({ image, term, meaningZh = '', wordId, revealTerm = true }: WordArtworkProps) {
  const [failed, setFailed] = useState(false)
  const bundledArtwork = /^word-art\/[\w-]+\.svg$/.test(image.src)
  const safeRemoteArtwork = /^https:\/\//.test(image.src) && revealTerm
  const source = bundledArtwork ? `${import.meta.env.BASE_URL}${image.src}` : safeRemoteArtwork ? image.src : null

  useEffect(() => setFailed(false), [image.src, wordId])

  if (!source || failed) {
    return (
      <div className="word-artwork word-artwork--clue" role="img" aria-label={`词义联想：${meaningZh || '看提示想一想'}`}>
        <Lightbulb aria-hidden="true" weight="duotone" />
        <small>词义联想</small>
        <strong>{meaningZh || '看提示想一想'}</strong>
      </div>
    )
  }

  return (
    <img
      className="word-artwork"
      src={source}
      alt={bundledArtwork || revealTerm ? image.alt : meaningZh}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  )
}
