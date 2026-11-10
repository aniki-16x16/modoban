# Modoban

Modoban 是一款以数论思想为基础的回合制网格推箱解谜游戏。名称结合了 modulo（取模）与 Sokoban（推箱子）。玩家通过搬运箱子、调整周期机关和利用传送带，安排一连串机关反应，最终到达出口。

## 设计文档

- [游戏规则](docs/game-rules.zh-CN.md)记录当前已确认的玩法、回合结算、边界情况与规则核对案例。
- [引擎接口](docs/engine.zh-CN.md)说明数据格式、逻辑结算、动画回放和输入控制的接入方式。

## 当前状态

项目使用 React、TypeScript 和 Vite。`src/engine` 已实现独立于界面的逻辑引擎、动作记录、动画时间线和输入控制器。页面暂时仅显示项目名称，关卡与游戏画面后续接入。

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
