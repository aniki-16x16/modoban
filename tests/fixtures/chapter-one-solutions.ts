import type { Direction } from '../../src/engine/index.ts'

const directions: Record<string, Direction> = { u: 'up', r: 'right', d: 'down', l: 'left' }
export const decode = (route: string): Direction[] => [...route].map(key => directions[key])

// One reference solution per level verifies that the map remains completable.
export const chapterOneSolutions: Readonly<Record<string, string>> = {
  'chapter-1-01': 'dllurrdruuuluurdldrrrdrulurdllluulllddrrurddddrrrrdrr',
  'chapter-1-02': 'uuruuurrrrddduuullllddlruulldddddldrrrrrrruuuudddddrruldluudlllllllll',
  'chapter-1-03': 'luulurrrrrrrrlllllddlulurrrluurrrrrrrddllrrrrr',
  'chapter-1-04': 'rrddrddddluruuururrlddddllluruuldurrurrrdddldllluulddrrrurrrdrrr',
  'chapter-1-05': 'rrrrddddllluluurrrurdddddldrrrurdddldrrrrdruuuuuruuullllddrluuurrddrrrrdllldddlllurrllluurrduluuurrrdddddddldrrrrrlluuulluuurrrrddddrrdddlluuuddrrdruudrrr',
}
