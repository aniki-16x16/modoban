import { add, cross, dot, mul, sub, unit } from './math.ts'
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
  data(back: Vec3) {
    // Larger distance along camera back is nearer, so render the farthest first.
    this.transparent.sort((a,b) => dot(a.center,back)-dot(b.center,back))
    return { vertices: new Float32Array([...this.opaque, ...this.transparent.flatMap(t => t.vertices)]), opaqueCount: this.opaque.length / 11 }
  }
}
