import { applyChanges, freeze, samePosition } from './state.ts'
import type { EngineAction, GameState, Position, TurnTrace } from './types.ts'

export interface AnimationOptions {
  readonly movementMs?: number
  readonly doorMs?: number
  readonly clockMs?: number
}

export interface AnimationClip {
  readonly action: EngineAction
  readonly startMs: number
  readonly endMs: number
}

export interface AnimationPlan {
  readonly trace: TurnTrace
  readonly clips: readonly AnimationClip[]
  readonly durationMs: number
}

export interface EntityMotion {
  readonly entityId: string
  readonly from: Position
  readonly to: Position
  readonly position: Position
  readonly progress: number
  readonly actionId: number
}

export interface DoorMotion {
  readonly doorId: string
  readonly fromExtension: number
  readonly toExtension: number
  readonly extension: number
  readonly progress: number
  readonly actionId: number
}

export interface PlaybackFrame {
  /** Discrete state after completed clips; active motions override visual positions. */
  readonly state: GameState
  readonly entities: readonly EntityMotion[]
  readonly doors: readonly DoorMotion[]
  readonly elapsedMs: number
  readonly finished: boolean
}

function duration(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be finite and nonnegative`)
  return value
}

export function createAnimationPlan(trace: TurnTrace, options: AnimationOptions = {}): AnimationPlan {
  const movementMs = duration(options.movementMs ?? 90, 'movementMs')
  const doorMs = duration(options.doorMs ?? 110, 'doorMs')
  const clockMs = duration(options.clockMs ?? 40, 'clockMs')
  const ends = new Map<number, number>()
  const clips: AnimationClip[] = []
  let durationMs = 0
  for (const action of trace.actions) {
    let startMs = 0
    for (const id of action.dependsOn) startMs = Math.max(startMs, ends.get(id)!)
    let milliseconds = 0
    switch (action.kind) {
      case 'player':
      case 'conveyor':
        milliseconds = movementMs
        break
      case 'door':
        milliseconds = doorMs
        break
      case 'clock':
        milliseconds = clockMs
        break
    }
    const endMs = startMs + milliseconds
    if (!Number.isFinite(endMs)) throw new RangeError('Animation duration is too large')
    durationMs = Math.max(durationMs, endMs)
    ends.set(action.id, endMs)
    clips.push({ action, startMs, endMs })
  }
  return freeze({ trace, clips, durationMs })
}

export function sampleAnimation(plan: AnimationPlan, elapsedMs: number): PlaybackFrame {
  duration(elapsedMs, 'elapsedMs')
  const elapsed = Math.min(elapsedMs, plan.durationMs)
  if (elapsed >= plan.durationMs) {
    return freeze({ state: plan.trace.after, entities: [], doors: [], elapsedMs: elapsed, finished: true })
  }
  let state = plan.trace.before
  const entities: EntityMotion[] = []
  const doors: DoorMotion[] = []
  for (const clip of plan.clips) {
    if (elapsed >= clip.endMs) {
      state = applyChanges(state, clip.action.changes)
      continue
    }
    if (elapsed < clip.startMs) continue
    const progress = (elapsed - clip.startMs) / (clip.endMs - clip.startMs)
    for (const change of clip.action.changes) {
      if (change.kind === 'entity' && change.before.position && change.after.position
        && !samePosition(change.before.position, change.after.position)) {
        const from = change.before.position
        const to = change.after.position
        entities.push({
          entityId: change.after.id, from, to, progress, actionId: clip.action.id,
          position: { x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * progress },
        })
      }
      if (change.kind === 'door' && change.before.extended !== change.after.extended) {
        const fromExtension = Number(change.before.extended)
        const toExtension = Number(change.after.extended)
        doors.push({
          doorId: change.after.id, fromExtension, toExtension, progress, actionId: clip.action.id,
          extension: fromExtension + (toExtension - fromExtension) * progress,
        })
      }
    }
  }
  return freeze({ state, entities, doors, elapsedMs: elapsed, finished: false })
}
