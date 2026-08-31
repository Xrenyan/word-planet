import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AsyncButton } from './AsyncButton'
import { Pressable } from './Pressable'

describe('instant interaction feedback', () => {
  it('marks a press during pointerdown before click work begins', () => {
    render(<Pressable>开始学习</Pressable>)
    const button = screen.getByRole('button', { name: '开始学习' })

    fireEvent.pointerDown(button)

    expect(button).toHaveAttribute('data-pressed', 'true')
    fireEvent.pointerUp(button)
    expect(button).not.toHaveAttribute('data-pressed')
  })

  it('shows busy feedback immediately while asynchronous work continues', async () => {
    let finish: (() => void) | undefined
    const onPress = vi.fn(() => new Promise<void>((resolve) => { finish = resolve }))
    render(<AsyncButton onPress={onPress} pendingLabel="正在准备">英式发音</AsyncButton>)
    const button = screen.getByRole('button', { name: '英式发音' })

    fireEvent.click(button)

    expect(screen.getByRole('button', { name: '正在准备' })).toHaveAttribute('aria-busy', 'true')
    finish?.()
  })
})
