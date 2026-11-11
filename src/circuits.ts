import type { LevelDefinition } from './engine/index.ts'

const colors = ['#b17c28', '#7a6aa6', '#357f86', '#b45965', '#57884d', '#4f83b5', '#c56b32']

// A control, its doors, and its brakes share one color, including joined controls.
export function circuitPalette(level: LevelDefinition) {
  const groups: Set<string>[] = []
  const connect = (...keys: string[]) => {
    const group = new Set(keys)
    for (let index = groups.length - 1; index >= 0; index -= 1) {
      if (![...groups[index]].some(key => group.has(key))) continue
      for (const key of groups[index]) group.add(key)
      groups.splice(index, 1)
    }
    groups.push(group)
  }
  for (const door of level.doors) connect(`door:${door.id}`, ...door.inputs.map(input => `${input.kind}:${input.id}`))
  for (const axis of level.axes) connect(`axis:${axis.id}`)
  for (const mechanism of level.mechanisms) {
    if (mechanism.kind === 'slot') connect(`slot:${mechanism.id}`, `axis:${mechanism.axisId}`)
    else connect(`${mechanism.kind}:${mechanism.id}`)
  }
  const palette = new Map<string, string>()
  groups.sort((a, b) => [...a].sort()[0].localeCompare([...b].sort()[0]))
  groups.forEach((group, index) => {
    const color = colors[index] ?? `hsl(${index * 137.508 % 360} 45% 45%)`
    group.forEach(key => palette.set(key, color))
  })
  return (kind: string, id: string) => palette.get(`${kind}:${id}`) ?? colors[0]
}
