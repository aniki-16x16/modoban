import assert from 'node:assert/strict'
import test from 'node:test'
import { circuitPalette } from '../src/circuits.ts'
import { parseLevel } from '../src/engine/index.ts'

test('a cycle base, its brake, and all its doors share a control color', () => {
  const level = parseLevel({
    id: 'colors', width: 6, height: 5, walls: [], exit: { x: 5, y: 4 },
    entities: [{ id: 'player', kind: 'player', position: { x: 5, y: 0 } }],
    axes: [
      { id: 'beat', position: { x: 0, y: 1 }, initialPhase: 0, signals: [false, true] },
      { id: 'other', position: { x: 0, y: 3 }, initialPhase: 0, signals: [true, false] },
    ],
    mechanisms: [
      { id: 'brake', kind: 'slot', position: { x: 1, y: 1 }, axisId: 'beat' },
      { id: 'plate', kind: 'pressure', position: { x: 3, y: 2 } },
    ],
    doors: [
      { id: 'first', position: { x: 2, y: 1 }, direction: 'down', initialExtended: true, inputs: [{ kind: 'axis', id: 'beat' }] },
      { id: 'second', position: { x: 3, y: 1 }, direction: 'down', initialExtended: true, inputs: [{ kind: 'axis', id: 'beat' }] },
      { id: 'pressure', position: { x: 4, y: 2 }, direction: 'down', initialExtended: true, inputs: [{ kind: 'pressure', id: 'plate' }] },
    ],
  })
  const color = circuitPalette(level)
  for (const [kind, id] of [['slot', 'brake'], ['door', 'first'], ['door', 'second']]) assert.equal(color(kind, id), color('axis', 'beat'))
  assert.equal(color('pressure', 'plate'), color('door', 'pressure'))
  assert.notEqual(color('axis', 'beat'), color('pressure', 'plate'))
  assert.notEqual(color('axis', 'beat'), color('axis', 'other'))
})

test('tiles on one logical conveyor share a color, including corners', () => {
  const level = parseLevel({
    id: 'belt-colors', width: 5, height: 3, walls: [], exit: { x: 4, y: 0 },
    entities: [{ id: 'player', kind: 'player', position: { x: 4, y: 2 } }],
    axes: [], doors: [],
    mechanisms: [
      { id: 'entry', kind: 'conveyor', beltId: 'A', position: { x: 0, y: 1 }, direction: 'right' },
      { id: 'corner', kind: 'conveyor', beltId: 'A', position: { x: 1, y: 1 }, direction: 'down' },
      { id: 'end', kind: 'conveyor', beltId: 'A', position: { x: 1, y: 2 }, direction: 'right' },
      { id: 'other', kind: 'conveyor', beltId: 'B', position: { x: 2, y: 1 }, direction: 'right' },
    ],
  })
  const color = circuitPalette(level)
  assert.equal(color('conveyor', 'entry'), color('conveyor', 'corner'))
  assert.equal(color('conveyor', 'entry'), color('conveyor', 'end'))
  assert.notEqual(color('conveyor', 'entry'), color('conveyor', 'other'))
})
