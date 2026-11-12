import { circuitPalette } from '../circuits.ts'
import type { Direction, LevelDefinition, PlaybackFrame } from '../engine/index.ts'
import { playerScale } from '../motion.ts'
import { add, mul } from './math.ts'
import type { Vec3 } from './math.ts'
import { color, Mesh } from './mesh.ts'

const dark = color('#53382d'), cream = color('#f8c5a4')
function arrow(mesh: Mesh, center: Vec3, direction: Direction, tint: ReturnType<typeof color>) {
  const angles = { right: 0, down: Math.PI/2, left: Math.PI, up: -Math.PI/2 }
  const angle = angles[direction]
  const point = (x: number,y: number): Vec3 => add(center,[x*Math.cos(angle)-y*Math.sin(angle),x*Math.sin(angle)+y*Math.cos(angle),0])
  mesh.line(point(-.22,0),point(.22,0),.045,tint)
  mesh.line(point(.22,0),point(.05,-.16),.045,tint)
  mesh.line(point(.22,0),point(.05,.16),.045,tint)
}

const floorCache = new WeakMap<LevelDefinition, Map<Direction, Pick<Mesh, 'opaque' | 'transparent'>>>()

export function buildScene(level: LevelDefinition, frame: PlaybackFrame, exitDirection: Direction): Mesh {
  const mesh = new Mesh(), palette = circuitPalette(level)
  let cached = floorCache.get(level)
  if (!cached) { cached = new Map(); floorCache.set(level,cached) }
  const floor = cached.get(exitDirection)
  if (floor) { mesh.opaque = floor.opaque.slice(); mesh.transparent = floor.transparent.slice() }
  else {
    const walls = new Set(level.walls.map(p => `${p.x},${p.y}`))
    const isWall = (x: number,y: number) => walls.has(`${x},${y}`)
    const isFloor = (x: number,y: number) => x>=0 && y>=0 && x<level.width && y<level.height && !isWall(x,y)
    const wall = color('#496153'), grid = color('#ffffff',.38)
    mesh.box([0,0,-.23],[level.width,level.height,-.05],color('#344e43'))
    for (let y=0;y<level.height;y++) for (let x=0;x<level.width;x++) {
      if (isWall(x,y)) {
        // Contiguous full-height walls: emit only exposed faces, with no seams or top grid.
        mesh.quad([x,y,1],[x+1,y,1],[x+1,y+1,1],[x,y+1,1],wall)
        if (!isWall(x,y-1)) mesh.quad([x,y,0],[x+1,y,0],[x+1,y,1],[x,y,1],wall)
        if (!isWall(x,y+1)) mesh.quad([x+1,y+1,0],[x,y+1,0],[x,y+1,1],[x+1,y+1,1],wall)
        if (!isWall(x-1,y)) mesh.quad([x,y+1,0],[x,y,0],[x,y,1],[x,y+1,1],wall)
        if (!isWall(x+1,y)) mesh.quad([x+1,y,0],[x+1,y+1,0],[x+1,y+1,1],[x+1,y,1],wall)
      } else mesh.box([x,y,-.05],[x+1,y+1,0],color('#ede4d3'))
    }
    // Each ground boundary is drawn once. Raised walls occlude its wall-facing half.
    for (let y=0;y<level.height;y++) for (let x=0;x<=level.width;x++) {
      if (isFloor(x-1,y) || isFloor(x,y)) mesh.line([x,y,.002],[x,y+1,.002],.016,grid)
    }
    for (let y=0;y<=level.height;y++) for (let x=0;x<level.width;x++) {
      if (isFloor(x,y-1) || isFloor(x,y)) mesh.line([x,y,.002],[x+1,y,.002],.016,grid)
    }
  const exit = level.exit
  mesh.box([exit.x+.12,exit.y+.12,.005],[exit.x+.88,exit.y+.88,.065],color('#b8cfaa'))
  arrow(mesh,[exit.x+.5,exit.y+.5,.07],exitDirection,color('#4f7852'))
    cached.set(exitDirection,{ opaque: mesh.opaque.slice(), transparent: mesh.transparent.slice() })
  }
  for (const mechanism of level.mechanisms) {
    const {x,y} = mechanism.position, tint = color(palette(mechanism.kind,mechanism.id))
    if (mechanism.kind === 'pressure') {
      const active = frame.state.pressures.find(p=>p.id===mechanism.id)?.active
      mesh.cylinder([x+.5,y+.5,.005],.4,.035,color('#b7ad95'),0,96)
      mesh.cylinder([x+.5,y+.5,.04],.33,active ? .025 : .085,tint,0,96)
      mesh.ring([x+.5,y+.5,active ? .068 : .128],.3,.02,cream)
    } else if (mechanism.kind === 'slot') {
      mesh.box([x+.12,y+.12,.005],[x+.88,y+.88,.06],tint)
      mesh.box([x+.22,y+.22,.06],[x+.78,y+.78,.065],color('#243c31'))
      for (let i=0;i<3;i++) mesh.line([x+.15,y+.3+i*.2,.07],[x+.85,y+.3+i*.2,.07],.03,tint)
    } else {
      mesh.box([x+.08,y+.08,.005],[x+.92,y+.92,.045],color('#7d9180'))
      arrow(mesh,[x+.5,y+.5,.05],mechanism.direction,tint)
    }
  }
  for (const axis of level.axes) {
    const {x,y}=axis.position, state=frame.state.axes.find(a=>a.id===axis.id)!, tint=color(palette('axis',axis.id))
    mesh.box([x+.08,y+.08,0],[x+.92,y+.92,.22],tint)
    mesh.cylinder([x+.5,y+.5,.22],.36,.045,color('#243c31'))
    axis.signals.forEach((signal,i)=>{
      const angle=i/axis.signals.length*Math.PI*2-Math.PI/2
      const p: Vec3=[x+.5+Math.cos(angle)*.25,y+.5+Math.sin(angle)*.25,.27]
      if(i===state.phase) {
        mesh.cylinder(p,.085,.012,color('#f6f1df'))
        mesh.line([x+.5,y+.5,.27],p,.025,color('#f6f1df'))
      }
      mesh.cylinder(add(p,[0,0,.014]),.048,.008,signal?tint:color('#132b24'))
    })
    if(state.locked) for(const offset of [-.05,.05]) mesh.line([x+.5+offset,y+.4,.31],[x+.5+offset,y+.6,.31],.03,cream)
  }
  for (const entity of frame.state.entities) {
    const motion=frame.entities.find(m=>m.entityId===entity.id), p=motion?.position??entity.position
    if(!p) continue
    const x=p.x+.5,y=p.y+.5
    mesh.cylinder([x+.045,y+.065,.004],.39,.002,color('#344e43',.13),0,32)
    if(entity.kind==='player') {
      const scale=playerScale(motion), top=.78
      mesh.cylinder([x,y,.02],.31,top-.02,color('#df7955'),0,48,[scale.x,scale.y,1])
      mesh.cylinder([x,y,top],.305,.018,cream,0,48,[scale.x,scale.y,1])
      mesh.cylinder([x,y,top+.019],.288,.006,color('#e88c67'),0,48,[scale.x,scale.y,1])
      for(const dx of [-.095,.095]) mesh.cylinder([x+dx*scale.x,y-.06*scale.y,top+.026],.033,.005,dark,0,16)
      for(let i=0;i<12;i++) {
        const a=i/12*Math.PI,b=(i+1)/12*Math.PI
        mesh.line([x+Math.cos(a)*.09*scale.x,y+(.07+Math.sin(a)*.06)*scale.y,top+.033],[x+Math.cos(b)*.09*scale.x,y+(.07+Math.sin(b)*.06)*scale.y,top+.033],.024,dark)
      }
    } else {
      const stone=entity.kind==='stone', tint=color(stone?'#9ca89d':'#c99b64'), rim=color(stone?'#c1c9bc':'#edc994')
      mesh.box([x-.35,y-.35,.02],[x+.35,y+.35,.66],tint)
      for(const dx of [-.29,.29]) mesh.line([x+dx,y-.3,.665],[x+dx,y+.3,.665],.035,rim)
      for(const dy of [-.29,.29]) mesh.line([x-.3,y+dy,.665],[x+.3,y+dy,.665],.035,rim)
      mesh.line([x-.24,y-.24,.67],[x+.24,y+.24,.67],.055,color(stone?'#788b80':'#97683f'))
      mesh.line([x+.24,y-.24,.67],[x-.24,y+.24,.67],.055,color(stone?'#788b80':'#97683f'))
      mesh.line([x-.27,y+.352,.1],[x+.27,y+.352,.57],.04,rim,0,[0,1,0])
      mesh.line([x+.27,y+.352,.1],[x-.27,y+.352,.57],.04,rim,0,[0,1,0])
    }
    const plate=level.mechanisms.find(m=>m.position.x===p.x&&m.position.y===p.y)
    if(plate) mesh.cylinder([x+.22,y+.23,entity.kind==='player'?.82:.68],.085,.018,color(palette(plate.kind,plate.id)),.25)
  }
  for(const door of level.doors) {
    const {x,y}=door.position, tint=palette('door',door.id)
    const extension=frame.doors.find(m=>m.doorId===door.id)?.extension??Number(frame.state.doors.find(d=>d.id===door.id)!.extended)
    const vectors: Record<typeof door.direction,Vec3>={right:[1,0,0],left:[-1,0,0],down:[0,1,0],up:[0,-1,0],'z-down':[0,0,-1]}
    const normal=vectors[door.direction], center:Vec3=[x+.5,y+.5,.5]
    const base=add(center,mul(normal,-.5))
    const u:Vec3=normal[0]!==0?[0,1,0]:[1,0,0],v:Vec3=normal[2]!==0?[0,1,0]:[0,0,1]
    const point=(a:number,b:number)=>add(add(add(base,mul(normal,.075)),mul(u,a)),mul(v,b))
    // A shallow frame sits inside the target cell, making its mounting face readable from either side.
    const mountBlock=(a0:number,b0:number,a1:number,b1:number) => {
      const corners=[.008,.07].flatMap(depth=>[a0,a1].flatMap(a=>[b0,b1].map(b=>add(add(add(base,mul(normal,depth)),mul(u,a)),mul(v,b)))))
      const lo=corners.reduce<Vec3>((p,q)=>p.map((n,i)=>Math.min(n,q[i])) as Vec3,[Infinity,Infinity,Infinity])
      const hi=corners.reduce<Vec3>((p,q)=>p.map((n,i)=>Math.max(n,q[i])) as Vec3,[-Infinity,-Infinity,-Infinity])
      mesh.box(lo,hi,color(tint),.15)
    }
    mountBlock(-.47,-.47,.47,-.39)
    mountBlock(-.47,.39,.47,.47)
    mountBlock(-.47,-.39,-.39,.39)
    mountBlock(.39,-.39,.47,.39)
    // Four brackets and inward chevrons lie on the actual mounting face.
    for(const a of [-1,1]) for(const b of [-1,1]) {
      mesh.line(point(a*.43,b*.43),point(a*.23,b*.43),.025,color(tint),.7,normal)
      mesh.line(point(a*.43,b*.43),point(a*.43,b*.23),.025,color(tint),.7,normal)
    }
    for(const a of [-1,1]) {
      mesh.line(point(a*.18,-.1),point(a*.09,0),.025,color(tint),.65,normal)
      mesh.line(point(a*.09,0),point(a*.18,.1),.025,color(tint),.65,normal)
    }
    if(extension<.001) continue
    const lo:Vec3=[x+.015,y+.015,.015],hi:Vec3=[x+.985,y+.985,.985]
    const axis=normal.findIndex(n=>n!==0)
    if(normal[axis]>0) hi[axis]=lo[axis]+.97*extension
    else lo[axis]=hi[axis]-.97*extension
    mesh.box(lo,hi,color(tint,.42),.8)
    // Emissive edges and broad, low-alpha fringes produce a soft light volume.
    for(let axis=0;axis<3;axis++) {
      const others=[0,1,2].filter(i=>i!==axis)
      for(const a of [0,1]) for(const b of [0,1]) {
        const start:Vec3=[...lo],end:Vec3=[...lo]
        start[others[0]]=end[others[0]]=a?hi[others[0]]:lo[others[0]]
        start[others[1]]=end[others[1]]=b?hi[others[1]]:lo[others[1]]
        end[axis]=hi[axis]
        for(const [width,alpha] of [[.012,.8],[.045,.09],[.08,.035]]) {
          const l:Vec3=start.map(n=>n-width/2) as Vec3,h:Vec3=end.map(n=>n+width/2) as Vec3
          mesh.box(l,h,color(tint,alpha),1)
        }
      }
    }
  }
  return mesh
}
