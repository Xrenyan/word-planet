import { Component, type ReactNode } from 'react'

export class AppErrorBoundary extends Component<{children: ReactNode}, {failed:boolean}> {
  state = { failed:false }
  static getDerivedStateFromError() { return {failed:true} }
  render() {
    if (!this.state.failed) return this.props.children
    return <main className="practice-completion" role="alert">
      <h1>页面暂时没有打开</h1>
      <p>可能是网络中断或刚刚更新了版本。已保存的本地学习记录不会因重新加载而删除。</p>
      <div className="practice-completion__actions"><button type="button" onClick={() => window.location.reload()}>重新加载页面</button></div>
    </main>
  }
}
