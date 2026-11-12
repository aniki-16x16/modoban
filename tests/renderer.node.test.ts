import assert from 'node:assert/strict'
import test from 'node:test'
import { GameController } from '../src/engine/index.ts'
import { allLevels } from '../src/levels/index.ts'
import { createRenderer, prepareRenderer } from '../src/render/renderer.ts'
import { Mesh, Scene } from '../src/render/mesh.ts'
import { SceneBatch } from '../src/render/batch.ts'
import { buildScene } from '../src/render/scene.ts'
import { fitCamera } from '../src/render/math.ts'
import type { Vec3 } from '../src/render/math.ts'
import type { LevelDefinition } from '../src/engine/index.ts'

function position(batch: SceneBatch, vertex: number): Vec3 {
  const offset = vertex*12, instance = new Uint32Array(batch.vertices.buffer)[offset+11]*16
  const [x,y,z] = batch.vertices.subarray(offset,offset+3), m = batch.matrices.subarray(instance,instance+16)
  return [m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]]
}

function visibleVertices(batch: SceneBatch) {
  return [...batch.indices.subarray(0,batch.indexLength)].map(vertex => [...position(batch,vertex),
    ...batch.vertices.subarray(vertex*12+3,vertex*12+11)].map(n=>n.toFixed(6)).join(',')).sort()
}

function assertTransparencySorted(batch: SceneBatch, back: Vec3) {
  let previous = -Infinity
  for (let i=batch.opaqueCount;i<batch.indexLength;i+=3) {
    const points = [0,1,2].map(j=>position(batch,batch.indices[i+j]))
    const depth = points.reduce((sum,p)=>sum+p.reduce((n,value,j)=>n+value*back[j],0)/3,0)
    assert.ok(depth>=previous-1e-5, `${depth} follows ${previous}`)
    previous = depth
  }
}

test('resident models keep global transparency order through motion, visibility, variants, and camera changes', () => {
  const scene = new Scene(), back: Vec3 = [0,0,1]
  const build = (z: number, opaque = false) => (mesh: Mesh) => mesh.triangle([0,0,z],[1,0,z],[0,1,z],[1,0,0,opaque?1:.5])
  scene.begin()
  const near = scene.use('near','near',build(2))
  scene.use('far','far',build(0))
  scene.use('solid','solid',build(1,true))
  scene.end()
  const batch = new SceneBatch(scene)
  batch.update(back)
  assert.equal(batch.opaqueCount,3)
  assert.deepEqual([0,3,6].map(i=>position(batch,batch.indices[i])[2]),[1,0,2])
  const vertices = batch.vertices, matrices = batch.matrices, indices = batch.indices
  assert.equal(batch.update(back).changed,false)
  near.transform(0,0,-3)
  const motion = batch.update(back)
  assert.equal(motion.vertexStart,motion.vertexEnd,'motion uploads no model vertices')
  assert.ok(motion.matrixEnd>motion.matrixStart)
  assert.equal(batch.vertices,vertices); assert.equal(batch.matrices,matrices); assert.equal(batch.indices,indices)
  assert.deepEqual([0,3,6].map(i=>position(batch,batch.indices[i])[2]),[1,-1,0])
  assertTransparencySorted(batch,back)
  near.visible = false; batch.update(back)
  assert.equal(batch.indexLength,6)
  near.visible = true; batch.update(back)
  batch.update([0,0,-1])
  assert.deepEqual([0,3,6].map(i=>position(batch,batch.indices[i])[2]),[1,0,-1])
  scene.begin(); scene.use('near','variant',build(5)); scene.end()
  batch.update(back)
  assert.equal(batch.opaqueCount,0)
  assert.equal(batch.indexLength,3)
  scene.begin(); scene.use('near','near',build(2)); scene.end()
  const restored = batch.update(back)
  assert.equal(restored.vertexStart,restored.vertexEnd,'returning to an earlier variant reuses its resident vertices')
  assert.equal(position(batch,batch.indices[0])[2],-1)
})

