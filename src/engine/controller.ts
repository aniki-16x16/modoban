import { GameEngine } from './engine.ts'
import { createAnimationPlan, sampleAnimation } from './playback.ts'
import type { AnimationOptions, AnimationPlan, PlaybackFrame } from './playback.ts'
import { freeze, isDirection } from './state.ts'
import type { Direction, GameState, LevelDefinition } from './types.ts'

export type InputResult = 'started' | 'buffered' | 'blocked' | 'finished'

export interface ControllerOptions extends AnimationOptions {
  readonly finishWithinMs?: number
}

/** The host supplies frame deltas; no DOM, timers, or rendering framework is required. */
export class GameController {
  private readonly engine: GameEngine
  private readonly options: ControllerOptions
  private plan: AnimationPlan | null = null
  private elapsed = 0
  private speed = 1
  private pending: Direction | null = null

  constructor(definition: unknown, options: ControllerOptions = {}) {
    const finishWithinMs = options.finishWithinMs ?? 32
    if (!Number.isFinite(finishWithinMs) || finishWithinMs <= 0) throw new RangeError('finishWithinMs must be positive and finite')
    this.options = freeze({ ...options, finishWithinMs })
    // Validate animation parameters even if the first movement is blocked.
    for (const key of ['movementMs', 'doorMs', 'clockMs'] as const) {
      const value = options[key]
      if (value !== undefined && (!Number.isFinite(value) || value < 0)) throw new RangeError(`${key} must be finite and nonnegative`)
    }
    this.engine = new GameEngine(definition)
  }

  get isAnimating(): boolean {
    return this.plan !== null
  }

  get state(): GameState {
    return this.engine.state
  }

  get level(): LevelDefinition {
    return this.engine.level
  }

  get canUndo(): boolean {
    return this.engine.canUndo
  }

  get pendingDirection(): Direction | null {
    return this.pending
  }

  get animation(): AnimationPlan | null {
    return this.plan
  }

  frame(): PlaybackFrame {
    if (this.plan) return sampleAnimation(this.plan, this.elapsed)
    return freeze({ state: this.engine.state, entities: [], doors: [], elapsedMs: 0, finished: true })
  }

  input(direction: Direction): InputResult {
    if (!isDirection(direction)) throw new RangeError('Invalid movement direction')
    if (this.engine.state.outcome.kind !== 'playing') return 'finished'
    if (this.plan) {
      // One slot: a newer direction replaces the previous pending direction.
      this.pending = direction
      this.speed = Math.max(this.speed, (this.plan.durationMs - this.elapsed) / this.options.finishWithinMs!)
      return 'buffered'
    }
    return this.start(direction)
  }

  advance(deltaMs: number): PlaybackFrame {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) throw new RangeError('deltaMs must be finite and nonnegative')
    let remaining = deltaMs
    while (this.plan) {
      const needed = (this.plan.durationMs - this.elapsed) / this.speed
      if (remaining < needed) {
        this.elapsed += remaining * this.speed
        break
      }
      remaining -= needed
      this.plan = null
      this.elapsed = 0
      this.speed = 1
      const next = this.pending
      this.pending = null
      if (next && this.engine.state.outcome.kind === 'playing') this.start(next)
      if (remaining === 0) break
    }
    return this.frame()
  }

  undo(): boolean {
    this.clearPlayback()
    return this.engine.undo()
  }

  reset(): void {
    this.clearPlayback()
    this.engine.reset()
  }

  private start(direction: Direction): InputResult {
    const result = this.engine.move(direction)
    if (!result.accepted) return result.reason === 'blocked' ? 'blocked' : 'finished'
    const plan = createAnimationPlan(result.trace, this.options)
    this.plan = plan.durationMs > 0 ? plan : null
    this.elapsed = 0
    this.speed = 1
    return 'started'
  }

  private clearPlayback() {
    this.plan = null
    this.pending = null
    this.elapsed = 0
    this.speed = 1
  }
}
