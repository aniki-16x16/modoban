import { useCallback, useEffect, useState } from 'react'
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

function Board({ level, frame, connections, exitDirection = 'right' }: { level: LevelDefinition; frame: PlaybackFrame; connections: boolean; exitDirection?: Direction }) {
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
    {connections && level.mechanisms.map(plate => {
      const door = level.doors.find(item => item.inputs.some(input => input.kind === 'pressure' && input.id === plate.id))
      if (!door) return null
      return <path key={plate.id} d={`M${plate.position.x * tile + 32},${plate.position.y * tile + 32} L${door.position.x * tile + 32},${door.position.y * tile + 32}`} stroke={circuitColors[circuitNumber(plate.id) - 1]} strokeWidth="3" strokeDasharray="5 7" opacity=".7" pointerEvents="none" />
    })}
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

function LevelGame({ puzzle, completed, onComplete, onNext }: {
  puzzle: ChapterLevel
  completed: boolean
  onComplete: (id: string) => void
  onNext?: () => void
}) {
  const [controller] = useState(() => new GameController(puzzle.definition, defaultMotionSettings))
  const [frame, setFrame] = useState(() => controller.frame())
  const [hintCount, setHintCount] = useState(0)
  const [connections, setConnections] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let animationId: number
    let previous = performance.now()
    const tick = (now: number) => {
      if (controller.isAnimating) setFrame(controller.advance(Math.min(now - previous, 100)))
      previous = now
      animationId = requestAnimationFrame(tick)
    }
    animationId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animationId)
  }, [controller])

  const move = useCallback((direction: Direction) => {
    const result = controller.input(direction)
    if (result === 'blocked') setNotice('这一步走不通。可以换个方向，或撤销上一步。')
    else setNotice('')
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
      if (event.target instanceof HTMLElement && event.target.matches('input:not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable="true"]')) return
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
      const direction = directionKeys[key]
      if (direction) {
        event.preventDefault()
        move(direction)
      } else if (key === 'z' || key === 'Backspace') {
        event.preventDefault()
        undo()
      } else if (key === 'r' && !event.repeat) {
        event.preventDefault()
        reset()
      }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [move, undo, reset])

  const won = frame.finished && frame.state.outcome.kind === 'won'
  const failed = frame.finished && (frame.state.outcome.kind === 'dead' || frame.state.outcome.kind === 'loop')
  useEffect(() => {
    if (won) onComplete(puzzle.definition.id)
  }, [won, puzzle.definition.id, onComplete])

  return <div className="play-layout">
    <section className="play-panel" aria-label={`第${puzzle.number}关 ${puzzle.title}`}>
      <div className="play-heading">
        <div className="level-name"><span className="level-number">{puzzle.number}</span><h2>{puzzle.title}</h2></div>
        <div className="turn-count"><span>{frame.state.turn.toString().padStart(2, '0')}</span> 步</div>
      </div>
      <div className="board-space" tabIndex={0} aria-label="游戏区域，使用方向键或 WASD 移动，Z 撤销，R 重来">
        <Board level={puzzle.definition} frame={frame} connections={connections} exitDirection={puzzle.exitDirection} />
      </div>
      <div className="board-toolbar">
        <div className="action-group">
          <button onClick={undo} disabled={!controller.canUndo}><span aria-hidden="true">↶</span> 撤销 <kbd>Z</kbd></button>
          <button onClick={reset}><span aria-hidden="true">↻</span> 重来 <kbd>R</kbd></button>
        </div>
        <label className="connection-toggle"><input type="checkbox" checked={connections} onChange={event => setConnections(event.target.checked)} /> 显示机关连接</label>
      </div>
      <div className="movement-controls" aria-label="方向控制">
        {(['left', 'up', 'down', 'right'] as const).map(direction => <button key={direction} aria-label={{ left: '向左', up: '向上', down: '向下', right: '向右' }[direction]} onClick={() => move(direction)}><Arrow direction={direction} /></button>)}
      </div>
      <p className="keyboard-help"><span>↑ ↓ ← →</span> / WASD 移动 <i /> 每一步都可以撤销</p>
      <p className="sr-only" role="status" aria-live="polite">{notice}</p>
    </section>

    <aside className="guide-panel">
      <div className="guide-label"><span className="tiny-square" /> {puzzle.number === '01' ? '认识机关' : '试着组合'}</div>
      <h3>{puzzle.description}</h3>
      <p className="introduction">{puzzle.introduction}</p>
      <div className="circuit-list" aria-label="机关状态">
        {puzzle.definition.mechanisms.toSorted((a, b) => circuitNumber(a.id) - circuitNumber(b.id)).map(plate => {
          const active = frame.state.pressures.find(item => item.id === plate.id)?.active
          const extended = frame.state.doors.find(item => item.id === plate.id)?.extended
          const number = circuitNumber(plate.id)
          return <div className={`circuit-row${active ? ' active' : ''}`} key={plate.id} style={{ '--circuit-color': circuitColors[number - 1] } as CSSProperties}>
            <span className="circuit-badge">{number}</span>
            <div><strong>压板 {number}</strong><span>{active ? '已压住' : '未压住'}</span></div>
            <span className="circuit-arrow">→</span>
            <div><strong>门 {number}</strong><span>{extended ? '伸出' : '收起'}</span></div>
            <span className={`signal-dot${active ? ' on' : ''}`} />
          </div>
        })}
      </div>
      <div className="goal-note"><span className="exit-icon"><Arrow /></span><p>走到出口即可通关。<br /><span>箱子没有指定的最终位置。</span></p></div>

      {won ? <div className="result-card" role="status">
        <span className="result-eyebrow">关卡完成</span>
        <h3>顺利抵达。</h3>
        <p>{puzzle.completion}</p>
        {onNext ? <button className="primary-button" onClick={onNext}>继续 · 下一关 <Arrow /></button> : <button className="primary-button" onClick={reset}>再试一次 <span aria-hidden="true">↻</span></button>}
      </div> : failed ? <div className="result-card failure" role="alert"><h3>试试另一种安排</h3><p>可以撤销，回到刚才的局面。</p><button className="primary-button" onClick={undo}>撤销一步</button></div> : <div className="hint-area">
        <div className="hint-heading"><span>需要一点提示？</span><span>{hintCount} / {puzzle.hints.length}</span></div>
        {puzzle.hints.slice(0, hintCount).map((hint, index) => <p className="hint" key={hint}><span>{index + 1}</span>{hint}</p>)}
        <button className="hint-button" onClick={() => setHintCount(count => Math.min(count + 1, puzzle.hints.length))} disabled={hintCount === puzzle.hints.length}>{hintCount === 0 ? '给我一点线索' : hintCount === puzzle.hints.length ? '提示已全部展开' : '再给一点提示'} <span aria-hidden="true">+</span></button>
      </div>}
      {completed && !won && <p className="replay-note">这关已完成，随时可以再试。</p>}
    </aside>
  </div>
}

