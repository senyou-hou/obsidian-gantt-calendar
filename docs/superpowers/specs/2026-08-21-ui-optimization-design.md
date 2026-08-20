# UI 优化设计：设计令牌 + Motion 动效 + 适配

日期：2026-08-21
状态：已确认

## 背景与目标

插件已完成 React 19 + zustand 重构（主视图/侧边栏/模态框全面 React 化），但 UI 层仍存在以下问题：

- **不协调**：styles.css（约 4700 行）中硬编码视觉参数打架——91 处 `border-radius`（4px/6px/8px/14px 混用）、39 处 `box-shadow` 无层级体系、153 处 `8px`/85 处 `12px` 间距、`#888888`/`#ff6b4a`/`rgba(0,0,0,.06)` 等硬编码颜色不随 Obsidian 深浅主题切换
- **适配问题**：仅一处 `@media (max-width: 700px)`，窗口拉伸、侧边栏折叠、字体缩放、移动端触屏均无系统化适配
- **无动效**：仅基础 hover 变色，无进出场/过渡/交互反馈动画

目标：建立设计令牌体系统一视觉，引入 Motion 打磨交互动效，系统化解决平台/分辨率适配。

约束：
- 性能优先：动效仅在用户主动操作时触发，列表渲染不加载动效开销
- 风格：克制精致（专业工具感，类似 Linear/Notion）
- 甘特图 SVG 引擎不 React 化（决策保留），仅令牌化 + 交互反馈
- 发布产物必须保持单文件 `styles.css`（Obsidian 官方要求），源码可拆分、构建时合并
- 组件策略：自研轻量组件，不引入重型组件库

## 实施路线

四阶段渐进式，每阶段可独立验证、可回退：

1. **阶段 1：令牌基建 + CSS 源码拆分**（tokens.css + 按模块拆分样式 + esbuild CSS 合并）
2. **阶段 2：通用组件动效**（引入 Motion，六件套动效打磨）
3. **阶段 3：视图适配与过渡**（响应式断点/触控/字体缩放 + 视图切换过渡）
4. **阶段 4：甘特图令牌化 + 交互反馈**（SVG 硬编码值令牌化 + 拖动/悬停动效）

## 阶段 1：令牌基建 + CSS 源码拆分

### 设计令牌（src/styles/tokens.css）

全插件唯一的值源，所有样式引用变量，禁止硬编码数值。

```css
:root {
  /* 背景层级（引用 Obsidian 主题变量，深浅主题自动适配） */
  --gc-bg-sunken: var(--background-primary);
  --gc-bg-surface: var(--background-primary);
  --gc-bg-raised: var(--background-secondary);
  --gc-bg-overlay: color-mix(in srgb, var(--background-primary) 85%, transparent);

  /* 文字 */
  --gc-text-normal: var(--text-normal);
  --gc-text-muted: var(--text-muted);
  --gc-text-faint: var(--text-faint);

  /* 边框 */
  --gc-border: var(--background-modifier-border);
  --gc-border-strong: var(--background-modifier-border-hover);

  /* 主题色 + 状态色（随主题切换） */
  --gc-accent: var(--interactive-accent);
  --gc-status-done: var(--color-green);
  --gc-status-canceled: var(--color-orange);
  --gc-status-overdue: var(--color-red);

  /* 圆角 */
  --gc-radius-xs: 4px;
  --gc-radius-sm: 6px;
  --gc-radius-md: 8px;
  --gc-radius-lg: 12px;
  --gc-radius-full: 999px;

  /* 间距（4px 基准网格） */
  --gc-space-1: 4px;
  --gc-space-2: 8px;
  --gc-space-3: 12px;
  --gc-space-4: 16px;
  --gc-space-5: 24px;
  --gc-space-6: 32px;

  /* 阴影层级（颜色随主题深浅切换） */
  --gc-shadow-color: rgba(0, 0, 0, 0.12);
  --gc-elev-1: 0 1px 2px var(--gc-shadow-color);           /* 凹陷/贴面 */
  --gc-elev-2: 0 4px 12px var(--gc-shadow-color);          /* 悬浮控件 */
  --gc-elev-3: 0 8px 24px var(--gc-shadow-color);          /* 下拉/悬浮窗 */
  --gc-elev-4: 0 16px 48px var(--gc-shadow-color);         /* 模态框 */

  /* 动效 */
  --gc-dur-fast: 120ms;
  --gc-dur-normal: 200ms;
  --gc-dur-slow: 320ms;
  --gc-ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --gc-ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);

  /* 字号（响应式） */
  --gc-font-xs: clamp(10px, 0.6rem, 12px);
  --gc-font-sm: clamp(11px, 0.7rem, 13px);
  --gc-font-md: clamp(13px, 0.85rem, 15px);
  --gc-font-lg: clamp(16px, 1rem, 18px);
}

/* 深色主题微调 */
.theme-dark {
  --gc-shadow-color: rgba(0, 0, 0, 0.45);
}
```

### CSS 源码拆分

