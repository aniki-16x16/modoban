import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { GameController } from './engine/index.ts'
import type { Direction, LevelDefinition, PlaybackFrame } from './engine/index.ts'
import { chapterOne } from './levels/chapter-one.ts'
import type { ChapterLevel } from './levels/chapter-one.ts'
import { defaultMotionSettings, playerScale } from './motion.ts'
import './style.css'

const tile = 64
const circuitColors = ['#b17c28', '#7a6aa6', '#357f86', '#b45965']
const circuitNumber = (id: string) => id.charCodeAt(0) - 64
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
  const walls = new Set(level.walls.map(p => `${p.x},${p.y}`))
  const floors = []
  for (let y = 0; y < level.height; y += 1) {
    for (let x = 0; x < level.width; x += 1) {
      if (!walls.has(`${x},${y}`)) floors.push(<rect key={`${x},${y}`} x={x * tile + 1} y={y * tile + 1} width={62} height={62} rx={3} className="floor-tile" />)
    }
  }
  return <svg className="board" viewBox={`0 0 ${level.width * tile} ${level.height * tile}`} role="img" aria-label={`关卡地图，${level.width}列${level.height}行。圆形是角色，木箱可推动，数字圆盘是压板，同号栅门是它控制的门，箭头是出口。`}>
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
      <text x="32" y="61" textAnchor="middle" fontSize="8" fill="#486749" letterSpacing="2">出口</text>
    </g>
    {level.mechanisms.map(plate => {
      const active = frame.state.pressures.find(item => item.id === plate.id)?.active
      const color = circuitColors[circuitNumber(plate.id) - 1]
      return <g key={plate.id} transform={`translate(${plate.position.x * tile + 32}, ${plate.position.y * tile + 32})`}>
        <circle r="24" fill={active ? color : '#e8ddc8'} stroke={color} strokeWidth="2" />
        <circle r="19" fill="none" stroke={active ? '#fff' : color} strokeWidth="1" opacity=".4" />
        <text textAnchor="middle" dominantBaseline="central" fontSize="20" fontWeight="600" fill={active ? '#fffaf0' : color}>{circuitNumber(plate.id)}</text>
        {active && <circle r="28" fill="none" stroke={color} strokeWidth="1" opacity=".35" />}
      </g>
    })}
    {level.doors.map(door => {
      const motion = frame.doors.find(item => item.doorId === door.id)
      const extension = motion?.extension ?? Number(frame.state.doors.find(item => item.id === door.id)?.extended)
      const color = circuitColors[circuitNumber(door.id) - 1]
      return <g key={door.id} transform={`translate(${door.position.x * tile}, ${door.position.y * tile})`}>
        <rect x="6" y="7" width="52" height="50" rx="5" fill={color} opacity=".09" stroke={color} strokeDasharray="3 4" />
        <rect x="5" y="3" width="54" height="7" rx="3" fill={color} />
        <g opacity={Math.min(1, extension * 2)}>
          {[13, 25, 37, 49].map(x => <rect key={x} x={x - 3} y="8" width="6" height={Math.max(0, extension * 45)} rx="2" fill={color} />)}
          <rect x="9" y={5 + extension * 44} width="46" height="6" rx="2" fill={color} />
        </g>
        <circle cx="51" cy="13" r="10" fill={color} stroke="#f7edda" strokeWidth="1.5" />
        <text x="51" y="13" textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="700" fill="#fffaf0">{circuitNumber(door.id)}</text>
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
          <circle r="10" fill={circuitColors[circuitNumber(plate.id) - 1]} stroke="#fff7e8" strokeWidth="1.5" />
          <text textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="700" fill="white">{circuitNumber(plate.id)}</text>
        </g>}
      </g>
    })}
  </svg>
}

function LevelPreview({ level, exitDirection = 'right' }: { level: LevelDefinition; exitDirection?: Direction }) {
  const walls = new Set(level.walls.map(position => `${position.x},${position.y}`))
  return <svg className="level-preview" viewBox={`-1 -1 ${level.width + 2} ${level.height + 2}`} fill="none" aria-hidden="true">
    {Array.from({ length: level.width * level.height }, (_, index) => {
      const x = index % level.width
      const y = Math.floor(index / level.width)
      return walls.has(`${x},${y}`) ? null : <rect key={index} x={x + .04} y={y + .04} width=".92" height=".92" rx=".1" fill="#dce1cf" stroke="#cdd5bf" strokeWidth=".025" />
    })}
    {level.mechanisms.map(plate => <circle key={plate.id} cx={plate.position.x + .5} cy={plate.position.y + .5} r=".3" stroke={circuitColors[circuitNumber(plate.id) - 1]} strokeWidth=".07" />)}
    {level.doors.map(door => <path key={door.id} className="preview-gate" d={`M${door.position.x + .2} ${door.position.y + .2}h.6m-.5 0v.6m.2-.6v.6m.2-.6v.6`} stroke={circuitColors[circuitNumber(door.id) - 1]} strokeWidth=".07" strokeLinecap="round" />)}
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
  useEffect(() => {
    if (returnLevel) selectionRef.current?.querySelector<HTMLAnchorElement>(`a[href="#play/${returnLevel}"]`)?.focus({ preventScroll: true })
  }, [returnLevel])

  return <main className="selection-page" ref={selectionRef}>
    <header className="selection-header">
      <h1 className="brand"><span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>modoban<span className="brand-dot">.</span></h1>
    </header>
    <section className="chapter" aria-labelledby="chapter-title">
      <div className="chapter-heading">
        <div>
          <p className="eyebrow">CHAPTER 01 <span>压力板与伸缩门</span></p>
          <h2 id="chapter-title">压住与让路<span className="heading-dot" aria-hidden="true">.</span></h2>
          <p className="chapter-description">留住一个开关，给自己腾出一条路。</p>
        </div>
        <div className="chapter-index" aria-hidden="true">01</div>
      </div>
      <div className="chapter-meta"><span>第一章 <i /> {chapterOne.length.toString().padStart(2, '0')} 个关卡</span><span>{completed.length.toString().padStart(2, '0')} / {chapterOne.length.toString().padStart(2, '0')} 已完成</span></div>
      <nav className="level-grid" aria-label="第一章关卡">
        {chapterOne.map(level => {
          const cleared = completed.includes(level.definition.id)
          return <a key={level.definition.id} href={`#play/${level.definition.id}`} className={`level-card${cleared ? ' is-complete' : ''}`}>
            <div className="level-art">
              <span className="art-corner corner-top" />
              <LevelPreview level={level.definition} exitDirection={level.exitDirection} />
              <span className="art-corner corner-bottom" />
              <span className="art-number">{level.number}</span>
              {cleared && <span className="completion-badge"><span aria-hidden="true">✓</span> 已完成</span>}
            </div>
            <div className="level-info">
              <div className="level-card-heading"><span className="level-number">{level.number}</span><h3>{level.title}</h3><span className="level-enter" aria-label={cleared ? '重新游玩' : '开始游玩'}><Arrow /></span></div>
              <p>{level.description}</p>
              <div className="level-details"><span>{level.definition.entities.filter(entity => entity.kind === 'box').length} 只箱子</span><i /><span>{level.definition.mechanisms.length} 组机关</span></div>
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
