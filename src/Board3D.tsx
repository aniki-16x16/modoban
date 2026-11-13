import { useEffect, useRef, useState } from 'react'
import type { Direction, LevelDefinition, PlaybackFrame } from './engine/index.ts'
import type { CameraSettings } from './render/math.ts'
import { createRenderer } from './render/renderer.ts'
import type { Renderer } from './render/renderer.ts'
import { Loading } from './Loading.tsx'
import { afterPaint } from './afterPaint.ts'

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
    let animationId: number | undefined
    const element = canvas.current!
    const observer = new ResizeObserver(() => owned?.draw(current.current))
    const cancelPreparation = afterPaint(() => {
      void createRenderer(element,level,exitDirection,camera,message => { if (!cancelled) setError(message) }, abort.signal).then(result => {
        if (cancelled) { result.dispose(); return }
        owned = result; renderer.current = result
        result.draw(current.current); observer.observe(element); setReady(true)
        if (level.mechanisms.some(mechanism => mechanism.kind === 'conveyor')) {
          const tick = (now: number) => {
            result.draw(current.current,now)
            animationId = requestAnimationFrame(tick)
          }
          animationId = requestAnimationFrame(tick)
        }
      }).catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason)) })
    })
    return () => {
      cancelled = true; cancelPreparation(); abort.abort(); observer.disconnect()
      if (animationId !== undefined) cancelAnimationFrame(animationId)
      owned?.dispose(); renderer.current = null
    }
  }, [level,exitDirection,camera])
  return <div className="board-3d" aria-busy={!ready && !error}>
    <canvas ref={canvas} role="img" aria-label={`三维关卡地图，${level.width}列${level.height}行，第${frame.state.turn}步。`} data-renderer={error ? 'error' : ready ? 'webgpu' : 'loading'} />
    {(!ready || error) && <div className="render-message" role={error ? 'alert' : undefined}>
      {error || <Loading label="正在准备关卡…" />}
    </div>}
  </div>
}
