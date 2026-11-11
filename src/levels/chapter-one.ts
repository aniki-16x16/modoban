import { parseLevel } from '../engine/index.ts'
import type { Direction, LevelDefinition, Position } from '../engine/index.ts'

export interface ChapterLevel {
  readonly number: string
  readonly title: string
  readonly exitDirection?: Direction
  readonly definition: LevelDefinition
}

/** A–D and 1–7 (A–G) are plates; matching lowercase letters are retracted-by-pressure doors. */
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
      else if (/^[A-D1-7]$/.test(tile)) {
        const id = /^[1-7]$/.test(tile) ? String.fromCharCode(64 + Number(tile)) : tile
        mechanisms.push({ id, kind: 'pressure', position })
      } else if (/^[a-g]$/.test(tile)) {
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
  {
    number: '05',
    title: '连锁',
    definition: pressureRoom('chapter-1-05', [
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
    ]),
  },
]