test('retained scenes refresh moving geometry, mechanism states, undo, and reset', () => {
  const puzzle = allLevels.find(p => p.definition.id === 'chapter-2-01')!
  const controller = new GameController(puzzle.definition)
  const back = fitCamera(puzzle.definition.width, puzzle.definition.height, 16/9).back
  let batch: SceneBatch | undefined
  const check = () => {
    const frame = controller.frame()
    const scene = buildScene(puzzle.definition, frame, 'right')
    batch ??= new SceneBatch(scene)
    batch.update(back)
    // A fresh definition has no retained geometry, so stale cache entries cannot mask errors.
    const fresh = new SceneBatch(buildScene(structuredClone(puzzle.definition), frame, 'right'))
    fresh.update(back)
    assert.equal(batch.opaqueCount, fresh.opaqueCount)
    assert.deepEqual(visibleVertices(batch),visibleVertices(fresh))
    assertTransparencySorted(batch,back)
  }
  check()
  for (const direction of ['right', 'right', 'right', 'down', 'down'] as const) {
    controller.input(direction); check()
    controller.advance(37); check()
    controller.advance(1000); check()
  }
  controller.undo(); check()
  controller.reset(); check()
})

test('player deformation and moving doors reuse models without rebuilding triangles', t => {
  const puzzle = allLevels.find(p=>p.definition.id==='chapter-2-01')!, controller = new GameController(puzzle.definition)
  controller.input('right'); controller.advance(45)
  const back = fitCamera(puzzle.definition.width,puzzle.definition.height,16/9).back
  const batch = new SceneBatch(buildScene(puzzle.definition,controller.frame(),'right'))
  batch.update(back)
  const triangle = t.mock.method(Mesh.prototype,'triangle')
  for (let i=0;i<4;i++) {
    controller.advance(10); buildScene(puzzle.definition,controller.frame(),'right')
    const changes = batch.update(back)
    assert.equal(changes.vertexStart,changes.vertexEnd)
    assertTransparencySorted(batch,back)
  }
  assert.equal(triangle.mock.callCount(),0)
})

test('a ceiling door transforms from its mounting height and destroyed entities return on undo and reset', () => {
  const level: LevelDefinition = {
    id: 'render-crusher', width: 6, height: 4, walls: [], exit: {x:5,y:3}, mechanisms: [],
    entities: [{id:'player',kind:'player',position:{x:2,y:1}}],
    axes: [{id:'clock',position:{x:5,y:0},initialPhase:0,signals:[true]}],
    doors: [{id:'crusher',position:{x:2,y:2},direction:'z-down',initialExtended:false,inputs:[{kind:'axis',id:'clock'}]}],
  }
  const controller = new GameController(level), back = fitCamera(6,4,16/9).back
  const scene = buildScene(level,controller.frame(),'right'), batch = new SceneBatch(scene)
  batch.update(back)
  const initial = visibleVertices(batch)
  controller.input('down')
  const clip = controller.animation!.clips.find(clip=>clip.action.kind==='door')!
  const frame = controller.advance((clip.startMs+clip.endMs)/2)
  buildScene(level,frame,'right')
  const changes = batch.update(back)
  assert.equal(changes.vertexStart,changes.vertexEnd,'the first door movement already has resident geometry')
  const volume = scene.parts.find(part=>part.visible && part.mesh.transparent[0]?.vertices[9]===.42)!
  assert.ok(Math.abs(volume.matrix[14]-(.985-.97*frame.doors[0].extension))<1e-6)
  assert.ok(Math.abs(volume.matrix[10]+volume.matrix[14]-.985)<1e-6)
  assertTransparencySorted(batch,back)
  const checkDestruction = () => {
    const frame = controller.advance(1000)
    assert.equal(frame.state.entities[0].position,null)
    buildScene(level,frame,'right'); batch.update(back)
    const fresh = new SceneBatch(buildScene(structuredClone(level),frame,'right'))
    fresh.update(back)
    assert.deepEqual(visibleVertices(batch),visibleVertices(fresh),'no hidden entity remains in the draw indices')
  }
  checkDestruction()
  controller.undo(); buildScene(level,controller.frame(),'right'); batch.update(back)
  assert.deepEqual(visibleVertices(batch),initial)
  controller.input('down'); checkDestruction()
  controller.reset(); buildScene(level,controller.frame(),'right'); batch.update(back)
  assert.deepEqual(visibleVertices(batch),initial)
})

