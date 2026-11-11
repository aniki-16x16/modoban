import { parseLevel } from '../engine/index.ts'
import type { Direction, LevelDefinition, Position } from '../engine/index.ts'

export interface ChapterLevel {
  readonly number: string
  readonly title: string
  readonly description: string
  readonly introduction: string
  readonly hints: readonly string[]
  readonly completion: string
  readonly exitDirection?: Direction
  readonly definition: LevelDefinition
}

/** Uppercase letters are plates; matching lowercase letters are retracted-by-pressure doors. */
export function pressureRoom(id: string, rows: readonly string[]): LevelDefinition {
  const width = rows[0].length
  const walls: Position[] = []
  const entities: LevelDefinition['entities'][number][] = []
  const mechanisms: LevelDefinition['mechanisms'][number][] = []
  const doors: LevelDefinition['doors'][number][] = []
  let exit: Position | undefined
  for (const [y, row] of rows.entries()) {
    if (row.length !== width) throw new Error(`${id}: inconsistent row width`)
    for (const [x, tile] of [...row].entries()) {
      const position = { x, y }
      if (tile === '#') walls.push(position)
      else if (tile === '@' || tile === '$') {
        entities.push({ id: tile === '@' ? 'player' : `box-${entities.filter(item => item.kind === 'box').length + 1}`, kind: tile === '@' ? 'player' : 'box', position })
      } else if (tile === 'E') exit = position
      else if (/^[A-D]$/.test(tile)) mechanisms.push({ id: tile, kind: 'pressure', position })
      else if (/^[a-d]$/.test(tile)) {
        doors.push({ id: tile.toUpperCase(), position, direction: 'down', initialExtended: true, inputs: [{ kind: 'pressure', id: tile.toUpperCase() }] })
      } else if (tile !== '.') throw new Error(`${id}: unknown tile ${tile}`)
    }
  }
  if (!exit) throw new Error(`${id}: missing exit`)
  return parseLevel({ id, width, height: rows.length, walls, entities, mechanisms, doors, exit, axes: [] })
}

export const chapterOne: readonly ChapterLevel[] = [
  {
    number: '01',
    title: '换班',
    description: '三个开关，两只箱子。',
    introduction: '角色和箱子都能压住压板。压住时，同色门收起；松开后，门重新伸出。',
    hints: [
      '先别急着占住压板。箱子经过门前时，你需要站在哪一格推动它？',
      '金色按钮旁边的两只箱子可能互相挡住。先给要运出去的箱子安排周转位置，再占住金色按钮。',
      '保持金色按钮通路，把另一只箱子运到右上房间的紫色按钮。再回收金色按钮上的箱子，沿左侧房间右边的竖道送到青色按钮。两只箱子的分工可以互换。',
    ],
    completion: '先留出搬运的位置，再让开关接力。',
    definition: pressureRoom('chapter-1-01', [
      '############',
      '#....#.....#',
      '#.#..#..B..#',
      '#.A$.a..#..#',
      '#..#.#..####',
      '#.$@.#######',
      '#....b...###',
      '#...C#...cE#',
      '#....#######',
      '############',
    ]),
  },
  {
    number: '02',
    title: '回程',
    exitDirection: 'left',
    description: '出口，就在出发这一侧。',
    introduction: '所有机关沿用教程关的规则：压住压板，同色门收起；松开后重新伸出。',
    hints: [
      '去的时候能开的门，回来的时候还开着吗？看看压住青色按钮以后，你会留在哪一侧。',
      '紫色按钮的箱子还得去青色按钮。它离开后，谁来替你打开下方的回程通路？带来的箱子也要给推箱站位让路。',
      '先用左边箱子压金色按钮，把右边箱子向下送到紫色按钮。把金色按钮的箱子带进右下方，暂存到通道旁；再把紫色按钮的箱子推回上方的青色按钮，最后让暂存箱接替紫色按钮，从下路返回出口。',
    ],
    completion: '去程之后，还有提前准备好的回程。',
    definition: pressureRoom('chapter-1-02', [
      '##############',
      '###....#...###',
      '###....a...###',
      '###..#.###C###',
      '###..A.###$###',
      '###....###.###',
      '###..$.###B###',
      '###..@.###.###',
      '#Ec....b.....#',
      '###....#.....#',
      '##############',
    ]),
  },
]
