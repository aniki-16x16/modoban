import { parseLevel } from './level.ts'
import { createInitialState, resolveTurn } from './simulation.ts'
import { isDirection } from './state.ts'
import type { Direction, GameState, LevelDefinition, TurnResult } from './types.ts'

export class GameEngine {
  readonly level: LevelDefinition
  private current: GameState
  private readonly initial: GameState
  private readonly history: GameState[] = []

  constructor(definition: unknown) {
    this.level = parseLevel(definition)
    this.initial = createInitialState(this.level)
    this.current = this.initial
  }

  get state(): GameState {
    return this.current
  }

  get canUndo(): boolean {
    return this.history.length > 0
  }

  move(direction: Direction): TurnResult {
    if (!isDirection(direction)) throw new RangeError('Invalid movement direction')
    const result = resolveTurn(this.level, this.current, direction)
    if (result.accepted) {
      this.history.push(this.current)
      this.current = result.state
    }
    return result
  }

  undo(): boolean {
    const previous = this.history.pop()
    if (!previous) return false
    this.current = previous
    return true
  }

  reset(): GameState {
    this.history.length = 0
    this.current = this.initial
    return this.current
  }
}
