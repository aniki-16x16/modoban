import type { Direction, LevelDefinition, PlaybackFrame } from '../engine/index.ts'
import { fitCamera } from './math.ts'
import type { CameraSettings } from './math.ts'
import type { Buffer, Context, Device, Texture } from './gpu.ts'
import { usage } from './gpu.ts'
import { buildScene } from './scene.ts'

const shader = `
struct Camera { matrix: mat4x4f, eye: vec4f }
@group(0) @binding(0) var<uniform> camera: Camera;
struct Vertex {
 @builtin(position) clip: vec4f,
 @location(0) normal: vec3f,
 @location(1) color: vec4f,
 @location(2) glow: f32,
 @location(3) world: vec3f,
}
@vertex fn vertex(@location(0) position: vec3f, @location(1) normal: vec3f,
 @location(2) color: vec4f, @location(3) glow: f32) -> Vertex {
 var out: Vertex;
 out.clip = camera.matrix * vec4f(position, 1.0);
 out.normal = normal; out.color = color; out.glow = glow; out.world = position;
 return out;
}
@fragment fn fragment(in: Vertex) -> @location(0) vec4f {
 let normal = normalize(in.normal);
 let diffuse = max(dot(normal, normalize(vec3f(-0.4, -0.6, 1.0))), 0.0);
 let light = 0.66 + 0.34 * diffuse;
 let facing = abs(dot(normal, normalize(camera.eye.xyz - in.world)));
 let edge = pow(1.0 - facing, 3.0);
 let lit = in.color.rgb * light;
 let emission = min(in.color.rgb * 1.3 + vec3f(0.13), vec3f(1.0));
 return vec4f(mix(lit, emission, in.glow), in.color.a * (1.0 + edge * in.glow * 0.35));
}`

export interface Renderer { draw(frame: PlaybackFrame): void; dispose(): void }
const owners = new WeakMap<HTMLCanvasElement, Device>()
export async function createRenderer(canvas: HTMLCanvasElement, level: LevelDefinition, direction: Direction, camera: CameraSettings | undefined, report: (message: string) => void, signal: AbortSignal): Promise<Renderer> {
  const gpu = navigator.gpu
  if (!gpu) throw new Error('此浏览器无法使用 WebGPU。请使用支持 WebGPU 且已启用硬件加速的桌面浏览器。')
  const adapter = await gpu.requestAdapter()
  if (!adapter) throw new Error('无法创建 WebGPU 图形适配器，请检查浏览器的硬件加速设置。')
  signal.throwIfAborted()
  const device: Device = await adapter.requestDevice()
  let disposed = false
  device.lost.then(info => { if (!disposed) report(`图形设备已断开，请重新进入关卡。${info.message}`) })
  device.addEventListener('uncapturederror', event => { if (!disposed) report(`渲染失败：${event.error.message}`) })
  const context = canvas.getContext('webgpu') as unknown as Context | null
  if (!context) { device.destroy(); throw new Error('无法创建 WebGPU 画布。') }
  const format = gpu.getPreferredCanvasFormat()
  const module = device.createShaderModule({ code: shader })
  const uniform = device.createBuffer({ size: 80, usage: usage.uniform | usage.copyDst })
  let vertex: Buffer | undefined, capacity = 0, depth: Texture | undefined, multisample: Texture | undefined
  const pipeline = (transparent: boolean) => device.createRenderPipelineAsync({
    layout: 'auto',
    vertex: { module, entryPoint: 'vertex', buffers: [{ arrayStride: 44, attributes: [
      { shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' },
      { shaderLocation: 2, offset: 24, format: 'float32x4' }, { shaderLocation: 3, offset: 40, format: 'float32' },
    ] }] },
    fragment: { module, entryPoint: 'fragment', targets: [{ format, ...(transparent ? { blend: {
      color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
    } } : {}) }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: !transparent, depthCompare: 'less-equal' },
    multisample: { count: 4 },
  })
  try {
    const [opaque, transparent] = await Promise.all([pipeline(false), pipeline(true)])
    signal.throwIfAborted()
    context.configure({ device, format, alphaMode: 'opaque' })
    owners.set(canvas, device)
    const groups = [opaque, transparent].map(p => device.createBindGroup({ layout: p.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }] }))
    return {
      draw(frame) {
        if (disposed) return
        const bounds = canvas.getBoundingClientRect(), ratio = Math.min(Math.max(window.devicePixelRatio || 1, 1.5), 2)
        const width = Math.max(1, Math.min(device.limits.maxTextureDimension2D, Math.round(bounds.width * ratio)))
        const height = Math.max(1, Math.min(device.limits.maxTextureDimension2D, Math.round(bounds.height * ratio)))
        if (canvas.width !== width || canvas.height !== height || !depth) {
          canvas.width = width; canvas.height = height
          depth?.destroy(); multisample?.destroy()
          depth = device.createTexture({ size: [width,height], format: 'depth24plus', sampleCount: 4, usage: usage.renderAttachment })
          multisample = device.createTexture({ size: [width,height], format, sampleCount: 4, usage: usage.renderAttachment })
        }
        const view = fitCamera(level.width, level.height, width / height, camera)
        const uniforms = new Float32Array(20); uniforms.set(view.matrix); uniforms.set([...view.eye,1],16)
        device.queue.writeBuffer(uniform,0,uniforms)
        const { vertices, opaqueCount } = buildScene(level,frame,direction).data(view.back)
        if (vertices.byteLength > capacity) {
          vertex?.destroy(); capacity = Math.ceil(vertices.byteLength / 65536) * 65536
          vertex = device.createBuffer({ size: capacity, usage: usage.vertex | usage.copyDst })
        }
        device.queue.writeBuffer(vertex!,0,vertices)
        const encoder = device.createCommandEncoder()
        const pass = encoder.beginRenderPass({
          colorAttachments: [{ view: multisample!.createView(), resolveTarget: context.getCurrentTexture().createView(), clearValue: { r: .961, g: .953, b: .925, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
          depthStencilAttachment: { view: depth!.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
        })
        pass.setVertexBuffer(0,vertex!)
        pass.setPipeline(opaque); pass.setBindGroup(0,groups[0]); pass.draw(opaqueCount)
        pass.setPipeline(transparent); pass.setBindGroup(0,groups[1]); pass.draw(vertices.length/11-opaqueCount,1,opaqueCount)
        pass.end(); device.queue.submit([encoder.finish()])
      },
      dispose() {
        disposed = true
        vertex?.destroy(); uniform.destroy(); depth?.destroy(); multisample?.destroy()
        if (owners.get(canvas) === device) { context.unconfigure(); owners.delete(canvas) }
        device.destroy()
      },
    }
  } catch (error) {
    disposed = true; uniform.destroy()
    if (owners.get(canvas) === device) { context.unconfigure(); owners.delete(canvas) }
    device.destroy(); throw error
  }
}
