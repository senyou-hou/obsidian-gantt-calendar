# BEM 命名体系与 CSS 审查报告

**日期**: 2026-08-28
**范围**: src/utils/bem.ts + src/styles/ 全部 CSS（18 文件 5,142 行）+ TS/TSX 类名使用方式

---

## 量化总览

| 指标 | 数值 |
|------|------|
| CSS 总量 | 5,142 行（src/styles 18 文件）；构建产物 styles.css 约 100KB |
| 最大文件 | toolbar.css 737 / settings.css 656 / gantt.css 471 / task-card.css 461 / sidebar.css 420 |
| `gc-` 前缀选择器 | 438 个；非 gc- 约 116 个（vendor 58 + heatmap 25 + 旧 gantt-* 11 + 零散）→ **覆盖率约 79%** |
| `!important` | 32 处（29 处集中 edit-task-modal.css 的 flatpickr 覆盖；3 处 reduced-motion 合理） |
| 硬编码颜色剩余（非回退） | 约 39 处（settings 11 / theme 14 / toolbar 14）+ var() 冗余回退约 40 处 |
| `:root` 裸名变量 | 5 个（--festival-*×3、--task-completed-color、--task-pending-color） |
| TS/TSX 绕过 bem.ts 硬编码类名 | 约 60 处 |
| bem.ts 内非 BEM 字符串 | 8 个 |
| utilities 原子类 | 36 定义 / 21 使用（58%） |
| .theme-dark 覆盖 | 仅 6 处 |

## P1 问题

1. **TS/TSX 绕过 bem.ts 硬编码约 60 处**：热点 TagSelector.tsx:69-122（10+ 处，常量已定义未用）、SettingTab.ts:40-59、SyncSettingsBuilder.ts:215-246（8 处）、tooltipManager.ts:56-243。双轨维护，重命名必漏。
2. **bem.ts 自身保留旧前缀**：bem.ts:421-426（6 个 `gantt-*` 无 gc- 前缀）、:834（gantt-task-empty）、:868-869（sidebar-dropdown），与 gc-gantt-view__* 混用。
3. **flatpickr 覆盖 !important 密集（29 处）**：根因是 sidebar.css:356-368 内联整份 vendor CSS，组件层被迫 !important 压制。应做容器作用域（`.gc-edit-task-modal .flatpickr-*`）或裁剪 vendor 样式。
4. **:root 裸名变量双轨**：--festival-*/--task-completed-color 等注册在全局 :root，泄漏到整个 Obsidian 工作区，与其他插件冲突风险高；应改 --gc-* 并在 tokens 内别名。
5. **heatmap.css 完全游离**：25 个 heatmap-* 类无前缀、25 组硬编码 rgba 未走 --gc-color-* 令牌、依赖 YearView 手写裸类 outside-month（月视图却是规范的 --outside-month）。

## P2 问题

1. main.css 导入顺序：theme.css 夹在组件文件中间；建议 tokens → base → components → views → settings → theme → utilities。
2. 重复规则：theme.css:64-97 六处相同 box-shadow（tokens 的 --gc-elev-* 定义未消费）；toolbar 的 color-mix 重复 4 次应提取变量；completed/pending 状态块按 5 个视图重复 5 遍可合并。
3. 深色主题覆盖不完整：.theme-dark 仅 6 处；toolbar 的白色高光内发光、settings 的橙/棕警示色在暗色下对比度差。
4. 残留硬编码颜色约 39 处 + 冗余 var 回退 40 处（tokens 已带回退，组件内不必重复）。
5. 死样式存疑：bem.ts:415-418 注释保留的旧 gantt-view 容器类（handle-left/right 仍在用）；bem.ts:921 常量名 macaron 生成 macaron-grid 不一致；utilities 15 个原子类未使用。
6. bem.ts 细节：GANTT block 三处命名视角不一致（gantt-view / gantt.css / gantt-task-empty）；部分缩进 tab/空格混用；:145-149 注释与实现不符。

## 修复建议优先级

1. **统一走常量**（P1-1/P1-2）：60 处硬编码替换为 *Classes 常量引用；bem.ts 内 8 个旧字符串迁移——机械但量大，可分文件批做。
2. **flatpickr 作用域化**（P1-3）：一次性消掉 29 处 !important。
3. **裸名变量收编**（P1-4）+ heatmap tokens 化（P1-5）。
4. 其余 P2 随重构推进。

总体评价：BEM 基建（bem.ts 常量工厂）与 tokens 方向正确，短板在**执行一致性**——TS 硬编码、vendor 未作用域化、heatmap/旧前缀游离、深色覆盖不全。
