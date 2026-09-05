const key = 'word-planet:v1:bookmark'
export type Bookmark = { bookId: string; wordId: string }
export function readBookmark(): Bookmark | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null')
    return value && typeof value.bookId === 'string' && typeof value.wordId === 'string' ? value : null
  } catch { return null }
}
export function saveBookmark(bookmark: Bookmark) {
  try { localStorage.setItem(key, JSON.stringify(bookmark)) } catch { /* Learning remains available in private mode. */ }
}
