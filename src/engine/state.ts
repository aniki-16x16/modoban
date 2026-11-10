import type { Direction, GameState, Position, StateChange } from './types.ts'

export type Mutable<T> = T extends readonly (infer Item)[]
  ? Mutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T

export type MutableState = Mutable<GameState>

const offsets: Record<Direction, Position> = {
  up: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
}

export function isDirection(value: unknown): value is Direction {
  return typeof value === 'string' && Object.hasOwn(offsets, value)
}

export function nextPosition(position: Position, direction: Direction): Position {
  const offset = offsets[direction]
  return { x: position.x + offset.x, y: position.y + offset.y }
}

export function samePosition(first: Position | null, second: Position | null): boolean {
  return first !== null && second !== null && first.x === second.x && first.y === second.y
}

export function cellKey(position: Position): string {
  return `${position.x},${position.y}`
}

export function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}

export function copyState(state: GameState): MutableState {
  return structuredClone(state) as MutableState
}

/** Apply recorded changes without executing gameplay rules or advancing the clock. */
export function applyChanges(state: GameState, changes: readonly StateChange[]): GameState {
  const next = copyState(state)
  for (const change of changes) {
    switch (change.kind) {
      case 'entity':
        next.entities[next.entities.findIndex(item => item.id === change.after.id)] = structuredClone(change.after)
        break
      case 'axis':
        next.axes[next.axes.findIndex(item => item.id === change.after.id)] = structuredClone(change.after)
        break
      case 'pressure':
        next.pressures[next.pressures.findIndex(item => item.id === change.after.id)] = structuredClone(change.after)
        break
      case 'door':
        next.doors[next.doors.findIndex(item => item.id === change.after.id)] = structuredClone(change.after)
        break
      case 'progress':
        next.turn = change.after.turn
        next.outcome = structuredClone(change.after.outcome)
        break
    }
  }
  return freeze(next)
}
