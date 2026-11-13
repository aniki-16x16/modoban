import { chapterOne } from './chapter-one.ts'
import { chapterTwo } from './chapter-two.ts'
import { chapterThree } from './chapter-three.ts'
import type { Chapter } from './types.ts'

export type { Chapter, ChapterLevel } from './types.ts'

export const chapters: readonly Chapter[] = [
  { number: '01', title: '压住与让路', levels: chapterOne },
  { number: '02', title: '步数与节拍', levels: chapterTwo },
  { number: '03', title: '错位与转运', levels: chapterThree },
]

export const allLevels = chapters.flatMap(chapter => chapter.levels)
