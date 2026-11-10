import { cellKey, freeze, isDirection } from './state.ts'
import type { ControlInput, DoorDefinition, EntityDefinition, LevelDefinition, Position } from './types.ts'

export class LevelValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LevelValidationError'
  }
}

function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new LevelValidationError(message)
}

function record(value: unknown, path: string): Record<string, unknown> {
  requireCondition(value !== null && typeof value === 'object' && !Array.isArray(value), `${path} must be an object`)
  return value as Record<string, unknown>
}

function array(value: unknown, path: string): unknown[] {
  requireCondition(Array.isArray(value), `${path} must be an array`)
  return value
}

function id(value: unknown, path: string): asserts value is string {
  requireCondition(typeof value === 'string' && value.trim().length > 0, `${path} must be a nonempty ID`)
}

export function parseLevel(value: unknown): LevelDefinition {
  const source = record(value, 'level')
  id(source.id, 'level.id')
  requireCondition(Number.isSafeInteger(source.width) && Number(source.width) > 0, 'width must be a positive safe integer')
  requireCondition(Number.isSafeInteger(source.height) && Number(source.height) > 0, 'height must be a positive safe integer')
  const width = Number(source.width)
  const height = Number(source.height)

  function position(value: unknown, path: string): Position {
    const point = record(value, path)
    requireCondition(Number.isSafeInteger(point.x) && Number.isSafeInteger(point.y), `${path} must have integer coordinates`)
    const x = Number(point.x)
    const y = Number(point.y)
    requireCondition(x >= 0 && x < width && y >= 0 && y < height, `${path} is outside the board`)
    return { x, y }
  }

  function identified(values: unknown, path: string): Record<string, unknown>[] {
    const seen = new Set<string>()
    return array(values, path).map((value, index) => {
      const item = record(value, `${path}[${index}]`)
      id(item.id, `${path}[${index}].id`)
      requireCondition(!seen.has(item.id), `${path} contains duplicate ID ${item.id}`)
      seen.add(item.id)
      return item
    })
  }

  const walls = array(source.walls, 'walls').map((value, index) => position(value, `walls[${index}]`))
  const wallCells = new Set(walls.map(cellKey))
  requireCondition(wallCells.size === walls.length, 'walls contain duplicate cells')
  function floor(value: unknown, path: string): Position {
    const point = position(value, path)
    requireCondition(!wallCells.has(cellKey(point)), `${path} overlaps a wall`)
    return point
  }

  const exit = floor(source.exit, 'exit')
  const axes = identified(source.axes, 'axes').map(axis => {
    const signals = array(axis.signals, `axis ${axis.id}.signals`)
    requireCondition(signals.length > 0 && signals.every(signal => typeof signal === 'boolean'), `axis ${axis.id} needs boolean signals`)
    requireCondition(
      Number.isSafeInteger(axis.initialPhase)
        && Number(axis.initialPhase) >= 0
        && Number(axis.initialPhase) < signals.length,
      `axis ${axis.id} has invalid initialPhase`,
    )
    return { id: axis.id as string, initialPhase: Number(axis.initialPhase), signals: signals as boolean[] }
  })
  const axisIds = new Set(axes.map(axis => axis.id))
  const mechanismCells = new Set([cellKey(exit)])
  const mechanisms = identified(source.mechanisms, 'mechanisms').map(item => {
    const point = floor(item.position, `mechanism ${item.id}.position`)
    requireCondition(!mechanismCells.has(cellKey(point)), `mechanism ${item.id} overlaps another ground mechanism or exit`)
    mechanismCells.add(cellKey(point))
    const base = { id: item.id as string, position: point }
    switch (item.kind) {
      case 'pressure':
        return { ...base, kind: 'pressure' as const }
      case 'conveyor':
        id(item.beltId, `conveyor ${item.id}.beltId`)
        requireCondition(isDirection(item.direction), `conveyor ${item.id} has invalid direction`)
        return { ...base, kind: 'conveyor' as const, beltId: item.beltId, direction: item.direction }
      case 'slot':
        requireCondition(typeof item.axisId === 'string' && axisIds.has(item.axisId), `slot ${item.id} references an unknown axis`)
        return { ...base, kind: 'slot' as const, axisId: item.axisId }
      default:
        throw new LevelValidationError(`mechanism ${item.id} has invalid kind`)
    }
  })
  const pressureIds = new Set(mechanisms.filter(item => item.kind === 'pressure').map(item => item.id))
  const occupied = new Set<string>()
  const entities = identified(source.entities, 'entities').map<EntityDefinition>(item => {
    requireCondition(item.kind === 'player' || item.kind === 'box' || item.kind === 'stone', `entity ${item.id} has invalid kind`)
    const point = floor(item.position, `entity ${item.id}.position`)
    requireCondition(!occupied.has(cellKey(point)), `entity ${item.id} overlaps another entity`)
    occupied.add(cellKey(point))
    return { id: item.id as string, kind: item.kind, position: point }
  })
  requireCondition(entities.filter(entity => entity.kind === 'player').length === 1, 'level must have exactly one player')
  const doors = identified(source.doors, 'doors').map<DoorDefinition>(item => {
    const point = floor(item.position, `door ${item.id}.position`)
    requireCondition(isDirection(item.direction), `door ${item.id} has invalid direction`)
    requireCondition(typeof item.initialExtended === 'boolean', `door ${item.id}.initialExtended must be boolean`)
    if (item.initialExtended) {
      requireCondition(!occupied.has(cellKey(point)), `extended door ${item.id} overlaps an entity or door`)
      occupied.add(cellKey(point))
    }
    const inputs = array(item.inputs, `door ${item.id}.inputs`).map<ControlInput>(value => {
      const input = record(value, `door ${item.id} input`)
      id(input.id, `door ${item.id} input.id`)
      requireCondition(input.kind === 'axis' || input.kind === 'pressure', `door ${item.id} has invalid input kind`)
      const ids = input.kind === 'axis' ? axisIds : pressureIds
      requireCondition(ids.has(input.id), `door ${item.id} references unknown ${input.kind} ${input.id}`)
      return { kind: input.kind, id: input.id }
    })
    return { id: item.id as string, position: point, direction: item.direction, initialExtended: item.initialExtended, inputs }
  })

  return freeze(structuredClone({ id: source.id, width, height, walls, exit, axes, mechanisms, entities, doors }))
}
