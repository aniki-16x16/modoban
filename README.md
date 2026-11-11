# Modoban

Modoban 是一款以数论思想为基础的回合制网格推箱解谜游戏。名称结合了 modulo（取模）与 Sokoban（推箱子）。玩家通过搬运箱子、调整周期机关和利用传送带，安排一连串机关反应，最终到达出口。

## 设计文档

- [游戏规则](docs/game-rules.zh-CN.md)记录当前已确认的玩法、回合结算、边界情况与规则核对案例。
- [引擎接口](docs/engine.zh-CN.md)说明数据格式、逻辑结算、动画回放和输入控制的接入方式。
- [第一章关卡设计](docs/chapter-one.zh-CN.md)记录教学目标、核心矛盾和解法验证，包含关卡剧透。

## 当前状态

项目使用 React、TypeScript 和 Vite。`src/engine` 已实现独立于界面的逻辑引擎、动作记录、动画时间线和输入控制器。第一章「压住与让路」现有五个可玩关卡：「换班」「回程」「封口」「借力」，以及大型收尾关「连锁」。选关页只展示标志、标题和章节关卡信息，点击关卡进入独立游玩页；支持浏览器前进、后退和关卡链接。

游玩页只保留地图和底部操作提示。使用方向键或 WASD 移动，Z / Backspace 撤销，R 重来，也可点击底部方向提示或在地图上滑动。Esc 打开暂停菜单，再按 Esc 或点击遮罩继续；菜单仅提供「返回关卡选择」。通关后，底部出现 Enter 下一关（最后一关返回选关）的操作提示。

关卡列表位于 `src/levels/chapter-one.ts`，收尾关地图位于 `src/levels/chapter-finale.ts`。五关均使用压力板控制伸缩门：01 侧重分工、暂存与回收；02 要交接同一块压板并重新打开回程通路；03 要分开规划人和箱子的路线，从出口侧反推最后一只箱子；04 教学门推人和推箱；05 将整排推挤、机关连锁、箱子交接和终点摆放结合在一张大型地图中。测试通过正式引擎回放方案，并验证关键约束和补救路线。

当前原型采用二维网格，通过格子样式、方向箭头、机关组号和周期刻度表达状态。

## 本地命令

```sh
npm install
npm run dev
```

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run preview
```

`lint` 执行 Oxlint，`typecheck` 检查应用、配置与测试类型，`test` 使用 Node.js 内置测试运行器。测试已在 Node.js 24 上验证，直接运行 TypeScript 测试文件。

`build` 执行 TypeScript 检查并生成 Vite 产物，`preview` 预览构建产物。
