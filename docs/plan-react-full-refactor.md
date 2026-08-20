# 全量 React 化重构计划

> 日期：2026-08-20
> 状态：已确认（决策点 1/2 不执行，决策点 3 执行；分期顺序认可）
> 分支：feature/react-ui

## 背景

当前插件处于「命令式 DOM → React」迁移的中间状态：主日历视图（GCMainView + 6 视图 + 工具栏）已 React 化，但侧栏、模态框、设置面板、旧组件（TaskCard/TagSelector/TagPill）仍为命令式 createEl 实现，且已有 React 视图内残留 `new Menu`/`setIcon`/`addEventListener` 等命令式调用。

目标：抛弃历史技术包袱，按纯 React 思路重写全部视图 UI 表现，充分发挥 React 声明式、状态驱动、组件复用的优势。

## 现状画像（待消灭的命令式残留）

| 模块 | 行数 | 现状 |
|---|---|---|
| 侧栏 GCSidebarView + TaskListTab + DailyTimelineTab | ~1213 | 纯命令式（createEl + addEventListener + setIcon） |
| 模态框 ×5（BaseTaskModal/CreateTaskModal/EditTaskModal/ConfirmModal/SyncResultModal） | ~2444 | 纯命令式（含 flatpickr、动态 style 注入） |
| 设置面板 + 15 Builder + 子组件 | ~2500 | 命令式（Obsidian Setting API） |
| 旧 TaskCard/TaskCardRenderer/presets、TagSelector、TagPill | ~1100 | 命令式，与 React 版并行存在 |
| 工具栏/已有视图内残留 | ~25 处 | `new Menu`×3、`setIcon` ref 回调、`activeDocument.addEventListener`、`new XxxModal` |
| 甘特 SVG 引擎 | 2005 | 自研引擎，被 React 容器复用（不重写） |
| tooltip/右键菜单 | ~1263 | 命令式单例/监听，被 React 间接复用 |

## 决策点（已确认）

1. **甘特 SVG 引擎**：**不重写**。保留为外部引擎，仅做 React 封装（useGantt hook），与 flatpickr 同级对待。
2. **设置面板**：**不 React 化**。Obsidian 官方 Setting/SettingGroup API 即为此设计，React 化 2500 行收益有限。仅做死代码清理。
3. **tooltip / 右键菜单**：**React 化**。阶段 0 做成 TooltipProvider / ContextMenu 组件，替换命令式单例 registerTaskContextMenu 与 TooltipManager。

## 设计原则

1. 消灭 `createEl/createDiv/addEventListener/setIcon` 直接调用，全部组件化
2. 一切 UI 状态进 zustand store（含侧栏、模态框、tooltip 开关）
3. 按「每期可独立交付 + 功能等价」切分，不做大爆炸重构
4. BEM 类名体系保留（bem.ts 不变，CSS 资产复用，只清理死代码）

## 分期计划

### 阶段 0 — React 基础设施（新增，不动旧代码）

新建 React 基座组件：

- `ui/components/Icon.tsx` — 声明式图标组件（包装 setIcon）
- `ui/components/DropdownMenu.tsx` — 替换 `new Menu()`（portal + 点击外部关闭）
- `ui/components/Modal.tsx` + `ui/components/ModalProvider.tsx` — portal 模态框系统（受控开关）
- `ui/components/TooltipProvider.tsx` — 声明式 tooltip，替换 TooltipManager 单例
- `ui/components/ContextMenu.tsx` — 声明式右键菜单，替换 registerTaskContextMenu
- `useDragAndDrop` hook — HTML5 DnD 的 React 封装

验收：新增组件在工具栏试用通过，旧代码零改动。

### 阶段 1 — 工具栏 + 已有视图去残留

- `Toolbar.tsx`：`new Menu`×3 → DropdownMenu；`setIcon` ref → Icon；`new CreateTaskModal` → React Modal
- `DayView.tsx`：activeDocument.addEventListener（分割线拖拽）→ useDragAndDrop；setIcon/empty() → Icon 组件
- `WeekView.tsx`：SlotCreateButton setIcon → Icon；new CreateTaskModal → Modal
- `TaskCard.tsx`：右键菜单 → ContextMenu 组件；TooltipManager → TooltipProvider；setCssProps → CSS 类

验收：主视图 6 视图 + 工具栏内无任何命令式 DOM 调用。

### 阶段 2 — 侧栏 React 化

- `GCSidebarView` → React 挂载（复用 reactBridge.ts），状态进 store（sidebarTab、sidebarFilters）
- `TaskListTab`（728 行）→ `ui/panels/TaskListPanel.tsx`（复用 taskFilters.ts + store 筛选状态）
- `DailyTimelineTab`（338 行）→ `ui/panels/DailyTimelinePanel.tsx`
- 删除旧 TaskCardComponent（TaskCard.ts/Renderer.ts/presets）、TagSelector、TagPill 命令式版

验收：侧栏功能等价，命令式组件源码清零，`src/components/` 目录清空或仅剩类型文件。

### 阶段 3 — 模态框 React 化

- BaseTaskModal + CreateTaskModal + EditTaskModal → `ui/modals/TaskFormModal.tsx` + 子组件（时间字段/重复规则/优先级/标签选择）
- ConfirmModal、SyncResultModal、AddCustomStatusModal、EditCustomStatusModal → React
- flatpickr 保留为第三方库，包 React wrapper（useFlatpickr）或替换为原生 input

验收：`src/modals/` 全空，任务创建/编辑/确认/同步结果全部走 React Modal。

### 阶段 4 — 设置面板

不 React 化（决策点 2）。仅清理死代码、删除未接入的 builder（WeekViewSettingsBuilder/SidebarViewSettingsBuilder 等，按需确认）。

### 阶段 5 — 清理与收尾

- 删除全部已迁移旧文件（src/views/ 残留、src/toolbar/、旧组件）
- CSS 清理：删除废弃旧类名规则，合并 React 版样式
- 移除冗余依赖、更新 CLAUDE.md 架构文档
- 全量回归：`npm run build` + `npx jest` + 手动冒烟

最终验收：`grep -c "createEl\|createDiv\|addEventListener\|setIcon"` 在 `src/ui` 下归零，`src/` 全局仅剩 Gantt 引擎/桥接层等合理命令式位置。

## 风险控制

- 每阶段独立可交付，回滚只影响单阶段
- 甘特引擎、数据层、同步系统完全不碰
- 每阶段结束执行 `npm run build` + `npx jest` + 冒烟