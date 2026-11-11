import { parseLevel } from '../engine/index.ts'
import type { LevelDefinition, Position } from '../engine/index.ts'

/** A–D and 1–7 (A–G) are plates; matching lowercase letters are retracted-by-pressure doors. */
export function pressureRoom(id: string, rows: readonly string[]): LevelDefinition {
  const width = rows[0].length
  const walls: Position[] = []
  const entities: LevelDefinition['entities'][number][] = []
  const mechanisms: LevelDefinition['mechanisms'][number][] = []
  const doors: LevelDefinition['doors'][number][] = []
  let exit: Position | undefined
  for (const [y, row] of rows.entries()) {
    if (row.length !== width) throw new Error(`${id}: inconsistent row width`)
    for (const [x, tile] of [...row].entries()) {
      const position = { x, y }
      if (tile === '#') walls.push(position)
      else if (tile === '@' || tile === '$') {
        entities.push({ id: tile === '@' ? 'player' : `box-${entities.filter(item => item.kind === 'box').length + 1}`, kind: tile === '@' ? 'player' : 'box', position })
      } else if (tile === 'E') exit = position
      else if (/^[A-D1-7]$/.test(tile)) {
        const id = /^[1-7]$/.test(tile) ? String.fromCharCode(64 + Number(tile)) : tile
        mechanisms.push({ id, kind: 'pressure', position })
      } else if (/^[a-g]$/.test(tile)) {
        doors.push({ id: tile.toUpperCase(), position, direction: 'down', initialExtended: true, inputs: [{ kind: 'pressure', id: tile.toUpperCase() }] })
      } else if (tile !== '.') throw new Error(`${id}: unknown tile ${tile}`)
    }
  }
  if (!exit) throw new Error(`${id}: missing exit`)
  return parseLevel({ id, width, height: rows.length, walls, entities, mechanisms, doors, exit, axes: [] })
}

