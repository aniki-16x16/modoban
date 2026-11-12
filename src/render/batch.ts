import type { Vec3 } from './math.ts'
import type { Mesh, Scene, ScenePart } from './mesh.ts'

interface Entry {
  part: ScenePart
  firstVertex: number
  opaqueCount: number
  transparent: Triangle[]
  active: boolean
}
interface Triangle { entry: Entry; firstVertex: number; center: Vec3; depth: number }
export interface Changes {
  vertexStart: number
  vertexEnd: number
  matrixStart: number
  matrixEnd: number
  indexStart: number
  indexEnd: number
  changed: boolean
}

const capacity = (length: number, previous: number) => Math.max(previous*2,Math.ceil(length/16384)*16384)
const compare = (a: Triangle, b: Triangle) => a.depth-b.depth || a.firstVertex-b.firstVertex

/** A resident vertex atlas, small transform updates, and globally ordered transparency. */
export class SceneBatch {
  readonly scene: Scene
  vertices = new Float32Array(0)
  matrices = new Float32Array(0)
  indices = new Uint32Array(0)
  vertexLength = 0
  matrixLength = 0
  indexLength = 0
  opaqueCount = 0
  private readonly entries = new Map<ScenePart, Map<Mesh, Entry>>()
  private readonly selected: (Entry | undefined)[] = []
  private back: Vec3 = [NaN,NaN,NaN]
  private order: Triangle[] = []
  private scratch: Triangle[] = []
  private readonly stable: Triangle[] = []
  private readonly moving: Triangle[] = []

  constructor(scene: Scene) { this.scene = scene }

  private compile(part: ScenePart, instance: number): Entry {
    let models = this.entries.get(part)
    if (!models) { models = new Map(); this.entries.set(part,models) }
    const cached = models.get(part.mesh)
    if (cached) return cached
    const { mesh } = part
    const length = (mesh.opaque.length + mesh.transparent.length*33)/11*12
    if (this.vertices.length < this.vertexLength+length) {
      const storage = new Float32Array(capacity(this.vertexLength+length,this.vertices.length))
      storage.set(this.vertices); this.vertices = storage
    }
    const instances = new Uint32Array(this.vertices.buffer)
    const entry: Entry = { part, firstVertex: this.vertexLength/12, opaqueCount: mesh.opaque.length/11, transparent: [], active: false }
    const append = (vertices: number[]) => {
      for (let offset=0;offset<vertices.length;offset+=11) {
        for (let i=0;i<11;i++) this.vertices[this.vertexLength+i] = vertices[offset+i]
        instances[this.vertexLength+11] = instance
        this.vertexLength += 12
      }
    }
    append(mesh.opaque)
    for (const triangle of mesh.transparent) {
      entry.transparent.push({ entry, firstVertex: this.vertexLength/12, center: triangle.center, depth: 0 })
      append(triangle.vertices)
    }
    models.set(mesh,entry)
    return entry
  }

  update(back: Vec3): Changes {
    const vertexStart = this.vertexLength
    let matrixStart = Infinity, matrixEnd = 0, topology = false
    const changed = new Set<Entry>()
    const viewChanged = back.some((n,i)=>n!==this.back[i])
    if (viewChanged) this.back = [...back]
    const required = this.scene.parts.length*16
    if (this.matrices.length < required) {
      const storage = new Float32Array(capacity(required,this.matrices.length))
      storage.set(this.matrices); this.matrices = storage
    }
    this.scene.parts.forEach((part,i) => {
      const offset = i*16
      const moved = offset >= this.matrixLength || part.matrix.some((n,j)=>n!==this.matrices[offset+j])
      if (moved) {
        this.matrices.set(part.matrix,offset)
        matrixStart = Math.min(matrixStart,offset); matrixEnd = offset+16
      }
      const model = this.compile(part,i)
      const previous = this.selected[i], entry = part.visible ? model : undefined
      if (entry!==previous) {
        if (previous) previous.active = false
        if (entry) entry.active = true
        this.selected[i] = entry; topology = true
      }
      if (entry && (entry!==previous || moved || viewChanged)) changed.add(entry)
    })
    this.matrixLength = required
    let indexStart = Infinity, indexEnd = 0
    if (topology || changed.size) {
      // Keep the already sorted triangles of all unchanged objects, including the floor.
      this.stable.length = 0; this.moving.length = 0
      for (const triangle of this.order) if (triangle.entry.active && !changed.has(triangle.entry)) this.stable.push(triangle)
      for (const entry of changed) for (const triangle of entry.transparent) {
        const m = entry.part.matrix, [x,y,z] = triangle.center
        triangle.depth = (m[0]*x+m[4]*y+m[8]*z+m[12])*back[0]
          + (m[1]*x+m[5]*y+m[9]*z+m[13])*back[1]
          + (m[2]*x+m[6]*y+m[10]*z+m[14])*back[2]
        this.moving.push(triangle)
      }
      this.moving.sort(compare)
      this.scratch.length = 0
      let a = 0, b = 0
      while (a<this.stable.length || b<this.moving.length) {
        this.scratch.push(b>=this.moving.length || (a<this.stable.length && compare(this.stable[a],this.moving[b])<=0)
          ? this.stable[a++] : this.moving[b++])
      }
      const previous = this.order; this.order = this.scratch; this.scratch = previous
      if (topology) this.opaqueCount = this.selected.reduce((n,entry)=>n+(entry?.opaqueCount ?? 0),0)
      this.indexLength = this.opaqueCount+this.order.length*3
      if (this.indices.length < this.indexLength) {
        const storage = new Uint32Array(capacity(this.indexLength,this.indices.length))
        storage.set(this.indices); this.indices = storage
      }
      let offset = 0
      if (topology) {
        for (const entry of this.selected) if (entry) for (let i=0;i<entry.opaqueCount;i++) this.indices[offset++] = entry.firstVertex+i
        indexStart = 0; indexEnd = this.indexLength
      }
      offset = this.opaqueCount
      for (const triangle of this.order) {
        for (let i=0;i<3;i++,offset++) if (this.indices[offset]!==triangle.firstVertex+i) {
          this.indices[offset] = triangle.firstVertex+i
          indexStart = Math.min(indexStart,offset); indexEnd = Math.max(indexEnd,offset+1)
        }
      }
    }
    return { vertexStart, vertexEnd: this.vertexLength, matrixStart, matrixEnd, indexStart, indexEnd,
      changed: topology || matrixEnd>0 || vertexStart!==this.vertexLength || indexEnd>0 }
  }
}
