import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { GameController } from './engine/index.ts'
import type { AxisDefinition, Direction, DoorDirection, LevelDefinition } from './engine/index.ts'
import { allLevels, chapters } from './levels/index.ts'
import type { Chapter, ChapterLevel } from './levels/index.ts'
import { defaultMotionSettings } from './motion.ts'
import { circuitPalette } from './circuits.ts'
import { Board3D } from './Board3D.tsx'
import { prepareRenderer } from './render/renderer.ts'
import { afterPaint } from './afterPaint.ts'
import './style.css'

const tile = 64
function PressureButton({ color, active = false }: { color: string; active?: boolean }) {
  return <g>
    <circle cy="3" r="26" fill="#374738" opacity=".14" />
    <circle cy="1" r="25" fill="#d5cebc" stroke={color} strokeWidth="1.5" />
    <circle cy="2" r="21" fill={color} />
    <circle cy="2" r="21" fill="#182d27" opacity=".25" />
    <g transform={`translate(0, ${active ? 1 : -5})`}>
      <circle r="21" fill={color} />
      <circle r="20" fill="none" stroke="#fff9e8" strokeOpacity={active ? .25 : .55} />
      <path d="M-15-9a17 17 0 0 1 30 0" fill="none" stroke="#fff9e8" strokeOpacity={active ? .15 : .5} strokeWidth="2" strokeLinecap="round" />
    </g>
  </g>
}

function CycleBase({ axis, phase, locked, color }: { axis: AxisDefinition; phase: number; locked: boolean; color: string }) {
  return <g className="cycle-base" role="img" aria-label={`${axis.signals.length}拍周期轴，当前第${phase + 1}拍，输出${axis.signals[phase] ? '真' : '假'}，${locked ? '已制动' : '运转'}`}>
    <rect x="5" y="9" width="54" height="50" rx="9" fill="#172d25" opacity=".35" />
    <rect x="5" y="3" width="54" height="51" rx="9" fill={color} stroke="#eee4cb" strokeWidth="1.5" />
    <rect x="8" y="6" width="48" height="45" rx="7" fill="#243c31" stroke={color} strokeWidth="1.5" />
    {[12, 52].flatMap(x => [10, 47].map(y => <circle key={`${x},${y}`} cx={x} cy={y} r="1.4" fill="#c4c9b5" />))}
    <g transform="translate(32, 28)">
      <circle r="20" fill="#1e342b" stroke={color} strokeWidth="1.5" />
      {axis.signals.map((signal, index) => {
        const angle = index / axis.signals.length * Math.PI * 2 - Math.PI / 2
        const x = Math.cos(angle) * 14
        const y = Math.sin(angle) * 14
        return <g key={index}>
          {index === phase && <path d={`M0 0L${x} ${y}`} stroke="#f6f1df" strokeWidth="2" />}
          <circle cx={x} cy={y} r="3.2" fill={signal ? color : '#1e342b'} stroke={color} strokeWidth="1.5" />
          {index === phase && <circle cx={x} cy={y} r="5.6" fill="none" stroke="#f6f1df" strokeWidth="1.5" />}
        </g>
      })}
      <circle r="4" fill={color} stroke="#f6f1df" />
      {locked && <path d="M-5-6v12M5-6v12" stroke="#f6f1df" strokeWidth="3" />}
    </g>
  </g>
}

function BrakeSlot({ color }: { color: string }) {
  return <g>
    <rect x="-25" y="-25" width="50" height="50" rx="6" fill="#b7b49f" stroke={color} strokeWidth="2" />
    <rect x="-20" y="-20" width="40" height="40" rx="3" fill="#334238" />
    <path d="M-24-12h9m-9 12h9m-9 12h9m39-24h-9m9 12h-9m9 12h-9" stroke={color} strokeWidth="4" />
  </g>
}

