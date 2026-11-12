import { useEffect, useRef, useState } from 'react'
import type { Direction, LevelDefinition, PlaybackFrame } from './engine/index.ts'
import type { CameraSettings } from './render/math.ts'
import { createRenderer } from './render/renderer.ts'
import type { Renderer } from './render/renderer.ts'

export function Board3D({ level, frame, exitDirection = 'right', camera }: {
  level: LevelDefinition; frame: PlaybackFrame; exitDirection?: Direction; camera?: CameraSettings
}) {
  const canvas = useRef<HTMLCanvasElement>(null), renderer = useRef<Renderer | null>(null), current = useRef(frame)
  const [error, setError] = useState(''), [ready, setReady] = useState(false)
  useEffect(() => {
    current.current = frame
    renderer.current?.draw(frame)
  }, [frame])
  useEffect(() => {
    let cancelled = false
    const abort = new AbortController()
    let owned: Renderer | undefined
    const element = canvas.current!
    const observer = new ResizeObserver(() => owned?.draw(current.current))
    createRenderer(element,level,exitDirection,camera,message => { if (!cancelled) setError(message) }, abort.signal).then(result => {
      if (cancelled) { result.dispose(); return }
      owned = result; renderer.current = result
      result.draw(current.current); observer.observe(element); setReady(true)
    }).catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason)) })
    return () => { cancelled = true; abort.abort(); observer.disconnect(); owned?.dispose(); renderer.current = null }
  }, [level,exitDirection,camera])
  return <div className="board-3d">
    <canvas ref={canvas} role="img" aria-label={`三维关卡地图，${level.width}列${level.height}行，第${frame.state.turn}步。`} data-renderer={ready ? 'webgpu' : 'loading'} />
    {(!ready || error) && <div className="render-message" role={error ? 'alert' : 'status'}>{error || '正在准备场景…'}</div>}
  </div>
}