```
src/styles/
  ├── tokens.css          ← 设计令牌
  ├── base.css            ← 重置、通用工具类（gc-u-*）
  ├── components/
  │   ├── toolbar.css     ← 工具栏
  │   ├── task-card.css   ← 任务卡片
  │   ├── dropdown.css    ← 下拉菜单
  │   ├── modal.css       ← 模态框
  │   ├── tooltip.css     ← 悬浮提示
  │   └── context-menu.css← 右键菜单
  ├── views/
  │   ├── calendar-views.css  ← 年/月/周/日视图共用
  │   ├── week-view.css
  │   ├── task-view.css
  │   └── gantt.css       ← 甘特图
  └── main.css            ← 入口，@import 上述全部
```

迁移策略：按现有 styles.css 顶部注释分区映射拆分，**本阶段不重写样式值**（保证构建产物与当前一致、零回归）。值令牌化在阶段 2-4 各组件/视图改造时同步进行：改到哪个组件/视图，就把它的硬编码值替换为令牌引用。

### 构建合并

esbuild.config.mjs 增加 CSS 入口（esbuild 原生支持 CSS bundling，递归合并 @import）：

```js
entryPoints: ["main.ts", "src/styles/main.css"],
// 输出 main.js + styles.css（单文件，满足官方发布要求）
```

## 阶段 2：通用组件动效（Motion）

### 依赖

引入 `motion`（framer-motion 新名，React 19 兼容，约 40-50KB gzip）。

### 封装层 src/ui/motion.ts

统一动效参数与预设，与 tokens.css 动效令牌同步：

```ts
export const MOTION = {
  dur: { fast: 0.12, normal: 0.2, slow: 0.32 },
  easeOut: [0.16, 1, 0.3, 1],
  spring: { type: 'spring', stiffness: 500, damping: 35 },
};

// 面板弹出（下拉/右键/悬浮窗统一）
export const panelPreset = {
  initial: { opacity: 0, scale: 0.96, y: -4 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.97, y: -2 },
  transition: { duration: MOTION.dur.fast, ease: MOTION.easeOut },
};

// 模态框（更大位移、更长时长）
export const modalPreset = { /* scale 0.94 → 1 + fade，dur.slow */ };
```

### 各组件动效方案

| 组件 | 动效 |
|---|---|
| DropdownMenu / ContextMenu | 面板 `panelPreset` 弹出（scale+fade+y），项 hover 背景过渡 |
| Modal | 遮罩 fade、面板 scale 0.94→1 + fade，`slow` |
| Tooltip | fade + y 位移，仅 `fast`，延迟沿用现有 SHOW_DELAY |
| TaskCard | hover 微阴影 + 轻微 y 上浮（CSS transition，不用 Motion）；完成打勾 120ms scale 回弹 |
| Toolbar 按钮 | hover 背景/边框过渡（CSS），active 按压 scale 0.97（CSS） |
| 甘特图 | 拖动磁吸回弹、悬停高亮（CSS transition） |

AnimatePresence 仅用于 DropdownMenu/Modal/ContextMenu/Tooltip 的进出场（挂载/卸载组件）；列表渲染不用 AnimatePresence。

### 性能保障

- 只动 `opacity`/`transform`（GPU 合成层），禁止动布局属性
- `prefers-reduced-motion` 媒体查询：系统开启"减少动态效果"时全部降级为瞬切
- portal 渲染的浮层动效不阻塞主视图滚动

## 阶段 3：视图适配与过渡

### 响应式适配

- 硬编码间距/圆角替换为令牌；关键间距用 `clamp()` 相对单位
- 新增断点体系：
  - `>1200px`：完整布局
  - `700-1200px`：工具栏按钮压缩（已有基础）
  - `<700px`：紧凑模式（图标优先、触控目标 ≥32px）
  - `@media (hover: none)` 触屏检测：加大点击区、悬停态改按压态
- 字体缩放（Ctrl+滚轮）：间距/圆角用 `em`/`clamp` 相对缩放

### 视图切换过渡

- `.calendar-content`（key=viewType）用 Motion AnimatePresence 包裹，200ms 交叉淡入（仅 opacity）
- 甘特图除外：SVG 引擎初始化开销大，不做进出场动画，仅渲染完成后淡入

## 阶段 4：甘特图令牌化 + 交互反馈

- SVG 引擎硬编码颜色/字号改为 CSS 变量引用（SVG 属性支持 `var(--gc-*)`），深浅主题自动适配
- 交互动效（CSS transition，不动引擎架构）：拖动任务条磁吸、悬停高亮、进度条拖动预览
- 甘特图内部悬浮窗复用现有 tooltip 机制

## 验证清单

- 桌面端：窗口拉伸、侧边栏折叠、Ctrl+滚轮缩放下 6 视图无错乱
- 移动端（触屏）：点击区 ≥32px、无横向溢出
- 深浅主题切换：无硬编码色残留（grep 检查 `#[0-9a-f]{3,6}` 仅存在于 tokens.css）
- `prefers-reduced-motion` 降级生效
- 性能：动效仅在交互时触发，列表滚动流畅
- 发布产物 styles.css 保持单文件

## 测试

- 现有 Jest 测试（270 用例）保持通过
- 构建：tsc + eslint + esbuild 全部通过
- 每阶段人工验证清单（见上）