function Gate({ color, extension, direction }: { color: string; extension: number; direction: DoorDirection }) {
  if (direction === 'z-down') {
    const inset = 5 + 5 * extension
    return <g>
      <title>顶部落门：垂直落下封路，压毁门格内的物体</title>
      <path d="M5 17V5h12m30 0h12v12M5 47v12h12m30 0h12V47" fill="none" stroke={color} strokeWidth="3" />
      {extension > 0 && <g>
        <rect x={inset - 2} y={inset + 3} width={68 - inset * 2} height={64 - inset * 2} rx="3" fill="#142720" opacity={extension * .25} />
        <rect x={inset} y={inset} width={64 - inset * 2} height={64 - inset * 2} rx="2" fill={color} fillOpacity={extension * .5} stroke={color} strokeOpacity={extension} strokeWidth="2" />
        <path d="M23 32h18M32 23v18" stroke={color} strokeWidth="2" opacity={extension * .65} />
      </g>}
    </g>
  }
  const rotation = { down: 0, left: 90, up: 180, right: 270 }[direction]
  return <g transform={`rotate(${rotation}, 32, 32)`}>
    {extension > 0 && <rect x="8" y="0" width="48" height={extension * tile} fill={color} fillOpacity=".35" />}
    <rect x="8" y="0" width="48" height="3" rx="1" fill={color} />
  </g>
}
const directionKeys: Record<string, Direction> = {
  ArrowUp: 'up', ArrowRight: 'right', ArrowDown: 'down', ArrowLeft: 'left',
  w: 'up', d: 'right', s: 'down', a: 'left',
}

function Arrow({ direction = 'right' }: { direction?: Direction }) {
  const rotation = { right: 0, down: 90, left: 180, up: 270 }[direction]
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ transform: `rotate(${rotation}deg)` }}>
    <path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
}

function LevelPreview({ level, exitDirection = 'right' }: { level: LevelDefinition; exitDirection?: Direction }) {
  const colorFor = circuitPalette(level)
  const walls = new Set(level.walls.map(position => `${position.x},${position.y}`))
  return <svg className="level-preview" width={(level.width + 2) * 24} height={(level.height + 2) * 24} viewBox={`-1 -1 ${level.width + 2} ${level.height + 2}`} fill="none" aria-hidden="true">
    {Array.from({ length: level.width * level.height }, (_, index) => {
      const x = index % level.width
      const y = Math.floor(index / level.width)
      return walls.has(`${x},${y}`) ? null : <rect key={index} x={x + .04} y={y + .04} width=".92" height=".92" rx=".1" fill="#dce1cf" stroke="#cdd5bf" strokeWidth=".025" />
    })}
    {level.axes.map(axis => <g key={axis.id} transform={`translate(${axis.position.x}, ${axis.position.y}) scale(${1 / tile})`}>
      <CycleBase axis={axis} phase={axis.initialPhase} locked={false} color={colorFor('axis', axis.id)} />
    </g>)}
    {level.mechanisms.map(plate => <g key={plate.id} transform={`translate(${plate.position.x + .5}, ${plate.position.y + .5}) scale(${1 / tile})`}>
      {plate.kind === 'slot' ? <BrakeSlot color={colorFor('slot', plate.id)} /> : <PressureButton color={colorFor(plate.kind, plate.id)} />}
    </g>)}
    {level.doors.map(door => <g key={door.id} transform={`translate(${door.position.x}, ${door.position.y}) scale(${1 / tile})`}>
      <Gate color={colorFor('door', door.id)} extension={Number(door.initialExtended)} direction={door.direction} />
    </g>)}
    {level.entities.map(entity => entity.kind === 'player'
      ? <g className="preview-player" key={entity.id} style={{ transformOrigin: `${entity.position.x + .5}px ${entity.position.y + .5}px` }}>
        <circle cx={entity.position.x + .5} cy={entity.position.y + .5} r=".32" fill="#df7955" />
        <path d={`M${entity.position.x + .39} ${entity.position.y + .45}v.02m.22-.02v.02`} stroke="#643d2e" strokeWidth=".06" strokeLinecap="round" />
      </g>
      : <g className="preview-crate" key={entity.id}>
        <rect x={entity.position.x + .18} y={entity.position.y + .15} width=".64" height=".64" rx=".08" fill="#c99b64" stroke="#b28651" strokeWidth=".04" />
        <path d={`m${entity.position.x + .3} ${entity.position.y + .27}.4.4m0-.4-.4.4`} stroke="#e9c28a" strokeWidth=".07" />
      </g>)}
    <rect x={level.exit.x + .16} y={level.exit.y + .16} width=".68" height=".68" rx=".12" fill="#91aa7f" />
    <path d={`M${level.exit.x + .32} ${level.exit.y + .5}h.36m-.15-.15.15.15-.15.15`} transform={`rotate(${{ right: 0, down: 90, left: 180, up: 270 }[exitDirection]},${level.exit.x + .5},${level.exit.y + .5})`} stroke="#f8f8ef" strokeWidth=".07" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
}

