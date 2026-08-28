# 甘特图视图交互分析（2026-08-28 重写）

> 旧版本文档基于 frappe-gantt 封装（frappeGanttWrapper / handleStartDateChange /
> updateTaskDatesInLine 正则替换）撰写，该架构已不存在。本文按当前 SVG 渲染引擎重写。

## 一、架构总览

```
GanttView.tsx（React 容器）
  ├── TaskDataAdapter.toGanttChartTasks(GCTask[] → GanttChartTask[])
  ├── GanttChartAdapter（生命周期转发层）
  │     └── SvgGanttRenderer（src/gantt/wrappers/svgGanttRenderer.ts，自绘 SVG 引擎）
  │           ├── Grid 布局（corner/header/tasklist/chart 四区 + 列宽 resizer）
  │           ├── 日期几何（granularity: day/week/month/quarter）
  │           ├── 拖拽状态机（move / resize-left / resize-right）
  │           └── 增量更新（updateTasks：按稳定 ID diff）
  └── TaskUpdateHandler（src/gantt/handlers/taskUpdateHandler.ts）
        └── updateTaskProperties（src/tasks/taskUpdater.ts，文件写回统一入口）
```

## 二、任务条渲染

- **条形起点**：配置的开始字段优先，缺失时回退（`startSourceField` 记录实际来源）；
  任务只有创建时间时以创建时间充当起点。
- **黑色引导段**（`gc-gantt-view__lead-bar`）：创建时间严格早于条形起点时渲染，
  起点由 `resolveLeadStart()` 渲染时实时推导（不依赖解析时固化的 leadStart），
  拖拽过程中实时出现/伸缩/消失。
- **条形颜色**：`getCustomClass` 生成 completed/cancelled/priority-*/status-* 类名，
  渲染层映射为 CSS 变量（`--priority-*-color`），默认 `--interactive-accent`。

## 三、拖拽交互（状态机）

```
mousedown（bar / 左手柄 / 右手柄）
  → startDragging：记录 originalStart/End、元素引用、justFinishedDragging=false
  → mousemove（document 级）：daysDelta = round(deltaX / columnWidth)
      → updateTaskBarVisual：乐观更新主条/手柄/引导条几何（不落盘）
  → mouseup：
      - 无位移（≤3px）：视为点击，justFinishedDragging=true 屏蔽随后的原生 click
        （否则双触发），handleTaskClick 打开任务
      - 有位移：onDateChange(task, newStart, newEnd)
          → 所有更新统一走 updateTaskProperties
```

**写回语义**（TaskUpdateHandler.handleDateChange）：
- 拖拽为日粒度，`preserveTimeOfDay` 把原任务 HH:mm 重新应用，避免时间被清零；
- 条形起点来自**回退字段**（创建时间充当）时，写入配置的开始字段（补 🛫），
  创建时间不动，创建→开始自然形成引导段；
- 写回经 per-file 写锁 + 行内容校验（详见 taskUpdater）。

## 四、增量更新

- `GanttView` 以 `tasksSignature`（id|start|end|leadStart|progress|completed|name|custom_class）
  判定变更，`shouldFullRefresh`（行序变化）触发整引擎重建，否则 `engine.updateTasks`；
- 渲染器按稳定 ID diff 出 added/removed/modified：
  - added+removed > 5 或 modified 日期越界（`isTaskOutsideRenderedRange`）→ 全量 render；
  - modified → `updateTaskBarElement` 更新条/进度/引导条几何与颜色，
    任务名变化时重渲染左侧列表文本；
- 任务 ID 为 `文件名-行号-路径哈希`（行号制），插入行导致的 ID 漂移会退化为
  全量重绘兜底（内容制迁移见 CLAUDE.md 优化空间条目）。

## 五、其他交互

- **滚动同步**：header/tasklist/chart 三区 scroll 互相同步（rAF + isSyncing 标志）；
- **列宽调整**：主 Grid 的 resizer 拖动更新 `--task-column-width` CSS 变量，
  corner/tasklist SVG 的 width 与 viewBox 需同步更新（否则内容按比例缩放错位）；
- **侧栏拖入**：chart 区 drop 接收 `taskId`（filePath:lineNumber），按目标列日期
  保持时长写入；
- **空态**：无任务/筛选无结果/字段未配置有区分的空态提示。

## 六、已知边界与优化方向

- 拖拽未迁移 Pointer Events（无 setPointerCapture，鼠标移出窗口依赖 destroy 兜底）；
- 无 Escape 取消拖拽（误拖需写盘后撤销）；
- 渲染器 2200+ 行待拆分（方案见 code-review-2026-08-27-full-audit.md P2-1）。
