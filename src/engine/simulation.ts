import { planPush } from './push.ts'
import { cellKey, copyState, freeze, nextPosition, samePosition } from './state.ts'
import type { MutableState } from './state.ts'
import type {
  ActionKind, Direction, EngineAction, GameState, LevelDefinition,
  Outcome, Position, StateChange, TurnResult,
} from './types.ts'

const hardness = { player: 0, box: 1, stone: 2 }
const cellResource = (position: Position) => `cell:${cellKey(position)}`

class World {
  readonly level: LevelDefinition
  readonly state: MutableState
  readonly fixedCells: Set<string>
  readonly mechanisms: Map<string, LevelDefinition['mechanisms'][number]>
  readonly axes: Map<string, MutableState['axes'][number]>
  readonly doors: Map<string, MutableState['doors'][number]>
  private entitiesAt = new Map<string, MutableState['entities'][number]>()
  private doorsAt = new Set<string>()

  constructor(level: LevelDefinition, state: GameState) {
    this.level = level
    this.state = copyState(state)
    this.fixedCells = new Set([...level.walls, ...level.axes.map(axis => axis.position)].map(cellKey))
    this.mechanisms = new Map(level.mechanisms.map(item => [cellKey(item.position), item]))
    this.axes = new Map(this.state.axes.map(item => [item.id, item]))
    this.doors = new Map(this.state.doors.map(item => [item.id, item]))
    this.refresh()
  }

  refresh() {
    this.entitiesAt = new Map(
      this.state.entities
        .filter(entity => entity.position !== null)
        .map(entity => [cellKey(entity.position!), entity]),
    )
    this.doorsAt = new Set(
      this.level.doors
        .filter(door => this.doors.get(door.id)!.extended)
        .map(door => cellKey(door.position)),
    )
    for (const pressure of this.state.pressures) {
      const definition = this.level.mechanisms.find(item => item.id === pressure.id)!
      pressure.active = this.entityAt(definition.position) !== undefined
    }
    for (const axis of this.state.axes) axis.locked = false
    for (const mechanism of this.level.mechanisms) {
      if (mechanism.kind !== 'slot') continue
      const occupant = this.entityAt(mechanism.position)
      if (occupant && occupant.kind !== 'player') this.axes.get(mechanism.axisId)!.locked = true
    }
    const pressures = new Map(this.state.pressures.map(item => [item.id, item.active]))
    for (const definition of this.level.doors) {
      const allActive = definition.inputs.length > 0 && definition.inputs.every(input => {
        if (input.kind === 'pressure') return pressures.get(input.id)!
        const axis = this.axes.get(input.id)!
        const source = this.level.axes.find(item => item.id === input.id)!
        return source.signals[axis.phase]
      })
      this.doors.get(definition.id)!.targetExtended = definition.initialExtended !== allActive
    }
  }

  entityAt(position: Position) {
    return this.entitiesAt.get(cellKey(position))
  }

  fixedAt(position: Position): boolean {
    return position.x < 0 || position.x >= this.level.width || position.y < 0 || position.y >= this.level.height
      || this.fixedCells.has(cellKey(position)) || this.doorsAt.has(cellKey(position))
  }

  shift(entity: MutableState['entities'][number], direction: Direction) {
    entity.position = nextPosition(entity.position!, direction)
    const ground = this.mechanisms.get(cellKey(entity.position))
    if (ground?.kind !== 'conveyor' || ground.beltId !== entity.conveyorId) entity.conveyorId = null
  }
}

function equal(first: unknown, second: unknown): boolean {
  return JSON.stringify(first) === JSON.stringify(second)
}

function diff(before: GameState, after: GameState): StateChange[] {
  const changes: StateChange[] = []
  before.entities.forEach((item, index) => {
    if (!equal(item, after.entities[index])) changes.push({ kind: 'entity', before: item, after: after.entities[index] })
  })
  before.axes.forEach((item, index) => {
    if (!equal(item, after.axes[index])) changes.push({ kind: 'axis', before: item, after: after.axes[index] })
  })
  before.pressures.forEach((item, index) => {
    if (!equal(item, after.pressures[index])) changes.push({ kind: 'pressure', before: item, after: after.pressures[index] })
  })
  before.doors.forEach((item, index) => {
    if (!equal(item, after.doors[index])) changes.push({ kind: 'door', before: item, after: after.doors[index] })
  })
  if (before.turn !== after.turn || !equal(before.outcome, after.outcome)) {
    changes.push({ kind: 'progress', before: { turn: before.turn, outcome: before.outcome }, after: { turn: after.turn, outcome: after.outcome } })
  }
  return changes
}