function ChapterSection({ chapter, completed }: { chapter: Chapter; completed: readonly string[] }) {
  const listRef = useRef<HTMLElement>(null)
  const dragRef = useRef<{ pointerId: number; startX: number; scrollLeft: number; dragging: boolean } | null>(null)
  const suppressClickRef = useRef(false)
  const [dragging, setDragging] = useState(false)
  const [scrollEdges, setScrollEdges] = useState({ left: false, right: false })

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const updateEdges = () => {
      const left = list.scrollLeft > 1
      const right = list.scrollWidth - list.clientWidth - list.scrollLeft > 1
      setScrollEdges(previous => previous.left === left && previous.right === right ? previous : { left, right })
    }
    const observer = new ResizeObserver(updateEdges)
    observer.observe(list)
    list.addEventListener('scroll', updateEdges, { passive: true })
    updateEdges()
    return () => {
      observer.disconnect()
      list.removeEventListener('scroll', updateEdges)
    }
  }, [chapter.levels.length])

  const scrollLevels = (direction: number) => {
    const list = listRef.current
    if (!list) return
    const card = list.firstElementChild
    const distance = (card?.getBoundingClientRect().width ?? 300) + parseFloat(getComputedStyle(list).columnGap)
    list.scrollBy({ left: direction * distance, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  }

  const finishDrag = (event: PointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return <section className="chapter" aria-labelledby={`chapter-${chapter.number}`}>
    <div className="chapter-heading">
      <span className="chapter-index">{chapter.number}</span>
      <h2 id={`chapter-${chapter.number}`}>{chapter.title}</h2>
    </div>
    <div className="level-carousel">
      <nav ref={listRef} id={`chapter-levels-${chapter.number}`} className={`level-list${scrollEdges.left || scrollEdges.right ? ' has-overflow' : ''}${dragging ? ' is-dragging' : ''}`} aria-label={`第${Number(chapter.number)}章关卡`}
        onPointerDown={event => {
          suppressClickRef.current = false
          if (event.pointerType !== 'mouse' || event.button !== 0 || event.currentTarget.scrollWidth <= event.currentTarget.clientWidth) return
          dragRef.current = { pointerId: event.pointerId, startX: event.clientX, scrollLeft: event.currentTarget.scrollLeft, dragging: false }
        }}
        onPointerMove={event => {
          const drag = dragRef.current
          if (!drag || drag.pointerId !== event.pointerId) return
          const distance = event.clientX - drag.startX
          if (!drag.dragging) {
            if (Math.abs(distance) < 6) return
            drag.dragging = true
            suppressClickRef.current = true
            event.currentTarget.setPointerCapture(event.pointerId)
            setDragging(true)
          }
          event.preventDefault()
          event.currentTarget.scrollLeft = drag.scrollLeft - distance
        }}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onLostPointerCapture={finishDrag}
        onPointerLeave={event => { if (!dragRef.current?.dragging) finishDrag(event) }}
        onDragStart={event => event.preventDefault()}
        onClickCapture={event => {
          if (!suppressClickRef.current || event.detail === 0) return
          event.preventDefault()
          event.stopPropagation()
          suppressClickRef.current = false
        }}>
        {chapter.levels.map(level => {
          const cleared = completed.includes(level.definition.id)
          return <a key={level.definition.id} href={`#play/${level.definition.id}`} className={`level-card${cleared ? ' is-complete' : ''}`}>
            <div className="level-art">
              <span className="art-corner corner-top" />
              <LevelPreview level={level.definition} exitDirection={level.exitDirection} />
              <span className="art-corner corner-bottom" />
            </div>
            <div className="level-info">
              <span className="level-number">{level.number}</span>
              <h3>{level.title}</h3>
              <span className="level-status">{cleared && <span aria-hidden="true">✓</span>}{cleared ? '已完成' : '未完成'}</span>
            </div>
          </a>
        })}
      </nav>
      {(['left', 'right'] as const).map(direction => scrollEdges[direction] && <div key={direction} className={`level-scroll-edge edge-${direction}`}>
        <button type="button" className="level-scroll-button" aria-label={`向${direction === 'left' ? '左' : '右'}浏览关卡`} aria-controls={`chapter-levels-${chapter.number}`} title="左右拖动或点击箭头浏览关卡" onClick={() => scrollLevels(direction === 'left' ? -1 : 1)}>
          <Arrow direction={direction} />
        </button>
      </div>)}
    </div>
  </section>
}

function LevelSelect({ completed, returnLevel }: { completed: readonly string[]; returnLevel: string | null }) {
  const selectionRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!returnLevel) return
    const card = selectionRef.current?.querySelector<HTMLAnchorElement>(`a[href="#play/${returnLevel}"]`)
    card?.focus({ preventScroll: true })
    card?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
  }, [returnLevel])

  return <main className="selection-page" ref={selectionRef}>
    <header className="selection-header">
      <h1 className="brand"><span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>modoban<span className="brand-dot">.</span></h1>
    </header>
    {chapters.map(chapter => <ChapterSection key={chapter.number} chapter={chapter} completed={completed} />)}
  </main>
}

