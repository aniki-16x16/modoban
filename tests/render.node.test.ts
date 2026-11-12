import assert from 'node:assert/strict'
import test from 'node:test'
import { fitCamera } from '../src/render/math.ts'
import { allLevels } from '../src/levels/index.ts'
import { planPush } from '../src/engine/push.ts'

test('fixed cameras contain every scene corner across desktop aspect ratios and level overrides', () => {
  for (const puzzle of allLevels) for (const aspect of [4/3, 16/9, 21/9]) for (const settings of [puzzle.camera, { elevation: 55, fov: 28 }, { elevation: 78, fov: 65 }]) {
    const view = fitCamera(puzzle.definition.width,puzzle.definition.height,aspect,settings)
    for (const p of view.corners) {
      const v=[...p,1], clip=[0,0,0,0]
      for(let r=0;r<4;r++) for(let c=0;c<4;c++) clip[r]+=view.matrix[c*4+r]*v[c]
      assert.ok(clip[3]>0)
      assert.ok(Math.abs(clip[0]/clip[3])<1 && Math.abs(clip[1]/clip[3])<1, puzzle.definition.id)
      assert.ok(clip[2]/clip[3]>0 && clip[2]/clip[3]<1)
    }
    const m=view.matrix
    assert.ok(m[0]>0 && m[5]<0, 'right and down preserve screen orientation')
    assert.equal(view.eye[0],puzzle.definition.width/2, 'camera stays centered on the X axis')
    assert.equal(m[1],0, 'world X has no vertical screen component')
    assert.equal(m[4],0, 'world Y has no horizontal screen component')
  }
})

for (const offset of [{x:1,y:0,z:0},{x:-1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:-1,z:0},{x:0,y:0,z:1},{x:0,y:0,z:-1}]) {
  test(`push planning uses the same space and hardness rules for ${JSON.stringify(offset)}`, () => {
    const start={x:0,y:0,z:0}, stone={hardness:2}, box={hardness:1}
    const inspect = (blocked: boolean) => (p: typeof start) => {
      const distance=p.x*offset.x+p.y*offset.y+p.z*offset.z
      return distance===0?stone:distance===1?box:blocked?'fixed' as const:undefined
    }
    const free=planPush(start,offset,inspect(false),e=>e.hardness)!
    assert.equal(free.victim,undefined)
    assert.equal(free.moving.length,2)
    assert.deepEqual(free.moving[0].destination,offset)
    const blocked=planPush(start,offset,inspect(true),e=>e.hardness)!
    assert.equal(blocked.victim,box)
    assert.deepEqual(blocked.moving,[{entity:stone,destination:offset}])
  })
}
