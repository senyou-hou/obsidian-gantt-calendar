# 插件全面代码审查报告

**日期**: 2026-08-27
**分支**: feature/react-ui（React 重构收尾阶段，lint 0 警告、281 测试全绿之后）
**范围**: 前端 React UI / 视图交互 / 数据解析写回 / 缓存与数据层 / 甘特图渲染引擎 / 飞书同步
**方法**: 四路并行深度审查（UI、解析、数据层、甘特+同步），以下为汇总。

---

## 一、总览

| 领域 | 评价 | 最严重问题 |
|------|------|-----------|
| 前端 UI | 中上 | Fragment 缺 key、直接变异 store 对象、模态框双通道关闭竞态 |
| 数据解析/写回 | **有数据安全隐患** | 行号漂移无防护、并发写竞态、混合格式字段丢失 |
| 缓存/数据层 | 结构合理但失效策略激进 | rename 后缓存永久脏数据、初始化竞态、事件风暴 |
| 甘特渲染引擎 | 功能完整但需拆分 | 无位移点击双触发、增量更新范围漏洞 |
| 飞书同步 | **正确性缺陷最多** | 伪更新循环、行号 off-by-one、删除复活、状态文件非原子 |

P0 共 16 项，P1 共 25 项，P2 共 20 项。**最优先：数据安全类 P0（解析写回 3 项 + 同步 4 项 + 缓存 rename 1 项）**。

---

## 二、P0 问题清单（数据安全与正确性）

### 数据写回（最优先——用户数据可能被静默破坏）

1. **行号漂移无防护** `tasks/taskUpdater.ts:43-52,139`：写回只按 `task.lineNumber` 取行，不校验行内容是否仍是原任务。并发编辑导致行移动后，会把**别的任务行覆写**，静默丢数据。修复：写回前用 `parseTaskLine` 校验 content 一致性，不一致时全文搜索或抛错刷新缓存。
2. **同文件并发写竞态** `taskUpdater.ts:124-183`：无 per-file 写队列。快速连续勾选两个任务，第二次读到旧内容整文件覆盖，第一次修改丢失（"勾两个只生效一个"）。修复：按 filePath 建 Promise 链串行化，或改用 `vault.process()` 原子回调。
3. **混合格式任务字段丢失** `taskSerializer.ts:119-281` + `step3.ts:133`：序列化整行重建，`tasks emoji + dataview` 混用的任务更新时未识别的 dataview 字段**永久丢失**。修复：序列化前保留未识别 token 原文。

### 飞书同步（每轮同步都在产生冗余操作或错行写入）

4. **push-update 记录旧时间戳** `FeishuTaskSync.ts:817-825`：记录的是 PATCH 前的 `updated_at`，下一轮必然伪 pull-update。修复：从 PATCH 响应读新值。
5. **pullCreate 空 lastSyncedContent** `FeishuTaskSync.ts:858`：下一轮必然伪 push-update。修复：拉取后 re-parse 该行再哈希。
6. **pullCreate 行号 off-by-one** `FeishuTaskSync.ts:846-852`：`split('\n').length - 1` 命中末尾空行，后续 update 改错行。修复：process 回调内记录确定行号。
7. **删除复活死循环** `FeishuTaskSync.ts:565-571,947-956`：OB 删除带 GUID 的任务后，下次同步无条件 pull-create 把它加回来。修复：pull 前检查 state 记录的 OB 行是否已消失。
8. **newest-win 冲突策略失效** `FeishuTaskSync.ts:922-937`：比较的是飞书服务器时钟 vs 本地时钟，时钟偏移时本地修改被静默覆盖。修复：SyncRecord 记录 OB 侧行级 mtime。
9. **状态文件非原子写入** `syncState.ts:66-74`：中断产生半截 JSON，load 失败重置空态 → 全量任务被误判变更、大规模重写。修复：临时文件 + rename；load 失败中止同步。
10. **初始化扫描与 modify 并发** `MarkdownDataSource.ts:101-128` + `TaskStore.ts:149-154`：全量任务重复 emit、500ms 重试存在并发窗口（两次全量扫描）。

### 缓存正确性

11. **rename 后缓存永久脏数据** `MarkdownDataSource.ts:483-505`：重命名文件后 L2 缓存仍以旧路径为键且不发任何事件，视图持续显示指向不存在路径的任务。修复：rename 发送 `deletedFilePaths` + 新路径 created。

### UI 正确性

12. **MonthView 缺 Fragment key** `ui/views/MonthView.tsx:130-134`：周列表 map 返回裸 Fragment，React 协调错位风险。修复：`<Fragment key={week.weekNumber}>`。
13. **直接变异 store 任务对象** `WeekView.tsx:191`、`DayView.tsx:161`、`TaskFormModal.tsx:212`：在 `set()` 之外改 `datePrecision`，产生幽灵 mutation。修复：先拷贝再更新。
14. **模态框双通道关闭竞态** `TaskFormModal.tsx:198-201`：`onClose()` 立即卸载，退出动画中断 + 静态元素快照契约脆弱。修复：统一走 `setOpen(false)` + `onExited` 回调。
15. **无位移点击双触发** `svgGanttRenderer.ts:1699-1702,1426-1430`：handleDragEnd 与原生 click 都调用 `handleTaskClick`，打开文件两次。修复：无位移路径也置 `justFinishedDragging`。