function App() {
  const [activeLevel, setActiveLevel] = useState(0)
  const [completed, setCompleted] = useState<readonly string[]>([])
  const complete = useCallback((id: string) => setCompleted(previous => previous.includes(id) ? previous : [...previous, id]), [])
  const puzzle = chapterOne[activeLevel]
  return <main className="app-shell">
    <header className="site-header">
      <a className="brand" href="./" aria-label="Modoban 首页"><span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>modoban<span className="brand-dot">.</span></a>
      <span className="header-note">一步一机关</span>
      <span className="chapter-progress">{completed.length} <span>/ 02 完成</span></span>
    </header>
    <div className="chapter-heading"><div><p className="eyebrow">CHAPTER 01 <span>—</span> 压力板与伸缩门</p><h1>压住与让路</h1><p className="chapter-description">留住一个开关，给自己腾出一条路。</p></div><div className="chapter-stamp" aria-hidden="true">01<span>第一章</span></div></div>
    <nav className="level-tabs" aria-label="第一章关卡">
      {chapterOne.map((level, index) => <button key={level.definition.id} className={`level-tab${index === activeLevel ? ' selected' : ''}`} aria-current={index === activeLevel ? 'step' : undefined} onClick={() => setActiveLevel(index)}><span>{level.number}</span><strong>{level.title}</strong>{completed.includes(level.definition.id) ? <span className="tab-status" aria-label="已完成">✓</span> : <span className="tab-dot" />}</button>)}
      <span className="chapter-caption">小小的机关，也有两难的安排。</span>
    </nav>
    <LevelGame key={puzzle.definition.id} puzzle={puzzle} completed={completed.includes(puzzle.definition.id)} onComplete={complete} onNext={activeLevel + 1 < chapterOne.length ? () => setActiveLevel(activeLevel + 1) : undefined} />
    <footer className="site-footer"><span>MODULO + SOKOBAN</span><span>慢慢想，不计时。</span></footer>
  </main>
}

export default App
