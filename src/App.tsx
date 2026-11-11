import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent } from 'react'
import { GameController } from './engine/index.ts'
import type { Direction, LevelDefinition, PlaybackFrame } from './engine/index.ts'
import { chapterOne } from './levels/chapter-one.ts'
import type { ChapterLevel } from './levels/chapter-one.ts'
import { defaultMotionSettings, playerScale } from './motion.ts'
import './style.css'

const tile = 64
const circuitColors = ['#b17c28', '#7a6aa6', '#357f86', '#b45965', '#57884d', '#4f83b5', '#c56b32']
// Colors follow connected controls, independent of the names assigned to doors.
function circuitPalette(level: LevelDefinition) {
  const groups: Set<string>[] = []
  for (const door of level.doors) {
    const group = new Set([`door:${door.id}`, ...door.inputs.map(input => `${input.kind}:${input.id}`)])
    for (let i = groups.length - 1; i >= 0; i -= 1) {
      if ([...groups[i]].some(key => group.has(key))) {
        for (const key of groups[i]) group.add(key)
        groups.splice(i, 1)
      }
    }
    groups.push(group)
  }
  for (const mechanism of level.mechanisms) {
    const key = `${mechanism.kind}:${mechanism.id}`
    if (!groups.some(group => group.has(key))) groups.push(new Set([key]))
  }
  const colors = new Map<string, string>()
  groups.sort((a, b) => [...a].sort()[0].localeCompare([...b].sort()[0]))
  groups.forEach((group, index) => {
    const color = circuitColors[index] ?? `hsl(${index * 137.508 % 360} 45% 45%)`
    group.forEach(key => colors.set(key, color))
  })
  return (kind: string, id: string) => colors.get(`${kind}:${id}`) ?? circuitColors[0]
}

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

