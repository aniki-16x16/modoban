export const chapterTwoSolutions = [
  {
    name: 'right box as cargo, side bay staging',
    cargo: 'box-2',
    route: 'rrrdddddruulurrlldddluulurdrrurrrlrrlrrdduullllluldddddldrrrrrrruuuddrrdldluudlllllllll',
  },
  {
    name: 'left box as cargo, upper bay staging',
    cargo: 'box-1',
    route: 'rrrdddddrruldlluulurrrrldddluururrrrlrrdduullllluldddddldrrrrrrrdruluuudddrruldludlllllllll',
  },
] as const

export const chapterTwoStagingSolutions = [
  {
    name: 'protect the first box in the inner upper bay',
    bay: { x: 9, y: 3 },
    recovered: false,
    route: 'uuuuurdrrrrrrdrrrdrrullllldlurullllldlluurdduurrdurrlldddlluulurrrrrrrurdullrrdddlddrrrrr',
  },
  {
    name: 'protect the first box in the outer upper bay and turn the second box below it',
    bay: { x: 10, y: 3 },
    recovered: false,
    route: 'uuuuurdrrrrrrdrrrdrrullllldlurullllldlluurdduurrdurrrlurdlllldddluulurrrrrurdldrrurulrllrrdddlddrrrrr',
  },
  {
    name: 'recover an early delivery into the left bay and refill B from the right',
    bay: { x: 6, y: 5 },
    recovered: true,
    route: 'uuuuurdrrrrrrdrrrdrrullllldlurullllldlluurdduurrdurdrdrrullluldldddluulurrrrrrrurdllllllddrulurrrdrrulrrddlddrrrrr',
  },
] as const
