import { pressureRoom } from './pressure-room.ts'
import type { ChapterLevel } from './types.ts'

export const chapterThree: readonly ChapterLevel[] = [
  {
    number: '01',
    title: '错步',
    exitDirection: 'right',
    definition: pressureRoom('chapter-3-01', [
      '##########...###',
      '##########...###',
      '##########...###',
      '################',
      '#.....##....####',
      '#..$..a.....####',
      '#...A.##....####',
      '#.@.$.##..B.b.E#',
      '#.....##....####',
      '################',
    ], {
      axes: [{ id: 'beat', position: { x: 11, y: 1 }, initialPhase: 0, signals: [false, true] }],
      mechanisms: [{ id: 'step', kind: 'conveyor', beltId: 'step', position: { x: 3, y: 6 }, direction: 'right' }],
      doors: [
        { id: 'transfer', position: { x: 7, y: 5 }, direction: 'right', initialExtended: true, inputs: [{ kind: 'axis', id: 'beat' }] },
        { id: 'exit-A', position: { x: 13, y: 7 }, direction: 'z-down', initialExtended: true, inputs: [{ kind: 'pressure', id: 'A' }] },
      ],
    }),
  },
]
