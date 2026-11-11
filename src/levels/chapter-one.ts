import { parseLevel } from '../engine/index.ts'
import type { Direction, LevelDefinition, Position } from '../engine/index.ts'
import { chapterFinale } from './chapter-finale.ts'

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
  {
    number: '03',
    title: '封口',
    description: '门开了，你在哪一边？',
    introduction: '沿用压力板与同色门的规则。两条路通向同一侧，但箱子和角色未必适合走同一条路。',
    hints: [
      '如果先把紫色和青色按钮都压住，门虽然打开了，你还能走到出口那一侧吗？',
      '青色按钮不是第一只箱子的第一个终点。再向前看看，哪个按钮能让你绕到箱子的另一边？',
      '先把一只箱子推过紫色和青色按钮，送到最右边的金色按钮。另一只箱子留在紫色按钮上。角色从上方绕到右侧，再向左把金色按钮上的箱子推回青色按钮，最后向右离场。两只箱子的分工可以互换。',
    ],
    completion: '箱子封住直路之前，先把自己送到另一边。',
    definition: pressureRoom('chapter-1-03', [
      '################',
      '#......a....####',
      '#....######.####',
      '#.....B.C.A.bcE#',
      '#..$.###########',
      '#.$..###########',
      '#..@.###########',
      '################',
    ]),
  },
  {
    number: '04',
    title: '借力',
    description: '站不到的地方，让门推一把。',
    introduction: '门伸出时，会沿伸出方向把占在门格里的角色或箱子向前推一格。门收起时不会把物体拉回来。',
    hints: [
      '入口处，金色门把你向下顶了一格。上方贴墙的箱子也需要这样一推：它上面没有供你站立的位置。',
      '先用另一只箱子保持紫色门收起，把贴墙箱子装进门格，再松开紫色按钮。箱子被推出后，想继续向下推它，你要站在哪里？',
      '把下方箱子推上紫色按钮，向右把上方箱子送进紫色门格。暂时挪开按钮上的箱子，让门向下顶出货物；再把按钮压住，收回门并进入它让出的站位。把货物推到青色按钮后，最后将控制箱送到玫红色按钮。',
    ],
    completion: '门替你推了一步，再为你让出下一步的站位。',
    definition: pressureRoom('chapter-1-04', [
      '##############',
      '#@Aa##########',
      '###.##########',
      '##..#.$.b.####',
      '##.....#.#####',
      '##...#.#.#####',
      '##.B.#....####',
      '##.$....C.cdE#',
      '##.D......####',
      '##############',
    ]),
  },
  chapterFinale,
]
