# Modoban

Modoban 是一款以数论思想为基础的回合制网格推箱解谜游戏。名称结合了 modulo（取模）与 Sokoban（推箱子）。玩家通过搬运箱子、调整周期机关和利用传送带，安排一连串机关反应，最终到达出口。

## 设计文档

- [游戏规则](docs/game-rules.zh-CN.md)记录当前已确认的玩法、回合结算、边界情况与规则核对案例。

## 当前状态

项目使用 React、TypeScript 和 Vite。模板示例页面与素材已清理，页面仅保留项目名称，游戏逻辑尚待实现。

当前原型采用二维网格，通过格子样式、方向箭头、机关组号和周期刻度表达状态。

## 本地命令

```sh
npm install
npm run dev
```

```sh
npm run lint
npm run build
npm run preview
```

`lint` 执行 Oxlint，`build` 执行 TypeScript 检查并生成 Vite 产物，`preview` 预览构建产物。
