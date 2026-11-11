import { parseLevel } from '../engine/index.ts'
import type { ChapterLevel } from './chapter-one.ts'

// Digits 1–7 are plates A–G; lowercase letters are their doors. E is the exit.
const rows = [
  '########################',
  '#@1a####################',
  '###$..##################',
  '#..$..##################',
  '#.#2#b#.........########',
  '#..#......#.....########',
  '#........3c.....d#######',
  '#.........$#....5#######',
  '#........#$#.###.#######',
  '#.........4....#6#######',
  '######.........#...7####',
  '#######........#....####',
  '#######........e....fgE#',
  '#######........#....####',
  '################....####',
  '########################',
]
const cells = rows.flatMap((row, y) => [...row].map((tile, x) => ({ tile, position: { x, y } })))
const boxes = cells.filter(cell => cell.tile === '$')
const definition = parseLevel({
  id: 'chapter-1-05',
  width: rows[0].length,
  height: rows.length,
  walls: cells.filter(cell => cell.tile === '#').map(cell => cell.position),
  entities: [
    { id: 'player', kind: 'player', position: cells.find(cell => cell.tile === '@')!.position },
    ...boxes.map((cell, index) => ({ id: `box-${index + 1}`, kind: 'box', position: cell.position })),
  ],
  mechanisms: cells.filter(cell => /^[1-7]$/.test(cell.tile)).map(cell => ({
    id: String.fromCharCode(64 + Number(cell.tile)), kind: 'pressure', position: cell.position,
  })),
  doors: cells.filter(cell => /^[a-g]$/.test(cell.tile)).map(cell => ({
    id: cell.tile.toUpperCase(), position: cell.position, direction: 'down', initialExtended: true,
    inputs: [{ kind: 'pressure', id: cell.tile.toUpperCase() }],
  })),
  exit: cells.find(cell => cell.tile === 'E')!.position,
  axes: [],
})

export const chapterFinale: ChapterLevel = {
  number: '05',
  title: '连锁',
  description: '一排箱子，牵动整座工坊。',
  introduction: '门可以同时推动相邻的一排物体。被推动的箱子压住或离开压板后，另一扇门会在同一回合接着响应。',
  hints: [
    '入口已经展示了整排推进与连锁开门。中央竖道里的两只箱子，也不能靠角色逐只向下推。',
    '中央前箱打开玫红色门后，先考虑门格里要装什么，再让它离开压板。原本排在后面的箱子，能接替它的开关任务。',
    '取出入口上方可回收的箱子，送入玫红色门格。中央前箱移开后，门会把货物推上绿色按钮，打开右侧运输口。用中央后箱重新压住玫红色按钮；把前箱运入右侧房间并留出竖道，再从上方把绿色按钮上的货物推出，绕到下方反推到蓝色按钮。另一箱送往橙色按钮。',
  ],
  completion: '第一章完成。你已经能让箱子、开关和门共同完成一条运输路线。',
  definition,
}