---

## 三、P1 重点问题（按主题归纳）

### 性能（5000 任务场景的量化影响）
- **事件风暴**：大文件单字符编辑 → 500 次无字段 diff 的 `task:updated` → 500 次 invalidateCache（`MarkdownDataSource.ts:635-645`；现成的 `detectChanges()` 在热路径未被调用）。docs/plans/2026-04-30 文档结论仍成立。
- **刷新放大**：一次数据变更 = 3 个订阅者 × 全量数组重建 + 全部视图组件重渲染（`GCMainView.ts:69-77`、`GCSidebarView.ts:71-79`、`main.ts:209-211`）。修复：增量通知 + taskId memo。
- **TaskCard 无 memo + 内联回调**：任何 store 更新全量卡片重渲染（`TaskCard.tsx:72` 及各调用方）。
- **同步全库读文件 + O(n³) 模糊匹配**：`FeishuTaskSync.ts:393-411,528-547`，大 vault 同步阻塞 UI。
- **启动无增量跳过**：L3 存了 `lastModified` 却从未用于比较（`MarkdownDataSource.ts:268-307`）。
- **`bumpSettings` 整树重挂载**：改设置 = Gantt 引擎销毁重建（`App.tsx:44-46`）。

### 健壮性
- **token 刷新无单飞**：并发同步竞态轮换 refresh_token，失败链断裂需重新授权（`FeishuProvider.ts:494-535`）。
- **无限流处理**：429 直接熔断同步（`FeishuProvider.ts:563-581`）。
- **create 事件走 metadataCache 路径**：QuickAdd 建文件任务可能静默丢失（`MarkdownDataSource.ts:431-459`）。
- **增量更新日期越界**：modified 任务新日期超出网格范围时任务"消失"（`svgGanttRenderer.ts:1945-1964`）。
- **增量更新不刷新任务名**（`svgGanttRenderer.ts:1841-1857`）。
- **当前时间线不随时间更新**：无定时器，几小时后偏差数小时（`DayView.tsx:110-133`）。
- **写回正则与解析正则不一致**：`+ [ ]`、`1. [ ]`、`> - [ ]` 任务更新必抛错（`taskUpdater.ts:149` vs `RegularExpressions.ts:33`）。
- **时区配置与日期解析割裂**：配置时区 ≠ 系统时区时跨时区往返不无损（`timezone.ts:59-70` vs `:37-42`）。
- **虚拟周期任务与真实任务 key 冲突**（4 个视图各自实现 taskKey）。
- **i18n 模块级固化**：运行时切语言不生效；月标题硬编码英文。

### 安全
- **凭据明文**：refresh_token + client_secret 明文存 data.json，accessToken 可一键复制无脱敏（`SyncSettingsBuilder.ts:453-459`）。平台限制，但需风险提示 + 复制确认。
- **OAuth state 用 Math.random()** 非 CSPRNG（`FeishuOAuth.ts:89-92`）。

---

## 四、架构改进建议（P2 精选）

1. **svgGanttRenderer 拆分**（2202 行）：`GanttLayoutManager`（Grid/滚动/列宽）、`GanttGeometry`（日期↔坐标纯函数，可单测）、`HeaderRenderer`/`TaskListRenderer`/`BarRenderer`、`DragController`（独立状态机）、`RowHighlightController`。`updateTaskBarVisual` 与 `updateTaskBarElement` 的重复定位数学合并进 geometry。这是承载后续修复的最佳载体。
2. **视图公共逻辑抽 hook**：4 个视图重复的 `taskKey`、scoped 过滤链、日期归一化抽成 `useScopedTasks(scope)` 等共享模块。
3. **颜色收编 tokens**：theme/toolbar/task-card/week-view 大量硬编码颜色（`#ff6b6b`、6 个优先级色等）违反 tokens.css 自己定的规范，应引用 `--color-*` 原生变量。
4. **任务 ID 加内容指纹**：纯行号移动时避免 diff 全判 added+removed（`taskDataAdapter.ts:145-151`）。
5. **测试补缺**：taskSerializer/taskUpdater **零测试**（round-trip 属性测试能一次性暴露 P0-3、秒截断、注释丢失）；并发写、时区偏移、无效日期均无覆盖。
6. **文档更新**：`gantt-view-interaction-analysis.md` 引用的 frappeGanttWrapper 等已不存在需重写；`feishu-sync-algorithm.md` 的"孤立任务保留"结论与代码不符。

---

## 五、建议的修复路线

**第一批（数据安全，~1-2 天）**：P0 解析写回三项（行号校验 + per-file 写锁 + 混合格式保留）+ 同步状态三连错（P0-4/5/6）+ 删除复活。每项先补失败测试再修。
**第二批（正确性收尾，~1 天）**：UI P0（Fragment key、store 变异、模态框关闭、双击）+ rename 缓存 + 初始化竞态。
**第三批（性能，2-3 天）**：事件 diff（用现成 detectChanges）+ 增量通知 + TaskCard memo + maxWait 防抖 + 启动 mtime 跳过。对应既有缓存优化计划。
**第四批（架构，按需）**：渲染器拆分 + 视图 hook 抽取 + 颜色 tokens 化 + i18n（对应既有 i18n 计划）+ serializer 测试补齐。