function writesOf(changes: readonly StateChange[]): Set<string> {
  const writes = new Set<string>()
  for (const change of changes) {
    if (change.kind === 'progress') {
      writes.add('progress')
      continue
    }
    writes.add(`${change.kind}:${change.after.id}`)
    if (change.kind === 'entity') {
      if (change.before.position) writes.add(cellResource(change.before.position))
      if (change.after.position) writes.add(cellResource(change.after.position))
    }
  }
  return writes
}

class Recorder {
  readonly actions: EngineAction[] = []
  readonly world: World
  private writers = new Map<string, number>()
  private readers = new Map<string, Set<number>>()

  constructor(world: World) {
    this.world = world
  }

  commit(kind: ActionKind, sourceId: string | null, reads: readonly string[], mutate: () => void) {
    const before = copyState(this.world.state)
    mutate()
    this.world.refresh()
    const changes = diff(before, copyState(this.world.state))
    if (changes.length === 0) return
    const writes = writesOf(changes)
    const resourcesRead = new Set(reads)
    for (const change of changes) {
      if (change.kind !== 'entity' || change.after.kind === 'player'
        || samePosition(change.before.position, change.after.position)) continue
      // Multiple slots share one OR lock. Occupancy transitions must be ordered
      // even when one transition leaves the cached lock value unchanged.
      for (const position of [change.before.position, change.after.position]) {
        if (!position) continue
        const mechanism = this.world.mechanisms.get(cellKey(position))
        if (mechanism?.kind === 'slot') writes.add(`axis:${mechanism.axisId}`)
      }
    }
    // A door body occupies its target cell even when no movable entity changed.
    for (const change of changes) {
      if (change.kind === 'door' && change.before.extended !== change.after.extended) {
        writes.add(cellResource(this.world.level.doors.find(door => door.id === change.after.id)!.position))
      }
      if (change.kind === 'door' && change.before.targetExtended !== change.after.targetExtended) {
        const definition = this.world.level.doors.find(door => door.id === change.after.id)!
        // Derived AND signals depend on inputs even if earlier input changes
        // did not yet change the target. Preserve that dependency in playback.
        for (const input of definition.inputs) resourcesRead.add(`${input.kind}:${input.id}`)
      }
    }
    const dependencies = new Set<number>()
    for (const resource of new Set([...resourcesRead, ...writes])) {
      const writer = this.writers.get(resource)
      if (writer !== undefined) dependencies.add(writer)
    }
    for (const resource of writes) {
      for (const reader of this.readers.get(resource) ?? []) dependencies.add(reader)
    }
    if (kind === 'outcome') for (const action of this.actions) dependencies.add(action.id)
    const actionId = this.actions.length
    for (const resource of resourcesRead) {
      if (writes.has(resource)) continue
      let readers = this.readers.get(resource)
      if (!readers) {
        readers = new Set()
        this.readers.set(resource, readers)
      }
      readers.add(actionId)
    }
    for (const resource of writes) {
      this.writers.set(resource, actionId)
      this.readers.delete(resource)
    }
    this.actions.push({ id: actionId, kind, sourceId, changes, dependsOn: [...dependencies].sort((a, b) => a - b) })
  }

  outcome(outcome: Outcome) {
    this.commit('outcome', null, [], () => { this.world.state.outcome = structuredClone(outcome) })
  }
}

export function createInitialState(level: LevelDefinition): GameState {
  const initial: GameState = {
    turn: 0,
    outcome: { kind: 'playing' },
    entities: level.entities.map(entity => ({ ...entity, conveyorId: null })),
    axes: level.axes.map(axis => ({ id: axis.id, phase: axis.initialPhase, locked: false })),
    pressures: level.mechanisms.filter(item => item.kind === 'pressure').map(item => ({ id: item.id, active: false })),
    doors: level.doors.map(door => ({ id: door.id, extended: door.initialExtended, targetExtended: door.initialExtended })),
  }
  const world = new World(level, initial)
  if (samePosition(world.state.entities.find(entity => entity.kind === 'player')!.position, level.exit)) {
    world.state.outcome = { kind: 'won' }
  }
  return freeze(world.state)
}

function playerPlan(world: World, direction: Direction) {
  const player = world.state.entities.find(entity => entity.kind === 'player')!
  const destination = nextPosition(player.position!, direction)
  const reads = [`entity:${player.id}`, cellResource(player.position!), cellResource(destination)]
  if (world.fixedAt(destination)) return null
  const box = world.entityAt(destination)
  if (box) {
    const boxDestination = nextPosition(destination, direction)
    reads.push(`entity:${box.id}`, cellResource(boxDestination))
    if (world.fixedAt(boxDestination) || world.entityAt(boxDestination)) return null
  }
  return { player, box, reads }
}

