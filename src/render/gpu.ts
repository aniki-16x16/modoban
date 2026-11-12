// Native WebGPU types are supplied by the existing TypeScript DOM library.
export type Buffer = GPUBuffer
export type Texture = GPUTexture
export type Device = GPUDevice
export type Context = GPUCanvasContext
export const usage = { copyDst: 8, vertex: 32, uniform: 64, renderAttachment: 16 }