function Gate({ color, extension, direction }: { color: string; extension: number; direction: Direction }) {
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

function Board({ level, frame, exitDirection = 'right' }: { level: LevelDefinition; frame: PlaybackFrame; exitDirection?: Direction }) {
  const colorFor = circuitPalette(level)
  const walls = new Set(level.walls.map(p => `${p.x},${p.y}`))
  const floors = []
  for (let y = 0; y < level.height; y += 1) {
    for (let x = 0; x < level.width; x += 1) {
      if (!walls.has(`${x},${y}`)) floors.push(<rect key={`${x},${y}`} x={x * tile + 1} y={y * tile + 1} width={62} height={62} rx={3} className="floor-tile" />)
    }
  }
  return <svg className="board" viewBox={`0 0 ${level.width * tile} ${level.height * tile}`} role="img" aria-label={`关卡地图，${level.width}列${level.height}行。圆形是角色，木箱可推动，凸起的圆形按钮是压力板，同色半透明矩形是它控制的门，箭头是出口。`}>
    <defs>
      <pattern id="wall-pattern" width="16" height="16" patternUnits="userSpaceOnUse">
        <path d="m0 16 16-16M-4 4 4-4m8 24 8-8" stroke="#fff" strokeOpacity=".035" strokeWidth="1" />
      </pattern>
      <filter id="piece-shadow" x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0" dy="3" stdDeviation="2" floodColor="#1e3029" floodOpacity=".18" />
      </filter>
    </defs>
    <rect width={level.width * tile} height={level.height * tile} fill="#293f37" rx="14" />
    <rect width={level.width * tile} height={level.height * tile} fill="url(#wall-pattern)" rx="14" />
    {floors}
    <g transform={`translate(${level.exit.x * tile}, ${level.exit.y * tile})`}>
      <rect x="8" y="8" width="48" height="48" rx="10" fill="#d4e5d2" />
      <path d="M20 32h24m-9-9 9 9-9 9" transform={`rotate(${{ right: 0, down: 90, left: 180, up: 270 }[exitDirection]},32,32)`} fill="none" stroke="#4f7852" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </g>
    {level.mechanisms.map(plate => {
      const active = frame.state.pressures.find(item => item.id === plate.id)?.active
      const color = colorFor(plate.kind, plate.id)
      return <g key={plate.id} transform={`translate(${plate.position.x * tile + 32}, ${plate.position.y * tile + 32})`}>
        <PressureButton color={color} active={active} />
      </g>
    })}
    {level.doors.map(door => {
      const motion = frame.doors.find(item => item.doorId === door.id)
      const extension = motion?.extension ?? Number(frame.state.doors.find(item => item.id === door.id)?.extended)
      return <g key={door.id} transform={`translate(${door.position.x * tile}, ${door.position.y * tile})`}>
        <Gate color={colorFor('door', door.id)} extension={extension} direction={door.direction} />
      </g>
    })}
    {frame.state.entities.map(entity => {
      const motion = frame.entities.find(item => item.entityId === entity.id)
      const position = motion?.position ?? entity.position
      if (!position) return null
      const plate = level.mechanisms.find(item => item.position.x === position.x && item.position.y === position.y)
      const scale = playerScale(motion)
      return <g key={entity.id} transform={`translate(${position.x * tile + 32}, ${position.y * tile + 32})`} filter="url(#piece-shadow)">
        {entity.kind === 'player' ? <g className="player-body" transform={`scale(${scale.x}, ${scale.y})`}>
          <circle cy="2" r="20" fill="#a34532" />
          <circle cy="-1" r="20" fill="#df7955" stroke="#f8c5a4" strokeWidth="1.5" />
          <circle cx="-6" cy="-4" r="2.4" fill="#53382d" />
          <circle cx="6" cy="-4" r="2.4" fill="#53382d" />
          <path d="M-5 5q5 5 10 0" stroke="#53382d" strokeWidth="1.8" strokeLinecap="round" fill="none" />
        </g> : <>
          <rect x="-23" y="-20" width="46" height="45" rx="7" fill="#8f6039" />
          <rect x="-23" y="-24" width="46" height="45" rx="7" fill="#c99b64" stroke="#edc994" strokeWidth="2" />
          <path d="M-16-17 16 14m0-31L-16 14" stroke="#97683f" strokeWidth="5" strokeLinecap="round" />
          <rect x="-17" y="-18" width="34" height="33" rx="2" fill="none" stroke="#e9c28a" strokeWidth="2" />
        </>}
        {plate && <g transform="translate(19, 19)">
          <circle r="10" fill={colorFor(plate.kind, plate.id)} stroke="#fff7e8" strokeWidth="1.5" />
        </g>}
      </g>
    })}
  </svg>
}

function LevelPreview({ level, exitDirection = 'right' }: { level: LevelDefinition; exitDirection?: Direction }) {
  const colorFor = circuitPalette(level)
  const walls = new Set(level.walls.map(position => `${position.x},${position.y}`))
  return <svg className="level-preview" viewBox={`-1 -1 ${level.width + 2} ${level.height + 2}`} fill="none" aria-hidden="true">
    {Array.from({ length: level.width * level.height }, (_, index) => {
      const x = index % level.width
      const y = Math.floor(index / level.width)
      return walls.has(`${x},${y}`) ? null : <rect key={index} x={x + .04} y={y + .04} width=".92" height=".92" rx=".1" fill="#dce1cf" stroke="#cdd5bf" strokeWidth=".025" />
    })}
    {level.mechanisms.map(plate => <g key={plate.id} transform={`translate(${plate.position.x + .5}, ${plate.position.y + .5}) scale(${1 / tile})`}>
      <PressureButton color={colorFor(plate.kind, plate.id)} />
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

function LevelSelect({ completed, returnLevel }: { completed: readonly string[]; returnLevel: string | null }) {
  const selectionRef = useRef<HTMLElement>(null)
  const dragRef = useRef<{ pointerId: number; startX: number; scrollLeft: number; dragging: boolean } | null>(null)
  const suppressClickRef = useRef(false)
  const [dragging, setDragging] = useState(false)
  useEffect(() => {
    if (!returnLevel) return
    const card = selectionRef.current?.querySelector<HTMLAnchorElement>(`a[href="#play/${returnLevel}"]`)
    card?.focus({ preventScroll: true })
    card?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
  }, [returnLevel])

  const finishDrag = (event: PointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return <main className="selection-page" ref={selectionRef}>
    <header className="selection-header">
      <h1 className="brand"><span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>modoban<span className="brand-dot">.</span></h1>
    </header>
    <section className="chapter" aria-labelledby="chapter-title">
      <div className="chapter-heading">
        <span className="chapter-index">01</span>
        <h2 id="chapter-title">压住与让路</h2>
      </div>
      <nav className={`level-list${dragging ? ' is-dragging' : ''}`} aria-label="第一章关卡"
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
        {chapterOne.map(level => {
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
    </section>
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
  const touchStart = useRef<{ x: number; y: number } | null>(null)
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

  return <main className={`play-page${won ? ' is-won' : ''}`} aria-label={`第${puzzle.number}关 ${puzzle.title}`} style={{ '--board-ratio': puzzle.definition.width / puzzle.definition.height, '--board-width': `${puzzle.definition.width * tile}px` } as CSSProperties}>
    <div className="board-space" ref={boardRef} tabIndex={-1} aria-label="游戏区域，方向键或 WASD 移动，Z 撤销，R 重来，Esc 菜单。触屏可滑动地图移动。"
      onTouchStart={event => {
        if (menuOpen || event.touches.length !== 1) { touchStart.current = null; return }
        touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }
      }}
      onTouchCancel={() => { touchStart.current = null }}
      onTouchEnd={event => {
        const start = touchStart.current
        touchStart.current = null
        if (!start || menuOpen) return
        const dx = event.changedTouches[0].clientX - start.x
        const dy = event.changedTouches[0].clientY - start.y
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return
        move(Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'down' : 'up')
      }}>
      <Board level={puzzle.definition} frame={frame} exitDirection={puzzle.exitDirection} />
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
  return chapterOne.find(level => window.location.hash === `#play/${level.definition.id}`)
}

function App() {
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

  const next = puzzle ? chapterOne[chapterOne.indexOf(puzzle) + 1] : undefined
  return puzzle
    ? <LevelGame key={puzzle.definition.id} puzzle={puzzle} onComplete={complete} onReturn={returnToLevels} onNext={next ? () => { window.location.hash = `play/${next.definition.id}` } : undefined} />
    : <LevelSelect completed={completed} returnLevel={returnLevel} />
}

export default App
