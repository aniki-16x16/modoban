import type { Direction } from '../../src/engine/index.ts'

const directions: Record<string, Direction> = { u: 'up', r: 'right', d: 'down', l: 'left' }
export const decode = (route: string): Direction[] => [...route].map(key => directions[key])

// 01/03 vary assignments, 02 varies staging, 04 withdraws its control crate up or down.
export const chapterOneSolutions = [
  [
    'dllurrdruuuluurdldrrrdrulurdllluulllddrrurddddrrrrdrr',
    'dluluurrllddruluuurrddrrrdrulurdllluulllddrrurddddrrrrdrr',
  ],
  [
    'uuruuurrrrddduuullllddlruulldddddldrrrrrrruuuudddddrruldluudlllllllll',
    'uuruuurrrrddduuullllddlruulldddddldrrrrrdrruuuuudddddllurdruudlllllllll',
  ],
  [
    'luulurrrrrrrrlllllddlulurrrluurrrrrrrddllrrrrr',
    'uulurrrrrrrllllldddlluulurrrrluurrrrrrrddllrrrrr',
  ],
  [
    'rrddrddddluruuururrlddddllluruuldurrurrrdddldllluulddrrrurrrdrrr',
    'rrddrddddluruuururrldlldldrddluruuururrrdddldllluulddrrrurrrdrrr',
  ],
  [
    'rrrrddddllluluurrrurdddddldrrrurdddldrrrrdruuuuuruuullllddrluuurrddrrrrdllldddlllurrllluurrduluuurrrdddddddldrrrrrlluuulluuurrrrddddrrdddlluuuddrrdruudrrr',
    'rrrrdddrrrrdrluulllldllluluurrrurdddddldrrrurdddldrrrrdruuuuuruulldrrrrdllldddlllurrllluurrduluuurrrdddddddldrrrrrrrdruudllllluuulluuurrrrddddrddluurrdrdrrr',
  ],
] as const

// 05 intentionally seals the final room early, then reopens the bridge without undo.
export const chapterFinaleRecovery = 'rrrrddddllluluurrrurdddddldrrrurdddldrrrrdruuuuuruuullllddrluuurrddrrrrdllldddlllurrllluurrduluuurrrrrrddrddddrddluuuuddddlluullllluluuuuurrrrdddddddldrrrrrlluuulluuurrrrddddrrdddlluuuddrrdruudrrr'
