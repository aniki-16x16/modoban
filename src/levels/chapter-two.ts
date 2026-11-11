import { parseLevel } from '../engine/index.ts'
import { pressureRoom } from './pressure-room.ts'
import type { ChapterLevel } from './types.ts'

const rows = [
  '###############',
  '#@..t#######O##',
  '####..#########',
  '##..A...a.u####',
  '##....####C####',
  '##.$.$.###.####',
  '##.....###B####',
  '###...####....#',
  '#Ecv....b.....#',
  '###...####....#',
  '###############',
]

const room = pressureRoom('chapter-2-01', rows.map(row => row.replace(/[Otuv]/g, '.')))

export const chapterTwo: readonly ChapterLevel[] = [
  {
    number: '01',
    title: '合拍',
    exitDirection: 'left',
    definition: parseLevel({
      ...room,
      axes: [{ id: 'beat', position: { x: 12, y: 1 }, initialPhase: 0, signals: [false, false, true, true] }],
      doors: [
        ...room.doors.map(door => ({ ...door, direction: door.id === 'C' ? 'left' : 'right' })),
        { id: 'return-exit', position: { x: 3, y: 8 }, direction: 'right', initialExtended: true, inputs: [{ kind: 'pressure', id: 'B' }] },
        { id: 'entry', position: { x: 4, y: 1 }, direction: 'down', initialExtended: true, inputs: [{ kind: 'axis', id: 'beat' }] },
        { id: 'loader', position: { x: 10, y: 3 }, direction: 'down', initialExtended: true, inputs: [{ kind: 'axis', id: 'beat' }] },
      ],
    }),
  },
]
