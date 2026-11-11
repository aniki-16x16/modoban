import type { Direction, LevelDefinition } from '../engine/index.ts'

export interface ChapterLevel {
  readonly number: string
  readonly title: string
  readonly exitDirection?: Direction
  readonly definition: LevelDefinition
}

export interface Chapter {
  readonly number: string
  readonly title: string
  readonly levels: readonly ChapterLevel[]
}
