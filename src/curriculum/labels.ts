// unit is a stable internal section key; the textbook's printed label is separate.
export function unitLabel(word?: { unit: number; unitLabel?: string; source?: { title: string } }) {
  if (!word) return '单元'
  if (word.unitLabel) return word.unitLabel
  const title = word.source?.title ?? ''
  if (/welcome/i.test(title)) return 'Welcome'
  const match = title.match(/(unit|module)\s*(\d+)/i)
  return match ? `${match[1].toLowerCase() === 'unit' ? 'Unit' : 'Module'} ${Number(match[2])}` : `Unit ${word.unit}`
}
