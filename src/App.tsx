import { lazy, Suspense, useState } from 'react'
import ProtocolLab from './ui/lab/ProtocolLab'

const LegacyApp = lazy(() => import('./LegacyApp'))

export default function App() {
  const [legacy, setLegacy] = useState(false)
  return (
    <div className="netlab-root">
      <nav aria-label="학습 모드" className="mode-bar">
        <span>NetLab</span>
        <button aria-pressed={!legacy} onClick={() => setLegacy(false)}>
          프로토콜 실습
        </button>
        <button aria-pressed={legacy} onClick={() => setLegacy(true)}>
          Dijkstra 알고리즘 실습
        </button>
        {legacy && <small>자동 최단 경로 모델 · 실제 IP 라우팅과 구분됩니다</small>}
      </nav>
      <div hidden={legacy}>
        <ProtocolLab active={!legacy} />
      </div>
      <Suspense fallback={<p role="status">실습을 불러오는 중…</p>}>
        {legacy && <LegacyApp />}
      </Suspense>
    </div>
  )
}