function convey(world: World, recorder: Recorder) {
  for (const mechanism of world.level.mechanisms) {
    if (mechanism.kind !== 'conveyor') continue
    const entity = world.entityAt(mechanism.position)
    if (!entity || entity.conveyorId === mechanism.beltId) continue
    const destination = nextPosition(mechanism.position, mechanism.direction)
    if (world.fixedAt(destination) || world.entityAt(destination)) continue
    recorder.commit('conveyor', mechanism.id, [
      `entity:${entity.id}`, cellResource(mechanism.position), cellResource(destination),
    ], () => {
      world.shift(entity, mechanism.direction)
      const ground = world.mechanisms.get(cellKey(entity.position!))
      entity.conveyorId = ground?.kind === 'conveyor' && ground.beltId === mechanism.beltId ? mechanism.beltId : null
    })
  }
}

function actuateDoors(world: World, recorder: Recorder) {
  for (const definition of world.level.doors) {
    const door = world.doors.get(definition.id)!
    if (door.extended === door.targetExtended) continue
    const reads = [
      `door:${door.id}`,
      ...definition.inputs.map(input => `${input.kind}:${input.id}`),
    ]
    if (!door.targetExtended) {
      recorder.commit('door', door.id, reads, () => { door.extended = false })
      continue
    }
    const offsets = {
      up: { x: 0, y: -1, z: 0 }, down: { x: 0, y: 1, z: 0 },
      left: { x: -1, y: 0, z: 0 }, right: { x: 1, y: 0, z: 0 },
      'z-down': { x: 0, y: 0, z: -1 },
    }
    const plan = planPush({ ...definition.position, z: 0 }, offsets[definition.direction], cell => {
      // Existing levels have a continuous solid floor below their only playable layer.
      if (cell.z < 0) return 'fixed'
      if (cell.z > 0) return undefined
      reads.push(cellResource(cell))
      if (world.fixedAt(cell)) return 'fixed'
      const occupant = world.entityAt(cell)
      if (occupant) reads.push(`entity:${occupant.id}`)
      return occupant
    }, entity => hardness[entity.kind])
    if (!plan) continue
    const { victim, moving } = plan
    recorder.commit('door', door.id, reads, () => {
      if (victim) {
        victim.position = null
        victim.conveyorId = null
      }
      for (const { entity, destination } of moving) {
        entity.position = { x: destination.x, y: destination.y }
        const ground = world.mechanisms.get(cellKey(entity.position))
        if (ground?.kind !== 'conveyor' || ground.beltId !== entity.conveyorId) entity.conveyorId = null
      }
      door.extended = true
    })
    if (victim?.kind === 'player') {
      recorder.outcome({ kind: 'dead', entityId: victim.id, doorId: door.id })
      return
    }
  }
}

export function resolveTurn(level: LevelDefinition, before: GameState, direction: Direction): TurnResult {
  if (before.outcome.kind !== 'playing') return { accepted: false, reason: 'finished', state: before }
  const world = new World(level, before)
  const plan = playerPlan(world, direction)
  if (!plan) return { accepted: false, reason: 'blocked', state: before }
  const recorder = new Recorder(world)
  recorder.commit('turn-start', null, [], () => {
    world.state.turn += 1
    for (const entity of world.state.entities) entity.conveyorId = null
  })
  recorder.commit('player', plan.player.id, plan.reads, () => {
    if (plan.box) world.shift(plan.box, direction)
    world.shift(plan.player, direction)
  })
  recorder.commit('clock', null, world.state.axes.map(axis => `axis:${axis.id}`), () => {
    for (const definition of level.axes) {
      const axis = world.axes.get(definition.id)!
      if (!axis.locked) axis.phase = (axis.phase + 1) % definition.signals.length
    }
  })

  // Compare complete states at the same scheduler boundary. A blocked probe is not a cycle.
  const seen = new Map<string, number>([[JSON.stringify(world.state), recorder.actions.length]])
  while (true) {
    const previousCount = recorder.actions.length
    convey(world, recorder)
    actuateDoors(world, recorder)
    if (world.state.outcome.kind !== 'playing' || recorder.actions.length === previousCount) break
    const key = JSON.stringify(world.state)
    const firstAction = seen.get(key)
    if (firstAction !== undefined) {
      recorder.outcome({ kind: 'loop', firstAction, repeatedAtAction: recorder.actions.length })
      break
    }
    seen.set(key, recorder.actions.length)
  }
  if (world.state.outcome.kind === 'playing'
    && samePosition(world.state.entities.find(entity => entity.kind === 'player')!.position, level.exit)) {
    recorder.outcome({ kind: 'won' })
  }
  const after = freeze(copyState(world.state))
  return freeze({ accepted: true, state: after, trace: { before, after, actions: recorder.actions } })
}
