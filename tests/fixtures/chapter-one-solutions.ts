import type { Direction } from '../../src/engine/index.ts'

const directions: Record<string, Direction> = { u: 'up', r: 'right', d: 'down', l: 'left' }
export const decode = (route: string): Direction[] => [...route].map(key => directions[key])

// 01 varies crate assignments; 02 varies the replacement crate's staging pocket.
export const chapterOneSolutions = [
  [
    'dllurrdruuuluurdldrrrdrulurdllluulllddrrurddddrrrrdrr',
    'dluluurrllddruluuurrddrrrdrulurdllluulllddrrurddddrrrrdrr',
  ],
  [
    'uuruuurrrrddduuullllddlruulldddddldrrrrrrruuuudddddrruldluudlllllllll',
    'uuruuurrrrddduuullllddlruulldddddldrrrrrdrruuuuudddddllurdruudlllllllll',
  ],
] as const
