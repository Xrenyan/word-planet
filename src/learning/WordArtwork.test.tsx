import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { WordArtwork } from './WordArtwork'

describe('WordArtwork', () => {
  it('lets a failed active illustration retry its own source without reloading the page', () => {
    render(<WordArtwork priority meaningZh="跳" image={{ src: 'https://example.test/retry-jump.jpg', alt: '跳跃配图', license: 'source' }} term="jump" />)
    fireEvent.error(screen.getByAltText('跳跃配图'))
    fireEvent.click(screen.getByRole('button', { name: '重试图片' }))
    const retried = screen.getByAltText('跳跃配图')
    expect(retried).toHaveAttribute('src', 'https://example.test/retry-jump.jpg')
    expect(screen.getByText('跳')).toBeVisible()
    fireEvent.load(retried)
    expect(screen.queryByRole('button', { name: '重试图片' })).not.toBeInTheDocument()
    expect(retried.parentElement).toHaveAttribute('data-ready', 'true')
  })

  it('shows an already-complete cached image without waiting for another load event', () => {
    const complete = vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true)
    const width = vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(640)
    try {
      render(<WordArtwork priority meaningZh="跳" image={{ src: 'word-art/jump.webp', alt: '已缓存的跳跃图', license: 'original' }} term="jump" />)
      expect(screen.getByAltText('已缓存的跳跃图').parentElement).toHaveAttribute('data-ready', 'true')
      expect(screen.queryByText('跳')).not.toBeInTheDocument()
    } finally { complete.mockRestore(); width.mockRestore() }
  })
  it('shows the real meaning immediately while a remote illustration is still loading', () => {
    render(<WordArtwork meaningZh="跳" image={{ src: 'https://example.test/jump.jpg', alt: '跳跃配图', license: 'source' }} term="jump" />)
    expect(screen.getByText('跳')).toBeVisible()
    fireEvent.load(screen.getByAltText('跳跃配图'))
    expect(screen.queryByText('跳')).not.toBeInTheDocument()
  })

  it('does not show the previous word image or a blank while the next source loads', () => {
    const { rerender } = render(<WordArtwork meaningZh="跳" image={{ src: 'https://example.test/jump.jpg', alt: '跳跃配图', license: 'source' }} term="jump" />)
    fireEvent.load(screen.getByAltText('跳跃配图'))
    rerender(<WordArtwork meaningZh="希望" image={{ src: 'https://example.test/hope.jpg', alt: '希望配图', license: 'source' }} term="hope" />)
    expect(screen.getByText('希望')).toBeVisible()
    expect(screen.queryByAltText('跳跃配图')).not.toBeInTheDocument()
  })

  it('requests the active image eagerly but leaves list thumbnails lazy', () => {
    const { rerender } = render(<WordArtwork priority image={{ src: 'word-art/sport.webp', alt: '运动配图', license: 'original-generated-reviewed' }} term="sport" />)
    expect(screen.getByAltText('运动配图')).toHaveAttribute('loading', 'eager')
    expect(screen.getByAltText('运动配图')).toHaveAttribute('fetchpriority', 'high')
    rerender(<WordArtwork image={{ src: 'word-art/sport.webp', alt: '运动配图', license: 'original-generated-reviewed' }} term="sport" />)
    expect(screen.getByAltText('运动配图')).toHaveAttribute('loading', 'lazy')
  })
  it('loads reviewed bundled webp artwork without exposing the answer during a quiz', () => {
    render(<WordArtwork revealTerm={false} meaningZh="体育运动" image={{ src: 'word-art/sport.webp', alt: '足球、篮球和网球拍', license: 'original-generated-reviewed' }} term="sport" />)
    expect(screen.getByRole('img', { name: '足球、篮球和网球拍' })).toHaveAttribute('src', `${import.meta.env.BASE_URL}word-art/sport.webp`)
    expect(screen.queryByText('sport')).not.toBeInTheDocument()
  })
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
