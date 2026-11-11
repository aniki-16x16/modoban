import { chapterOne } from './chapter-one.ts'
import { chapterTwo } from './chapter-two.ts'
import type { Chapter } from './types.ts'

export type { Chapter, ChapterLevel } from './types.ts'

export const chapters: readonly Chapter[] = [
  { number: '01', title: '压住与让路', levels: chapterOne },
  { number: '02', title: '步数与节拍', levels: chapterTwo },
]

export const allLevels = chapters.flatMap(chapter => chapter.levels)
