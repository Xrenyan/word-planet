export function sourceLabel(word: { sourceConfidence?: string }) {
  return word.sourceConfidence === 'user-photo' ? '教材照片核对词条' : word.sourceConfidence === 'public-secondary' ? '公开来源匹配 · 待教材页复核' : '已核验教材词条'
}
