import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { WordArtwork } from './WordArtwork'

describe('WordArtwork', () => {
  it('keeps a readable meaning clue when an image fails instead of pretending a generic drawing illustrates the word', () => {
    render(<WordArtwork wordId="g3-apple" meaningZh="苹果" image={{ src: 'https://invalid.example/apple.png', alt: '苹果记忆图', license: 'source' }} term="apple" />)

    const image = screen.getByRole('img', { name: '苹果记忆图' })
    fireEvent.error(image)

    expect(screen.getByText('词义联想')).toBeVisible()
    expect(screen.getByText('苹果')).toBeVisible()
  })

  it('uses the bundled meaning-only illustration during a quiz without leaking the English answer', () => {
    render(<WordArtwork revealTerm={false} wordId="g3-apple" meaningZh="苹果" image={{ src: 'word-art/apple.svg', alt: '苹果', license: 'CC BY-SA 4.0' }} term="apple" />)
    expect(screen.getByRole('img', {name: '苹果'})).toHaveAttribute('src',`${import.meta.env.BASE_URL}word-art/apple.svg`)
    expect(screen.queryByText('apple')).not.toBeInTheDocument()
  })
})
