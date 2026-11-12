import { add, cross, mul, sub, unit } from './math.ts'
import type { Vec3 } from './math.ts'
export type Color = [number, number, number, number]
export function color(hex: string, alpha = 1): Color {
  if (hex.startsWith('hsl')) {
    const [h, s, l] = hex.match(/[\d.]+/g)!.map(Number)
    const a = s / 100 * Math.min(l / 100, 1 - l / 100)
    const f = (n: number) => { const k = (n + h / 30) % 12; return l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)) }
    return [f(0), f(8), f(4), alpha]
  }
  return [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255, alpha]
}
export class Mesh {
  opaque: number[] = []
  transparent: { vertices: number[]; center: Vec3 }[] = []
  triangle(a: Vec3, b: Vec3, c: Vec3, tint: Color, glow = 0, normal = unit(cross(sub(b, a), sub(c, a)))) {
    const vertices = tint[3] < 1 ? [] : this.opaque
    for (const p of [a,b,c]) vertices.push(p[0],p[1],p[2],normal[0],normal[1],normal[2],tint[0],tint[1],tint[2],tint[3],glow)
    if (tint[3] < 1) this.transparent.push({ vertices, center: mul(add(add(a, b), c), 1 / 3) })
  }
  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, tint: Color, glow = 0) {
    this.triangle(a, b, c, tint, glow); this.triangle(a, c, d, tint, glow)
  }
  box(lo: Vec3, hi: Vec3, tint: Color, glow = 0) {
    const [x, y, z] = lo, [X, Y, Z] = hi
    this.quad([x,y,Z],[X,y,Z],[X,Y,Z],[x,Y,Z],tint,glow)
    this.quad([x,Y,z],[X,Y,z],[X,y,z],[x,y,z],tint,glow)
    this.quad([x,y,z],[X,y,z],[X,y,Z],[x,y,Z],tint,glow)
    this.quad([X,Y,z],[x,Y,z],[x,Y,Z],[X,Y,Z],tint,glow)
    this.quad([x,Y,z],[x,y,z],[x,y,Z],[x,Y,Z],tint,glow)
    this.quad([X,y,z],[X,Y,z],[X,Y,Z],[X,y,Z],tint,glow)
  }
  cylinder(center: Vec3, radius: number, height: number, tint: Color, glow = 0, segments = 32, scale: Vec3 = [1,1,1]) {
    const top = add(center, [0,0,height])
    for (let i = 0; i < segments; i++) {
      const a = i / segments * Math.PI * 2, b = (i + 1) / segments * Math.PI * 2
      const u: Vec3 = [Math.cos(a)*radius*scale[0],Math.sin(a)*radius*scale[1],0]
      const v: Vec3 = [Math.cos(b)*radius*scale[0],Math.sin(b)*radius*scale[1],0]
      this.triangle(top, add(top,u), add(top,v), tint, glow, [0,0,1])
      this.quad(add(center,u),add(center,v),add(top,v),add(top,u),tint,glow)
    }
  }
  line(a: Vec3, b: Vec3, width: number, tint: Color, glow = 0, normal: Vec3 = [0,0,1]) {
    const side = mul(unit(cross(sub(b,a),normal)), width / 2)
    this.quad(add(a,side),add(b,side),sub(b,side),sub(a,side),tint,glow)
  }
  ring(center: Vec3, radius: number, width: number, tint: Color, segments = 96) {
    const point = (angle: number, r: number): Vec3 => add(center,[Math.cos(angle)*r,Math.sin(angle)*r,0])
    for (let i=0;i<segments;i++) {
      const a=i/segments*Math.PI*2, b=(i+1)/segments*Math.PI*2
      this.quad(point(a,radius-width/2),point(a,radius+width/2),point(b,radius+width/2),point(b,radius-width/2),tint)
    }
  }
}

/** A model stays immutable; only this small affine transform changes during playback. */
export class ScenePart {
  mesh: Mesh
  readonly matrix = new Float32Array(16)
  visible = false
  seen = 0

  constructor(mesh: Mesh) { this.mesh = mesh; this.transform(0,0,0) }

  transform(x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) {
    this.matrix.fill(0)
    this.matrix[0] = sx; this.matrix[5] = sy; this.matrix[10] = sz; this.matrix[15] = 1
    this.matrix[12] = x; this.matrix[13] = y; this.matrix[14] = z
  }

  box(lo: Vec3, hi: Vec3) { this.transform(...lo, hi[0]-lo[0], hi[1]-lo[1], hi[2]-lo[2]) }

  line(a: Vec3, b: Vec3, width: number) {
    const dx = b[0]-a[0], dy = b[1]-a[1], length = Math.hypot(dx,dy)
    this.transform((a[0]+b[0])/2,(a[1]+b[1])/2,a[2])
    this.matrix[0] = dx; this.matrix[1] = dy
    this.matrix[4] = -dy/length*width; this.matrix[5] = dx/length*width
  }
}

export class Scene {
  readonly parts: ScenePart[] = []
  private readonly models = new Map<string, Mesh>()
  private readonly instances = new Map<string, ScenePart>()
  private readonly groups = new Map<string, { version: string; parts: ScenePart[] }>()
  private collecting: ScenePart[] | undefined
  private generation = 0

  begin() { this.generation++ }

  use(id: string, model: string, build: (mesh: Mesh) => void): ScenePart {
    let mesh = this.models.get(model)
    if (!mesh) { mesh = new Mesh(); build(mesh); this.models.set(model,mesh) }
    let part = this.instances.get(id)
    if (!part) { part = new ScenePart(mesh); this.instances.set(id,part); this.parts.push(part) }
    part.mesh = mesh; part.seen = this.generation
    this.collecting?.push(part)
    return part
  }

  retain(id: string, version: string, build: () => void) {
    let group = this.groups.get(id)
    if (group?.version === version) {
      for (const part of group.parts) part.seen = this.generation
    } else {
      const outer = this.collecting, parts: ScenePart[] = []
      this.collecting = parts
      build()
      this.collecting = outer
      group = { version, parts: parts.filter(part=>part.seen===this.generation) }
      this.groups.set(id,group)
    }
    if (this.collecting) for (const part of group.parts) this.collecting.push(part)
  }

  end() { for (const part of this.parts) part.visible = part.seen === this.generation }
}