function LevelGame({ puzzle, onComplete, onReturn, onNext }: {
  puzzle: ChapterLevel
  onComplete: (id: string) => void
  onReturn: () => void
  onNext?: () => void
}) {
  const [controller] = useState(() => new GameController(puzzle.definition, defaultMotionSettings))
  const [frame, setFrame] = useState(() => controller.frame())
  const [menuOpen, setMenuOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const boardRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDialogElement>(null)
  const won = frame.finished && frame.state.outcome.kind === 'won'
  const failed = frame.finished && (frame.state.outcome.kind === 'dead' || frame.state.outcome.kind === 'loop')

  useEffect(() => { boardRef.current?.focus({ preventScroll: true }) }, [])

  useEffect(() => {
    const menu = menuRef.current
    if (menuOpen) menu?.showModal()
    else menu?.close()
    return () => { menu?.close() }
  }, [menuOpen])

  useEffect(() => {
    if (menuOpen) return
    let animationId: number
    let previous = performance.now()
    const tick = (now: number) => {
      if (controller.isAnimating) setFrame(controller.advance(Math.min(now - previous, 100)))
      previous = now
      animationId = requestAnimationFrame(tick)
    }
    animationId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animationId)
  }, [controller, menuOpen])

  const move = useCallback((direction: Direction) => {
    const result = controller.input(direction)
    setNotice(result === 'blocked' ? '这一步走不通。可以换个方向，或撤销上一步。' : '')
    setFrame(controller.frame())
  }, [controller])

  const undo = useCallback(() => {
    const changed = controller.undo()
    setFrame(controller.frame())
    setNotice(changed ? '已撤销一步。' : '已经回到起点。')
  }, [controller])

  const reset = useCallback(() => {
    controller.reset()
    setFrame(controller.frame())
    setNotice('已重新开始。')
  }, [controller])

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return
      if (event.target instanceof HTMLElement && event.target.matches('input, textarea, select, [contenteditable="true"]')) return
      // The native dialog handles Escape, Enter, and focus while the game is paused.
      if (menuOpen) return
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
      const direction = directionKeys[key]
      if (key === 'Escape' && !event.repeat) {
        event.preventDefault()
        setMenuOpen(true)
      } else if (direction) {
        event.preventDefault()
        move(direction)
      } else if (key === 'z' || key === 'Backspace') {
        event.preventDefault()
        undo()
      } else if (key === 'r' && !event.repeat) {
        event.preventDefault()
        reset()
      } else if (key === 'Enter' && won && !event.repeat && !(event.target instanceof HTMLElement && event.target.closest('button, a'))) {
        event.preventDefault()
        ;(onNext ?? onReturn)()
      }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [menuOpen, move, undo, reset, won, onNext, onReturn])

  useEffect(() => {
    if (won) onComplete(puzzle.definition.id)
  }, [won, puzzle.definition.id, onComplete])

  return <main className={`play-page${won ? ' is-won' : ''}`} aria-label={`第${puzzle.number}关 ${puzzle.title}`}>
    <div className="board-space" ref={boardRef} tabIndex={-1} aria-label="游戏区域，方向键或 WASD 移动，Z 撤销，R 重来，Esc 菜单。">
      <Board3D level={puzzle.definition} frame={frame} exitDirection={puzzle.exitDirection} camera={puzzle.camera} />
    </div>
    <footer className="play-help" aria-label="操作提示">
      {won ? <button className="help-action next-action" onClick={onNext ?? onReturn}><kbd>Enter</kbd><span>{onNext ? '下一关' : '返回关卡选择'}</span><Arrow /></button>
        : <div className="movement-help"><div className="direction-keys" aria-label="移动方向">
          {(['up', 'left', 'down', 'right'] as const).map(direction => <button key={direction} aria-label={{ left: '向左', up: '向上', down: '向下', right: '向右' }[direction]} onClick={() => move(direction)}><Arrow direction={direction} /></button>)}
        </div><span className="wasd-help">/ <kbd>WASD</kbd></span><span className="move-label">移动</span></div>}
      <span className="help-divider" aria-hidden="true" />
      <button className="help-action" onClick={undo} disabled={!controller.canUndo}><kbd>Z</kbd><span>撤销</span></button>
      <button className="help-action" onClick={reset}><kbd>R</kbd><span>重来</span></button>
      <button className="help-action" onClick={() => setMenuOpen(true)} aria-haspopup="dialog"><kbd>Esc</kbd><span>菜单</span></button>
    </footer>
    <p className="sr-only" role="status" aria-live="polite">{won ? `关卡完成。${onNext ? '按 Enter 进入下一关。' : '按 Enter 返回关卡选择。'}` : failed ? '无法继续，按 Z 撤销或 R 重来。' : notice}</p>
    <dialog className="pause-menu" ref={menuRef} aria-label="暂停菜单" onCancel={event => { event.preventDefault(); setMenuOpen(false) }} onClick={event => {
      if (event.target !== event.currentTarget) return
      const bounds = event.currentTarget.getBoundingClientRect()
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setMenuOpen(false)
    }}>
      <button className="return-button" onClick={onReturn}><Arrow direction="left" /><span>返回关卡选择</span></button>
    </dialog>
  </main>
}

