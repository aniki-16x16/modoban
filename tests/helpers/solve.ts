import { createInitialState, resolveTurn } from '../../src/engine/simulation.ts'
import type { Direction, GameState, LevelDefinition } from '../../src/engine/index.ts'

const directions: readonly Direction[] = ['up', 'right', 'down', 'left']

/** Ignore the turn counter, but retain every field that can affect the next move. */
export function stateKey(state: GameState): string {
  return JSON.stringify([state.entities, state.axes, state.pressures, state.doors, state.outcome])
}

export function solve(
  level: LevelDefinition,
  allow: (before: GameState, after: GameState) => boolean = () => true,
): { moves: Direction[]; states: GameState[]; visited: number } | null {
  return solveFrom(level, createInitialState(level), allow)
}

export function solveFrom(
  level: LevelDefinition,
  initial: GameState,
  allow: (before: GameState, after: GameState) => boolean = () => true,
): { moves: Direction[]; states: GameState[]; visited: number } | null {
  const nodes = [{ state: initial, parent: -1, direction: null as Direction | null }]
  const seen = new Set([stateKey(initial)])
  for (let head = 0; head < nodes.length; head += 1) {
    if (nodes.length > 50_000) throw new Error('Level exceeded the small-board search budget')
    const current = nodes[head]
    if (current.state.outcome.kind === 'won') {
      const moves: Direction[] = []
      const states: GameState[] = []
      let index = head
      while (index !== -1) {
        states.push(nodes[index].state)
        const direction = nodes[index].direction
        if (direction) moves.push(direction)
        index = nodes[index].parent
      }
      return { moves: moves.reverse(), states: states.reverse(), visited: seen.size }
    }
    for (const direction of directions) {
      const result = resolveTurn(level, current.state, direction)
      if (!result.accepted || !allow(current.state, result.state)) continue
      if (result.state.outcome.kind !== 'playing' && result.state.outcome.kind !== 'won') continue
      const key = stateKey(result.state)
      if (seen.has(key)) continue
      seen.add(key)
      nodes.push({ state: result.state, parent: head, direction })
    }
  }
  return null
}