test('WebGPU preparation is shared across cancellation, replacement, navigation, and resize', async t => {
  const counts = { adapters: 0, devices: 0, pipelines: 0, destroyedDevices: 0, textures: 0, destroyedTextures: 0, buffers: 0, destroyedBuffers: 0, submissions: 0, vertexBytes: 0, matrixBytes: 0, writes: 0 }
  const losses: ((info: GPUDeviceLostInfo) => void)[] = []
  const errors: ((event: GPUUncapturedErrorEvent) => void)[] = []
  let failPipeline = true
  const gpu = {
    getPreferredCanvasFormat: () => 'bgra8unorm',
    async requestAdapter() {
      counts.adapters++
      return {
        async requestDevice() {
          counts.devices++
          const lost = new Promise<GPUDeviceLostInfo>(resolve => { losses.push(resolve) })
          return {
            lost,
            limits: { maxTextureDimension2D: 8192 },
            addEventListener: (_: string, listener: (event: GPUUncapturedErrorEvent) => void) => { errors.push(listener) },
            createShaderModule: () => ({}),
            async createRenderPipelineAsync() {
              counts.pipelines++
              if (failPipeline) throw new Error('test compilation failure')
              return { getBindGroupLayout: () => ({}) }
            },
            createBuffer(descriptor: GPUBufferDescriptor) {
              counts.buffers++
              return { usage: descriptor.usage, destroy: () => { counts.destroyedBuffers++ } }
            },
            createBindGroup: () => ({}),
            createTexture() {
              counts.textures++
              return { createView: () => ({}), destroy: () => { counts.destroyedTextures++ } }
            },
            createCommandEncoder: () => ({
              beginRenderPass: () => ({
                setVertexBuffer() {}, setIndexBuffer() {}, setPipeline() {}, setBindGroup() {}, drawIndexed() {}, end() {},
              }),
              finish: () => ({}),
            }),
            queue: {
              writeBuffer(buffer: GPUBuffer, _: number, data: ArrayBufferView) {
                counts.writes++
                if (buffer.usage & 32) counts.vertexBytes += data.byteLength
                if (buffer.usage & 128) counts.matrixBytes += data.byteLength
              },
              submit: () => { counts.submissions++ },
            },
            destroy: () => { counts.destroyedDevices++ },
          }
        },
      }
    },
  }
  const gpuDescriptor = Object.getOwnPropertyDescriptor(navigator, 'gpu')
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(navigator, 'gpu', { configurable: true, value: gpu })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { devicePixelRatio: 1 } })
  t.after(() => {
    if (gpuDescriptor) Object.defineProperty(navigator, 'gpu', gpuDescriptor)
    else Reflect.deleteProperty(navigator, 'gpu')
    if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor)
    else Reflect.deleteProperty(globalThis, 'window')
  })
  const surface = () => {
    const stats = { configured: 0, unconfigured: 0 }
    const bounds = { width: 800, height: 600 }
    const canvas = {
      width: 0, height: 0,
      getBoundingClientRect: () => bounds,
      getContext: () => ({
        configure: () => { stats.configured++ },
        unconfigure: () => { stats.unconfigured++ },
        getCurrentTexture: () => ({ createView: () => ({}) }),
      }),
    } as unknown as HTMLCanvasElement
    return { canvas, bounds, stats }
  }
  const puzzle = allLevels[0], frame = new GameController(puzzle.definition).frame()
  const cancelled = new AbortController(), messages: string[] = []
  const first = surface()
  const attach = (canvas: HTMLCanvasElement, report = (message: string) => { messages.push(message) }, signal = new AbortController().signal) =>
    createRenderer(canvas, puzzle.definition, 'right', undefined, report, signal)

  // Failed preparation can be retried, without leaving a rejected singleton behind.
  await assert.rejects(prepareRenderer(), /test compilation failure/)
  assert.equal(counts.destroyedDevices, 1)
  failPipeline = false
  const preparation = prepareRenderer()
  const abandoned = attach(first.canvas, undefined, cancelled.signal)
  cancelled.abort()
  const mounted = attach(first.canvas)
  await assert.rejects(abandoned, { name: 'AbortError' })
  await preparation
  const renderer = await mounted
  assert.equal(counts.adapters, 2)
  assert.equal(counts.devices, 2)
  assert.equal(counts.pipelines, 4, 'one opaque and one transparent pipeline per device')
  assert.equal(first.stats.configured, 1, 'cancelled mount never configures the canvas')
  renderer.draw(frame)
  const initialWrites = counts.writes, initialVertexBytes = counts.vertexBytes
  renderer.draw(frame)
  assert.equal(counts.writes,initialWrites,'an unchanged picture performs no GPU writes')
  assert.equal(counts.submissions,1,'an unchanged picture is not submitted again')
  const buffers = counts.buffers
  assert.equal(counts.textures, 2)
  renderer.dispose()
  renderer.draw(frame)
  assert.equal(counts.submissions, 1, 'detached renderers cannot submit work')
  assert.equal(counts.destroyedDevices, 1, 'returning to selection retains the live device')
  assert.equal(counts.destroyedBuffers, 0)
  assert.equal(counts.destroyedTextures, 0)

  const second = surface(), again = await attach(second.canvas)
  again.draw(frame)
  assert.equal(counts.adapters, 2)
  assert.equal(counts.pipelines, 4)
  assert.equal(counts.buffers, buffers, 'vertex and uniform buffers survive navigation')
  assert.equal(counts.textures, 2, 'same-sized canvas reuses render targets')
  assert.equal(counts.vertexBytes,initialVertexBytes,'reattachment reuses resident model data')
  const replacement = await attach(second.canvas)
  again.dispose()
  assert.equal(second.stats.unconfigured, 1, 'stale cleanup cannot detach the new owner')
  replacement.draw(frame)
  assert.equal(counts.submissions, 3)
  second.bounds.width = 900
  replacement.draw(frame)
  assert.equal(counts.textures, 4)
  assert.equal(counts.destroyedTextures, 2, 'only a resize replaces render targets')
  assert.equal(counts.vertexBytes,initialVertexBytes,'resize does not upload model data')

  errors[1]({ error: { message: 'test validation error' } } as GPUUncapturedErrorEvent)
  assert.equal(messages.length, 1, 'only the current attachment receives GPU errors')
  losses[1]({ message: 'test loss', reason: 'unknown' } as GPUDeviceLostInfo)
  await Promise.resolve()
  assert.match(messages[1], /test loss/)
  replacement.draw(frame)
  assert.equal(counts.submissions, 4, 'lost devices stop submitting work')
  replacement.dispose()
  const recovered = await attach(surface().canvas)
  recovered.draw(frame)
  assert.equal(counts.devices, 3, 'an actual device loss permits fresh preparation')
  const moving = new GameController(puzzle.definition)
  moving.input('down'); moving.advance(30); recovered.draw(moving.frame())
  const residentBytes = counts.vertexBytes, transforms = counts.matrixBytes
  moving.advance(10); recovered.draw(moving.frame())
  assert.equal(counts.vertexBytes,residentBytes,'animation never uploads an unchanged model')
  assert.ok(counts.matrixBytes>transforms,'animation uploads its changed transforms')
  recovered.dispose()
})
