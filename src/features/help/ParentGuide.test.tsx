import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import type { VocabularyWordContract } from '../../../shared/contracts'
import { WordDetails } from './ParentGuide'

it('identifies a generated memory illustration without attributing it to OpenMoji', () => {
  const word: VocabularyWordContract = { id: 'sport', bookId: 'g4-upper', unit: 1, order: 1, term: 'sport', meaningZh: '体育运动', ipaUk: '/spɔːt/', ipaUs: '/spɔːrt/', image: { src: 'word-art/sport.webp', alt: '运动', license: 'original-generated-reviewed' }, source: { title: '用户教材照片', url: 'https://example.test', page: 82 }, sourceConfidence: 'user-photo' }
  render(<WordDetails word={word} />)
  fireEvent.click(screen.getByText('家长查看'))
  expect(screen.getByRole('link', { name: /AI 辅助.*非教材原图/ })).toHaveAttribute('href', `${import.meta.env.BASE_URL}licenses/GENERATED-ILLUSTRATIONS.txt`)
  expect(screen.queryByRole('link', { name: /OpenMoji/ })).not.toBeInTheDocument()
})
