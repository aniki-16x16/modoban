import type { Direction, LevelDefinition, PlaybackFrame } from '../engine/index.ts'
import { fitCamera } from './math.ts'
import type { CameraSettings } from './math.ts'
import type { Buffer, Context, Device, Texture } from './gpu.ts'
import { usage } from './gpu.ts'
import { buildScene } from './scene.ts'
import { SceneBatch } from './batch.ts'

const shader = `
struct Camera { matrix: mat4x4f, eye: vec3f, conveyorOffset: f32 }
@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<storage, read> models: array<mat4x4f>;
struct Vertex {
 @builtin(position) clip: vec4f,
 @location(0) normal: vec3f,
 @location(1) color: vec4f,
 @location(2) glow: f32,
 @location(3) world: vec3f,
 @location(4) local: vec2f,
}
@vertex fn vertex(@location(0) position: vec3f, @location(1) normal: vec3f,
 @location(2) color: vec4f, @location(3) glow: f32, @location(4) instance: u32) -> Vertex {
 var out: Vertex;
 let model = models[instance];
 let world = model * vec4f(position, 1.0);
 out.clip = camera.matrix * world;
 // Cofactors give the inverse-transpose normal direction for nonuniform scales.
 out.normal = normalize(normal.x * cross(model[1].xyz, model[2].xyz)
   + normal.y * cross(model[2].xyz, model[0].xyz) + normal.z * cross(model[0].xyz, model[1].xyz));
 out.color = color; out.glow = glow; out.world = world.xyz; out.local = position.xy;
 return out;
}
@fragment fn fragment(in: Vertex) -> @location(0) vec4f {
 let normal = normalize(in.normal);
 let diffuse = max(dot(normal, normalize(vec3f(-0.4, -0.6, 1.0))), 0.0);
 let light = 0.66 + 0.34 * diffuse;
 let facing = abs(dot(normal, normalize(camera.eye - in.world)));
 let edge = pow(1.0 - facing, 3.0);
 let pixel = max(max(fwidth(in.local.x), fwidth(in.local.y)), 0.0001);
 var base = in.color.rgb;
 // Negative glow marks a conveyor surface. Its pattern scrolls within the top face,
 // so arrows clip cleanly at both rollers and never require new geometry.
 if (in.glow < 0.0) {
   let travel = in.local.x - camera.conveyorOffset;
   let p = vec2f(fract(travel / 0.26) * 0.26 - 0.13, in.local.y);
   let shaft = max(abs(p.x + 0.035) - 0.05, abs(p.y) - 0.023);
   let head = max(-p.x - 0.005, abs(p.y) - (0.095 - p.x) * 0.85);
   let mark = 1.0 - smoothstep(-pixel, pixel, min(shaft, head));
   let seamDistance = abs(fract(travel / 0.13) - 0.5) * 0.13;
   let seam = 1.0 - smoothstep(0.003, 0.003 + pixel, seamDistance);
   base = mix(vec3f(0.20, 0.29, 0.24), base, 0.24) * (1.0 - seam * 0.22);
   base = mix(base, vec3f(0.88, 0.91, 0.78), mark);
 }
 let glow = max(in.glow, 0.0);
 let lit = base * light;
 let emission = min(base * 1.3 + vec3f(0.13), vec3f(1.0));
 return vec4f(mix(lit, emission, glow), in.color.a * (1.0 + edge * glow * 0.35));
}`

export interface Renderer { draw(frame: PlaybackFrame, nowMs?: number): void; dispose(): void }
type Report = (message: string) => void
interface Allocation { buffer: Buffer; capacity: number }
interface Runtime {
  device: Device
  format: GPUTextureFormat
  pipelines: GPURenderPipeline[]
  groups: GPUBindGroup[]
  uniform: Buffer
  uniforms: Float32Array<ArrayBuffer>
  vertex?: Allocation
  index?: Allocation
  objects: Allocation
  batch?: SceneBatch
  depth?: Texture
  multisample?: Texture
  depthView?: GPUTextureView
  multisampleView?: GPUTextureView
  width: number
  height: number
  reports: Set<Report>
  failure?: string
}

// One device and one pair of pipelines for the lifetime of the application.
// Canvas attachments are short-lived; GPU resources survive navigation.
let runtimePromise: Promise<Runtime> | undefined
const owners = new WeakMap<HTMLCanvasElement, Renderer>()

