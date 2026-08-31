import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { WordArtwork } from './WordArtwork'

describe('WordArtwork', () => {
  it('falls back to a self-contained local word card when a remote image fails', () => {
    render(<WordArtwork wordId="g3-apple" meaningZh="苹果" image={{ src: 'https://invalid.example/apple.png', alt: '苹果记忆图', license: 'source' }} term="apple" />)

    const image = screen.getByRole('img', { name: '苹果记忆图' })
    fireEvent.error(image)

    expect(image.getAttribute('src')).toMatch(/^data:image\/svg\+xml/)
    expect(screen.queryByLabelText('图片暂不可用：apple')).not.toBeInTheDocument()
  })

  it('uses a text fallback only if the local data URL cannot render', () => {
    render(<WordArtwork wordId="g3-apple" meaningZh="苹果" image={{ src: 'https://invalid.example/apple.png', alt: '苹果记忆图', license: 'source' }} term="apple" />)

    const image = screen.getByRole('img', { name: '苹果记忆图' })
    fireEvent.error(image)
    fireEvent.error(image)

    expect(screen.getByLabelText('图片暂不可用：apple')).toBeInTheDocument()
  })
})
