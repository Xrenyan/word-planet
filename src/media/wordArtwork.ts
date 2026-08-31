type FallbackWord = { id: string; term: string; meaningZh: string }

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[character]!)
}

function hueFor(value: string) {
  let hash = 0
  for (const character of value) hash = (hash * 31 + character.codePointAt(0)!) >>> 0
  return 198 + (hash % 74)
}

export function wordFallbackDataUrl(word: FallbackWord) {
  const hue = hueFor(word.id)
  const term = escapeXml(word.term.slice(0, 28))
  const meaning = escapeXml(word.meaningZh.slice(0, 22))
  const initial = escapeXml((word.term.trim()[0] ?? 'W').toUpperCase())
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640" role="img" aria-label="${term} ${meaning}"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="hsl(${hue} 96% 92%)"/><stop offset="1" stop-color="hsl(${(hue + 34) % 360} 92% 86%)"/></linearGradient><radialGradient id="planet"><stop stop-color="#fff9be"/><stop offset="1" stop-color="#ffd24a"/></radialGradient></defs><rect width="960" height="640" rx="64" fill="url(#bg)"/><circle cx="790" cy="118" r="150" fill="#fff" opacity=".34"/><circle cx="134" cy="548" r="190" fill="#fff" opacity=".24"/><g transform="translate(480 244)"><ellipse rx="178" ry="54" fill="none" stroke="#fff" stroke-width="25" opacity=".8" transform="rotate(-12)"/><circle r="128" fill="url(#planet)"/><text x="0" y="35" text-anchor="middle" font-family="Nunito Sans,Arial,sans-serif" font-size="108" font-weight="900" fill="#3158cf">${initial}</text><circle cx="102" cy="-84" r="18" fill="#ff7e98"/></g><text x="480" y="462" text-anchor="middle" font-family="Nunito Sans,Arial,sans-serif" font-size="76" font-weight="900" fill="#102456">${term}</text><text x="480" y="536" text-anchor="middle" font-family="system-ui,sans-serif" font-size="38" font-weight="700" fill="#40527e">${meaning}</text><text x="480" y="592" text-anchor="middle" font-family="system-ui,sans-serif" font-size="22" font-weight="700" fill="#63749c">词星球 · 本地记忆卡</text></svg>`
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}
