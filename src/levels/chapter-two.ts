import { pressureRoom } from './pressure-room.ts'
import type { ChapterLevel } from './types.ts'

export const chapterTwo: readonly ChapterLevel[] = [
  {
    number: '01',
    title: '合拍',
    exitDirection: 'left',
    definition: pressureRoom('chapter-2-01', [
      '###############',
      '#@...#######.##',
      '####..#########',
      '##..A...a..####',
      '##....####C####',
      '##.$.$.###.####',
      '##.....###B####',
      '###...####....#',
      '#Ec.....b.....#',
      '###...####....#',
      '###############',
    ], {
      axes: [{ id: 'beat', position: { x: 12, y: 1 }, initialPhase: 0, signals: [false, false, true, true] }],
      doorDirections: { A: 'right', B: 'right', C: 'left' },
      doors: [
        { id: 'return-exit', position: { x: 3, y: 8 }, direction: 'right', initialExtended: true, inputs: [{ kind: 'pressure', id: 'B' }] },
        { id: 'entry', position: { x: 4, y: 1 }, direction: 'down', initialExtended: true, inputs: [{ kind: 'axis', id: 'beat' }] },
        { id: 'loader', position: { x: 10, y: 3 }, direction: 'down', initialExtended: true, inputs: [{ kind: 'axis', id: 'beat' }] },
      ],
    }),
  },
  {
    number: '02',
    title: '候场',
    exitDirection: 'right',
    definition: pressureRoom('chapter-2-02', [
      '#################',
      '##############.##',
      '#################',
      '###.$Ac.....#####',
      '###.....B...#...#',
      '###....#....a.$.#',
      '###.C..##...#...#',
      '###.....d..D#####',
      '###@...##...b..E#',
      '#################',
    ], {
      axes: [{ id: 'beat', position: { x: 14, y: 1 }, initialPhase: 0, signals: [false, false, true, true] }],
      doorDirections: { A: 'left', B: 'left', C: 'right', D: 'right' },
      doors: [
        { id: 'delivery', position: { x: 11, y: 6 }, direction: 'down', initialExtended: true, inputs: [{ kind: 'pressure', id: 'B' }] },
        { id: 'return-exit', position: { x: 14, y: 8 }, direction: 'left', initialExtended: true, inputs: [{ kind: 'pressure', id: 'D' }] },
        { id: 'relay', position: { x: 8, y: 3 }, direction: 'down', initialExtended: true, inputs: [{ kind: 'axis', id: 'beat' }] },
      ],
    }),
  },
  {
    number: '03',
    title: '接驳',
    exitDirection: 'right',
    definition: pressureRoom('chapter-2-03', [
      '####################',
      '###############.####',
      '####################',
      '##.......a.....#...#',
      '##..$..#####...b.$.#',
      '##...........B.#...#',
      '##.....#####...#####',
      '##...A.#####....####',
      '##.@...#######D..dE#',
      '####################',
    ], {
      axes: [{ id: 'beat', position: { x: 15, y: 1 }, initialPhase: 0, signals: [false, false, true, true] }],
      doorDirections: { A: 'right', B: 'left', D: 'right' },
      doors: [
        { id: 'outbound', position: { x: 8, y: 5 }, direction: 'right', initialExtended: true, inputs: [{ kind: 'axis', id: 'beat' }] },
        { id: 'inbound', position: { x: 11, y: 5 }, direction: 'left', initialExtended: false, inputs: [{ kind: 'axis', id: 'beat' }] },
        { id: 'delivery', position: { x: 14, y: 7 }, direction: 'down', initialExtended: true, inputs: [{ kind: 'pressure', id: 'A' }] },
        { id: 'exit-A', position: { x: 16, y: 8 }, direction: 'right', initialExtended: true, inputs: [{ kind: 'pressure', id: 'A' }] },
      ],
    }),
  },
]
