import type { BookSummary, VocabularyWordContract } from '../../../shared/contracts'

export function ParentGuide({ books }: { books: readonly BookSummary[] }) {
  return <section className="parent-guide" aria-labelledby="parent-guide-title">
    <h2 id="parent-guide-title">给家长的小提示</h2>
    <div className="parent-guide__grid">
      <section><h3>先对照孩子的课本</h3><p>请选择与纸质课本单元一致的词表。四年级上册已按提供的第 82–85 页词表整理；其他册并非全部是最新版本，具体见下方说明。</p>
        <details><summary>各册教材说明</summary><ul>{books.map(book => <li key={book.id}><strong>{book.label}</strong><p>{book.editionNote || book.editionLabel || '请对照纸质课本的单元和词表。'}</p></li>)}</ul></details>
      </section>
      <section><h3>发音与跟读</h3><p>英式和美式示范由电脑合成，不是教材原声。录音仅用于孩子回放对比，不会上传，也不提供发音评分；切换单词或离开页面会清除录音。</p><p>单词卡下的“家长查看”可查音标及配图来源。部分词没有配图，会使用词义提示帮助联想。</p></section>
      <section><h3>保管好学习记录</h3><p>不登录也能学习，答题记录保存在当前浏览器。清理浏览器数据或更换设备前，请在下方备份，或使用“换设备继续学”。录音不包含在备份中。</p></section>
    </div>
  </section>
}

export function WordDetails({ word }: { word: VocabularyWordContract }) {
  const safeLink = (value?: string) => value && /^https:\/\//i.test(value) ? value : undefined
  return <details className="word-details">
    <summary>家长查看</summary>
    <p>{word.editionNote || '请对照孩子的纸质课本词表。'}</p>
    <div className="word-details__links">
      {safeLink(word.source.url) && <a href={word.source.url} target="_blank" rel="noreferrer">查看词表来源</a>}
      {safeLink(word.ipaSource) && <a href={word.ipaSource} target="_blank" rel="noreferrer">查看音标来源</a>}
      {word.image.src.startsWith('word-art/') && word.image.license === 'CC BY-SA 4.0' && <a href={`${import.meta.env.BASE_URL}licenses/WORD-ARTWORK.txt`} target="_blank" rel="noreferrer">配图：OpenMoji · 作者与 CC BY-SA 4.0 许可</a>}
      {word.image.license === 'original-generated-reviewed' && <a href={`${import.meta.env.BASE_URL}licenses/GENERATED-ILLUSTRATIONS.txt`} target="_blank" rel="noreferrer">配图：AI 辅助记忆插图 · 非教材原图</a>}
      {safeLink(word.image.src) && <a href={word.image.src} target="_blank" rel="noreferrer">查看配图来源</a>}
    </div>
    {word.ipaNote && <p>{word.ipaNote}</p>}
    <p>英美示范为合成语音，非教材原声。录音仅供回放对比，不上传、不评分。</p>
  </details>
}
