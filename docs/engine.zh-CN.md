# 引擎接口

公共入口位于 [src/engine/index.ts](../src/engine/index.ts)。引擎采用纯 TypeScript，与 React、DOM、渲染和计时器独立。玩法依据 [游戏规则](game-rules.zh-CN.md)。

## 逻辑接口

`GameEngine` 负责载入、行动、撤销和重置。

```ts
import { GameEngine } from './src/engine/index.ts'
import type { LevelDefinition } from './src/engine/index.ts'

function execute(level: LevelDefinition) {
  const engine = new GameEngine(level)
  const result = engine.move('right')

  if (result.accepted) {
    console.log(result.state, result.trace.actions)
  }

  engine.undo()
  engine.reset()
  return engine.state
}
```

- `state` 是最新的完整逻辑快照，`level` 是校验并复制后的关卡定义。
- 状态、关卡定义和动作记录都递归冻结。调用方不能通过修改返回对象改变引擎。
- `move(direction)` 接受 `up`、`right`、`down`、`left`，成功时返回最终状态与 `TurnTrace`。
- 无效行动返回 `accepted: false`，原因是 `blocked` 或 `finished`，保留原状态引用、标记与撤销历史。
- `undo()` 恢复上一个有效行动之前的快照，返回是否有可撤销记录；`canUndo` 提供同一信息。
- `reset()` 恢复载入时的快照并清空撤销历史。
- `outcome.kind` 为 `playing`、`won`、`dead` 或 `loop`。失败信息包含破坏玩家的门，循环信息包含相关动作区间。

一次有效行动同步完成全部逻辑结算。每个自动小轮按机制数组中的传送带顺序、门数组顺序读取最新局面。固定小轮边界比较完整状态，区分停止与真实循环。

## 关卡数据

`parseLevel(value)` 接受未知数据，合法时返回不可变的 `LevelDefinition`，非法时抛出带具体原因的 `LevelValidationError`。`GameEngine` 构造时自动执行相同校验。

| 字段 | 内容 |
| --- | --- |
| `id`、`width`、`height` | 关卡 ID、正整数宽高 |
| `walls` | 不可通行格子的坐标数组 |
| `exit` | 独占一个地面位置的出口坐标 |
| `entities` | 按存储顺序记录玩家、箱子、石块，必须有且只有一个玩家 |
| `mechanisms` | 按存储顺序记录传送带、压力板、卡槽，每格最多一个 |
| `axes` | 周期轴的 ID、`initialPhase` 和布尔数组 `signals`，周期等于数组长度 |
| `doors` | 门的 ID、目标格 `position`、伸出方向、`initialExtended` 与控制输入 |

坐标采用零起点，X 向右、Y 向下。数组顺序保留，不按 ID 或坐标重新排序。

- 传送带具有格子 ID、逻辑 `beltId` 与 `direction`，同一条带的格子共享逻辑 ID。
- 压力板以格子 ID 作为控制输入 ID。
- 卡槽只关联一个 `axisId`；多个槽关联同一轴时，任一箱子或石块占用都会锁住该轴。
- 门的 `position` 是伸出时占据的格子，安装边位于伸出方向的反侧。例如朝左伸入格子 1 的门，安装在格子 1 的右边框。
- 门输入为 `{ kind: 'axis' | 'pressure', id }`。全部输入为真时取反初始状态，无输入时维持基准目标。
- 各类对象的 ID 在各自集合内唯一；控制引用显式区分轴与压力板。

校验覆盖尺寸与坐标、重复 ID、实体重叠、初始门体重叠、地面机关重叠、墙与出口冲突、周期拍位和控制引用。载入后计算信号，但保留配置布局，自动动作从首次有效行动开始。角色初始在出口时直接通关。

## 动作记录与播放

一次成功行动的 `TurnTrace` 包含 `before`、`after` 与有序 `actions`。每个动作包含原子状态变化 `changes` 与因果依赖 `dependsOn`。

- 同一次门动作的破坏、整排推挤和门体伸出位于同一记录中。
- 压力、轴锁定和门目标状态的变化随引起它们的动作记录，供画面在抵达与触发时交接。
- `applyChanges(state, action.changes)` 可以重现记录；这只用于回放，不会再次触发机关。
- 因果依赖覆盖实体、格子占用、输入信号和读写先后。独立动作允许并行，争用位置的动作保留顺序。

`createAnimationPlan(trace, options)` 生成时间线，`sampleAnimation(plan, elapsedMs)` 返回离散展示状态及正在运动的实体、门体。实体运动提供起终点、插值位置和进度；门体提供伸出比例。

引擎默认主动移动与输送为 90ms，门动作为 110ms，周期刻度为 40ms，缓动为 `linear`。时间均可配置，长链没有统一时长截断。`easing` 支持 `linear`、`ease-out-quad`、`ease-out-cubic`、`ease-in-out-cubic`；同一动作中的门体和被推动实体使用同一缓动，保持同步。运动的 `progress` 始终表示线性时间进度，`position` / `extension` 则是缓动后的展示值。

页面参数集中在 `src/motion.ts` 的 `defaultMotionSettings`：移动 110ms、门 110ms、周期刻度 40ms、连续输入收尾 16ms、缓动 `ease-out-quad`、拉伸 30%、到位挤压 20%。二次减速缓动为 `1 - (1 - t)^2`，让角色起步更快。形变沿移动轴先拉伸再压缩，垂直轴反向缩放以保持面积，首尾恢复原状，不增加播放时间；系统偏好减少动态效果时关闭形变。

页面直接使用源码参数，不再提供调参面板或读写浏览器中的运动设置。长按仍使用系统按键重复；该系统的首次重复延迟不由移动时长控制。

## 输入控制器

游戏画面可以使用 `GameController`，由宿主逐帧传入时间增量。

```ts
import { GameController } from './src/engine/index.ts'
import type { LevelDefinition } from './src/engine/index.ts'

function createController(level: LevelDefinition) {
  const controller = new GameController(level)
  controller.input('right')
  const frame = controller.advance(16)
  console.log(frame.state, frame.entities, frame.doors)
  return controller
}
```

- `state` 是已结算的逻辑结果，`frame()` 是当前展示状态；`level` 与 `canUndo` 提供只读信息。
- `input(direction)` 返回 `started`、`buffered`、`blocked` 或 `finished`。
- 动画期间只保留一个输入，后来的方向替换此前方向；当前动画加快至默认 32ms 内收尾，再执行该输入。
- `advance(deltaMs)` 只推进播放时间。等待输入时，时间流逝不会推进周期或运输。
- `animation` 暴露当前计划，支持检查动作；`sampleAnimation` 支持慢速或单步查看。
- `undo()` 与 `reset()` 取消剩余动画和暂存输入，再恢复引擎快照。
- 失败、循环或通关后不再暂存移动输入，保留结果播放和撤销能力。

## 验证

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

测试局面用于验证规则与边界，集中位于 `tests/engine.node.test.ts`。其中包含固定案例、长链案例，以及小规模生成局面的占用、重演和动画依赖核对。
