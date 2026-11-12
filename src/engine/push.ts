/** A direction-independent push line. Ground is supplied as an obstacle by the world. */
export interface Cell3 { readonly x: number; readonly y: number; readonly z: number }
export function planPush<T>(start: Cell3, offset: Cell3, inspect: (cell: Cell3) => 'fixed' | T | undefined, hardness: (entity: T) => number) {
  const chain: { entity: T; destination: Cell3 }[] = []
  let cell = start
  let blocked = false
  while (true) {
    const occupant = inspect(cell)
    if (occupant === 'fixed') { blocked = true; break }
    if (occupant === undefined) break
    const destination = { x: cell.x + offset.x, y: cell.y + offset.y, z: cell.z + offset.z }
    chain.push({ entity: occupant, destination })
    cell = destination
  }
  if (blocked && chain.length === 0) return null
  let victimIndex = -1
  if (blocked) {
    victimIndex = 0
    for (let i = 1; i < chain.length; i++) if (hardness(chain[i].entity) < hardness(chain[victimIndex].entity)) victimIndex = i
  }
  return { victim: victimIndex < 0 ? undefined : chain[victimIndex].entity, moving: victimIndex < 0 ? chain : chain.slice(0, victimIndex) }
}
