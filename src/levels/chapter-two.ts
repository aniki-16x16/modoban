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

const relayRoom = pressureRoom('chapter-2-02', [
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
])

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
  {
    number: '02',
    title: '候场',
    exitDirection: 'right',
    definition: parseLevel({
      ...relayRoom,
      axes: [{ id: 'beat', position: { x: 14, y: 1 }, initialPhase: 0, signals: [false, false, true, true] }],
      doors: [
        ...relayRoom.doors.map(door => ({ ...door, direction: door.id === 'C' || door.id === 'D' ? 'right' : 'left' })),
        { id: 'delivery', position: { x: 11, y: 6 }, direction: 'down', initialExtended: true, inputs: [{ kind: 'pressure', id: 'B' }] },
        { id: 'return-exit', position: { x: 14, y: 8 }, direction: 'left', initialExtended: true, inputs: [{ kind: 'pressure', id: 'D' }] },
        { id: 'relay', position: { x: 8, y: 3 }, direction: 'down', initialExtended: true, inputs: [{ kind: 'axis', id: 'beat' }] },
      ],
    }),
  },
]