async function initializeRuntime(invalidate: () => void): Promise<Runtime> {
  const gpu = navigator.gpu
  if (!gpu) throw new Error('此浏览器无法使用 WebGPU。请使用支持 WebGPU 且已启用硬件加速的桌面浏览器。')
  const adapter = await gpu.requestAdapter()
  if (!adapter) throw new Error('无法创建 WebGPU 图形适配器，请检查浏览器的硬件加速设置。')
  const device = await adapter.requestDevice(), format = gpu.getPreferredCanvasFormat()
  const reports = new Set<Report>()
  let failure: string | undefined
  let runtime: Runtime | undefined
  device.lost.then(info => {
    failure = `图形设备已断开，请重新进入关卡。${info.message}`
    if (runtime) runtime.failure = failure
    invalidate()
    for (const report of reports) report(failure)
  })
  device.addEventListener('uncapturederror', event => {
    for (const report of reports) report(`渲染失败：${event.error.message}`)
  })
  const module = device.createShaderModule({ code: shader })
  const pipeline = (transparent: boolean) => device.createRenderPipelineAsync({
    layout: 'auto',
    vertex: { module, entryPoint: 'vertex', buffers: [{ arrayStride: 48, attributes: [
      { shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' },
      { shaderLocation: 2, offset: 24, format: 'float32x4' }, { shaderLocation: 3, offset: 40, format: 'float32' },
      { shaderLocation: 4, offset: 44, format: 'uint32' },
    ] }] },
    fragment: { module, entryPoint: 'fragment', targets: [{ format, ...(transparent ? { blend: {
      color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
    } } : {}) }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: !transparent, depthCompare: 'less-equal' },
    multisample: { count: 4 },
  })
  try {
    const pipelines = await Promise.all([pipeline(false), pipeline(true)])
    if (failure) throw new Error(failure)
    const uniform = device.createBuffer({ size: 80, usage: usage.uniform | usage.copyDst })
    const objects = { buffer: device.createBuffer({ size: 16384, usage: usage.storage | usage.copyDst }), capacity: 16384 }
    runtime = { device, format, pipelines, groups: [], uniform, uniforms: new Float32Array(20), objects, width: 0, height: 0, reports }
    bindObjects(runtime)
    return runtime
  } catch (error) {
    device.destroy()
    throw error
  }
}

function bindObjects(runtime: Runtime) {
  runtime.groups = runtime.pipelines.map(p => runtime.device.createBindGroup({ layout: p.getBindGroupLayout(0), entries: [
    { binding: 0, resource: { buffer: runtime.uniform } },
    { binding: 1, resource: { buffer: runtime.objects.buffer } },
  ] }))
}

function upload(runtime: Runtime, name: 'vertex' | 'index' | 'objects', data: Float32Array<ArrayBuffer> | Uint32Array<ArrayBuffer>, length: number, start: number, end: number) {
  let allocation = runtime[name]
  if (!allocation || allocation.capacity < length*4) {
    allocation?.buffer.destroy()
    const capacity = Math.max(65536,(allocation?.capacity ?? 0)*2,Math.ceil(length*4*1.5/65536)*65536)
    allocation = { buffer: runtime.device.createBuffer({ size: capacity, usage: usage[name==='objects' ? 'storage' : name] | usage.copyDst }), capacity }
    runtime[name] = allocation
    start = 0; end = length
    if (name==='objects') bindObjects(runtime)
  }
  if (end>start) runtime.device.queue.writeBuffer(allocation.buffer,start*4,data.subarray(start,end))
}

function getRuntime(): Promise<Runtime> {
  if (!runtimePromise) {
    const pending = initializeRuntime(() => { if (runtimePromise === pending) runtimePromise = undefined })
    runtimePromise = pending
    pending.catch(() => { if (runtimePromise === pending) runtimePromise = undefined })
  }
  return runtimePromise
}

/** Start preparation on the selection page; concurrent mounts share this work. */
export async function prepareRenderer(): Promise<void> { await getRuntime() }

export async function createRenderer(canvas: HTMLCanvasElement, level: LevelDefinition, direction: Direction, camera: CameraSettings | undefined, report: Report, signal: AbortSignal): Promise<Renderer> {
  signal.throwIfAborted()
  const runtime = await getRuntime()
  signal.throwIfAborted()
  if (runtime.failure) throw new Error(runtime.failure)
  const { device, format, pipelines, uniform } = runtime
  const context = canvas.getContext('webgpu') as unknown as Context | null
  if (!context) throw new Error('无法创建 WebGPU 画布。')
  owners.get(canvas)?.dispose()
  context.configure({ device, format, alphaMode: 'opaque' })
  runtime.reports.add(report)
  let disposed = false
  let view: ReturnType<typeof fitCamera> | undefined
  let viewWidth = 0, viewHeight = 0
  let painted = false
  const hasConveyors = level.mechanisms.some(mechanism => mechanism.kind === 'conveyor')
  const renderer: Renderer = {
    draw(frame, nowMs = performance.now()) {
      if (disposed || runtime.failure) return
      const bounds = canvas.getBoundingClientRect(), ratio = Math.min(Math.max(window.devicePixelRatio || 1, 1.5), 2)
      const width = Math.max(1, Math.min(device.limits.maxTextureDimension2D, Math.round(bounds.width * ratio)))
      const height = Math.max(1, Math.min(device.limits.maxTextureDimension2D, Math.round(bounds.height * ratio)))
      const resized = canvas.width !== width || canvas.height !== height
      if (resized) { canvas.width = width; canvas.height = height }
      if (runtime.width !== width || runtime.height !== height || !runtime.depth) {
        runtime.depth?.destroy(); runtime.multisample?.destroy()
        runtime.depth = device.createTexture({ size: [width,height], format: 'depth24plus', sampleCount: 4, usage: usage.renderAttachment })
        runtime.multisample = device.createTexture({ size: [width,height], format, sampleCount: 4, usage: usage.renderAttachment })
        runtime.depthView = runtime.depth.createView(); runtime.multisampleView = runtime.multisample.createView()
        runtime.width = width; runtime.height = height
      }
      if (!view || viewWidth !== width || viewHeight !== height) {
        view = fitCamera(level.width, level.height, width / height, camera)
        viewWidth = width; viewHeight = height
      }
      let cameraChanged = false
      for (let i=0;i<20;i++) {
        const value = i<16 ? view.matrix[i] : i<19 ? Math.fround(view.eye[i-16])
          : hasConveyors ? Math.fround((nowMs*.00028) % .26) : 0
        if (runtime.uniforms[i]!==value) { runtime.uniforms[i] = value; cameraChanged = true }
      }
      const scene = buildScene(level,frame,direction)
      if (runtime.batch?.scene!==scene) runtime.batch = new SceneBatch(scene)
      const batch = runtime.batch, changes = batch.update(view.back)
      if (painted && !resized && !changes.changed && !cameraChanged) return
      if (cameraChanged) device.queue.writeBuffer(uniform,0,runtime.uniforms)
      upload(runtime,'vertex',batch.vertices,batch.vertexLength,changes.vertexStart,changes.vertexEnd)
      upload(runtime,'objects',batch.matrices,batch.matrixLength,changes.matrixStart,changes.matrixEnd)
      upload(runtime,'index',batch.indices,batch.indexLength,changes.indexStart,changes.indexEnd)
      const encoder = device.createCommandEncoder()
      const pass = encoder.beginRenderPass({
        colorAttachments: [{ view: runtime.multisampleView!, resolveTarget: context.getCurrentTexture().createView(), clearValue: { r: .961, g: .953, b: .925, a: 1 }, loadOp: 'clear', storeOp: 'discard' }],
        depthStencilAttachment: { view: runtime.depthView!, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' },
      })
      pass.setVertexBuffer(0,runtime.vertex!.buffer); pass.setIndexBuffer(runtime.index!.buffer,'uint32')
      pass.setPipeline(pipelines[0]); pass.setBindGroup(0,runtime.groups[0]); pass.drawIndexed(batch.opaqueCount)
      pass.setPipeline(pipelines[1]); pass.setBindGroup(0,runtime.groups[1]); pass.drawIndexed(batch.indexLength-batch.opaqueCount,1,batch.opaqueCount)
      pass.end(); device.queue.submit([encoder.finish()])
      painted = true
    },
    dispose() {
      if (disposed) return
      disposed = true
      runtime.reports.delete(report)
      if (owners.get(canvas) === renderer) { context.unconfigure(); owners.delete(canvas) }
    },
  }
  owners.set(canvas, renderer)
  return renderer
}
