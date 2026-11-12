export type Direction = 'up' | 'right' | 'down' | 'left'

/** Vertical lifting is reserved for a future height-aware world. */
export type DoorDirection = Direction | 'z-down'

export interface Position {
  readonly x: number
  readonly y: number
}

export type EntityKind = 'player' | 'box' | 'stone'

export interface EntityDefinition {
  readonly id: string
  readonly kind: EntityKind
  readonly position: Position
}

interface MechanismBase {
  readonly id: string
  readonly position: Position
}

export interface ConveyorDefinition extends MechanismBase {
  readonly kind: 'conveyor'
  readonly beltId: string
  readonly direction: Direction
}

export interface PressureDefinition extends MechanismBase {
  readonly kind: 'pressure'
}

export interface SlotDefinition extends MechanismBase {
  readonly kind: 'slot'
  readonly axisId: string
}

export type MechanismDefinition = ConveyorDefinition | PressureDefinition | SlotDefinition

export interface AxisDefinition {
  readonly id: string
  readonly position: Position
  readonly initialPhase: number
  readonly signals: readonly boolean[]
}

export interface ControlInput {
  readonly kind: 'pressure' | 'axis'
  readonly id: string
}

export interface DoorDefinition {
  readonly id: string
  /** The cell occupied when extended; z-down mounts above it, planar doors at the opposite edge. */
  readonly position: Position
  readonly direction: DoorDirection
  readonly initialExtended: boolean
  readonly inputs: readonly ControlInput[]
}

export interface LevelDefinition {
  readonly id: string
  readonly width: number
  readonly height: number
  readonly walls: readonly Position[]
  readonly exit: Position
  readonly entities: readonly EntityDefinition[]
  readonly mechanisms: readonly MechanismDefinition[]
  readonly axes: readonly AxisDefinition[]
  readonly doors: readonly DoorDefinition[]
}

export interface EntityState {
  readonly id: string
  readonly kind: EntityKind
  readonly position: Position | null
  readonly conveyorId: string | null
}

export interface AxisState {
  readonly id: string
  readonly phase: number
  readonly locked: boolean
}

export interface PressureState {
  readonly id: string
  readonly active: boolean
}

export interface DoorState {
  readonly id: string
  readonly extended: boolean
  readonly targetExtended: boolean
}

export type Outcome =
  | { readonly kind: 'playing' }
  | { readonly kind: 'won' }
  | { readonly kind: 'dead'; readonly entityId: string; readonly doorId: string }
  | { readonly kind: 'loop'; readonly firstAction: number; readonly repeatedAtAction: number }

export interface ProgressState {
  readonly turn: number
  readonly outcome: Outcome
}

export interface GameState extends ProgressState {
  readonly entities: readonly EntityState[]
  readonly axes: readonly AxisState[]
  readonly pressures: readonly PressureState[]
  readonly doors: readonly DoorState[]
}

export type StateChange =
  | { readonly kind: 'entity'; readonly before: EntityState; readonly after: EntityState }
  | { readonly kind: 'axis'; readonly before: AxisState; readonly after: AxisState }
  | { readonly kind: 'pressure'; readonly before: PressureState; readonly after: PressureState }
  | { readonly kind: 'door'; readonly before: DoorState; readonly after: DoorState }
  | { readonly kind: 'progress'; readonly before: ProgressState; readonly after: ProgressState }

export type ActionKind = 'turn-start' | 'player' | 'clock' | 'conveyor' | 'door' | 'outcome'

export interface EngineAction {
  readonly id: number
  readonly kind: ActionKind
  readonly sourceId: string | null
  /** All changes in this action are committed atomically. */
  readonly changes: readonly StateChange[]
  /** Earlier actions whose completion is required before presenting this action. */
  readonly dependsOn: readonly number[]
}

export interface TurnTrace {
  readonly before: GameState
  readonly after: GameState
  readonly actions: readonly EngineAction[]
}

export type TurnResult =
  | { readonly accepted: false; readonly reason: 'blocked' | 'finished'; readonly state: GameState }
  | { readonly accepted: true; readonly trace: TurnTrace; readonly state: GameState }