function levelFromHash() {
  return allLevels.find(level => window.location.hash === `#play/${level.definition.id}`)
}

function App() {
  useEffect(() => afterPaint(() => { void prepareRenderer().catch(() => { /* The board displays initialization errors. */ }) }), [])
  const [puzzle, setPuzzle] = useState(levelFromHash)
  const [completed, setCompleted] = useState<readonly string[]>([])
  const [returnLevel, setReturnLevel] = useState<string | null>(puzzle?.definition.id ?? null)
  const complete = useCallback((id: string) => setCompleted(previous => previous.includes(id) ? previous : [...previous, id]), [])
  const returnToLevels = useCallback(() => { window.location.hash = 'levels' }, [])

  useEffect(() => {
    const navigate = () => {
      const next = levelFromHash()
      if (next) setReturnLevel(next.definition.id)
      setPuzzle(next)
    }
    window.addEventListener('hashchange', navigate)
    return () => window.removeEventListener('hashchange', navigate)
  }, [])

  useEffect(() => {
    document.title = puzzle ? `${puzzle.number} ${puzzle.title} · Modoban` : 'Modoban · 关卡选择'
  }, [puzzle])

  const next = puzzle ? allLevels[allLevels.indexOf(puzzle) + 1] : undefined
  return puzzle
    ? <LevelGame key={puzzle.definition.id} puzzle={puzzle} onComplete={complete} onReturn={returnToLevels} onNext={next ? () => { window.location.hash = `play/${next.definition.id}` } : undefined} />
    : <LevelSelect completed={completed} returnLevel={returnLevel} />
}

export default App
