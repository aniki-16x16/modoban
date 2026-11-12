export type Vec3 = [number, number, number]
export interface CameraSettings { readonly elevation?: number; readonly fov?: number }
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const mul = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
export const unit = (a: Vec3) => mul(a, 1 / Math.hypot(...a))

/** Z is height; map Y runs away from the top of the screen. Angles are degrees. */
export function fitCamera(width: number, height: number, aspect: number, settings: CameraSettings = {}) {
  const radians = Math.PI / 180
  const elevation = Math.min(85, Math.max(45, settings.elevation ?? 78)) * radians
  const fov = Math.min(75, Math.max(20, settings.fov ?? 38)) * radians
  const back: Vec3 = [0, Math.cos(elevation), Math.sin(elevation)]
  const right = unit(cross([0, 0, 1], back))
  // Keep world +X on screen right and world +Y toward the viewer.
  const screenRight = mul(right, -1)
  const up = unit(cross(screenRight, back))
  const center: Vec3 = [width / 2, height / 2, .35]
  const corners: Vec3[] = [0, width].flatMap(x => [0, height].flatMap(y => [-.25, 1.15].map(z => [x, y, z] as Vec3)))
  const tanY = Math.tan(fov / 2), tanX = tanY * aspect
  let distance = 1
  for (const corner of corners) {
    const p = sub(corner, center)
    distance = Math.max(distance, dot(p, back) + Math.max(Math.abs(dot(p, screenRight)) / tanX, Math.abs(dot(p, up)) / tanY) * 1.12)
  }
  const eye = add(center, mul(back, distance))
  const near = .1, far = distance + Math.hypot(width, height) + 10
  const view = [screenRight[0], up[0], back[0], 0, screenRight[1], up[1], back[1], 0, screenRight[2], up[2], back[2], 0, -dot(screenRight, eye), -dot(up, eye), -dot(back, eye), 1]
  const projection = [1 / tanX, 0, 0, 0, 0, 1 / tanY, 0, 0, 0, 0, far / (near - far), -1, 0, 0, near * far / (near - far), 0]
  const matrix = new Float32Array(16)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) matrix[c * 4 + r] += projection[k * 4 + r] * view[c * 4 + k]
  return { matrix, eye, back, center, corners }
}
