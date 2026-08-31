/**
 * bug3 回归测试：甘特图拖拽只改日期，保留任务的时:分。
 * 完整链路：解析任务 → TaskDataAdapter 转甘特任务 → 模拟渲染器按天拖拽
 * （parseLocalDate 取本地零点 + addDays）→ TaskUpdateHandler.handleDateChange 写回文件。
 */
import { TFile } from 'obsidian';
import { TaskUpdateHandler } from '../src/gantt/handlers/taskUpdateHandler';
import { TaskDataAdapter } from '../src/gantt/adapters/taskDataAdapter';
import { parseSingleTaskLine } from '../src/tasks/taskParser/main';
import type { GCTask, IPluginContext } from '../src/types';

function makeApp(files: Record<string, string>) {
	const fileOf = (path: string) => {
		const f = new TFile();
		f.path = path;
		return f;
	};
	return {
		vault: {
			getAbstractFileByPath: (path: string) => fileOf(path),
			read: async (file: TFile) => files[file.path],
			modify: async (file: TFile, content: string) => {
				files[file.path] = content;
			},
		},
		plugins: { getPlugin: () => null },
	} as unknown as ConstructorParameters<typeof TaskUpdateHandler>[0];
}

function makePlugin(): IPluginContext {
	return {
		settings: { enabledTaskFormats: ['tasks', 'dataview'] },
	} as unknown as IPluginContext;
}

function makeTask(line: string): GCTask {
	const task = parseSingleTaskLine(line, 'notes/p.md', 'p.md', 1);
	if (!task) throw new Error(`fixture line is not a task: ${line}`);
	return task;
}

describe('甘特图拖拽保留时:分（bug3）', () => {
	it('整体拖动 +1 天：定时任务 09:00/12:00 时刻保留，日期改为 09-01', async () => {
		const line = '- [ ] 写周报 🛫 2026-08-31 09:00 📅 2026-08-31 12:00';
		const files = { 'notes/p.md': line };
		const app = makeApp(files);
		const task = makeTask(line);

		// 解析器必须识别出 time 精度（链路前置条件）
		expect(task.datePrecision?.startDate).toBe('time');
		expect(task.datePrecision?.dueDate).toBe('time');

		const ganttTask = TaskDataAdapter.toGanttChartTask(task, 'startDate', 'dueDate');
		expect(ganttTask).not.toBeNull();

		// 渲染器拖拽数学：task.start 为 'yyyy-MM-dd'，parseLocalDate 得本地零点，+1 天
		const newStart = new Date(2026, 8, 1);
		const newEnd = new Date(2026, 8, 1);

		const handler = new TaskUpdateHandler(app, makePlugin());
		await handler.handleDateChange(ganttTask!, newStart, newEnd, 'startDate', 'dueDate', []);

		expect(files['notes/p.md']).toContain('🛫 2026-09-01 09:00');
		expect(files['notes/p.md']).toContain('📅 2026-09-01 12:00');
	});

	it('拖动右端点 +1 天：开始不动，截止日期后移且保留 12:00', async () => {
		const line = '- [ ] 写周报 🛫 2026-08-31 09:00 📅 2026-08-31 12:00';
		const files = { 'notes/p.md': line };
		const app = makeApp(files);
		const task = makeTask(line);
		const ganttTask = TaskDataAdapter.toGanttChartTask(task, 'startDate', 'dueDate')!;

		const handler = new TaskUpdateHandler(app, makePlugin());
		await handler.handleDateChange(ganttTask, new Date(2026, 7, 31), new Date(2026, 8, 1), 'startDate', 'dueDate', []);

		expect(files['notes/p.md']).toContain('🛫 2026-08-31 09:00');
		expect(files['notes/p.md']).toContain('📅 2026-09-01 12:00');
	});

	it('全天精度任务拖拽后保持日期格式（不引入时刻）', async () => {
		const line = '- [ ] 全天任务 🛫 2026-08-31 📅 2026-08-31';
		const files = { 'notes/p.md': line };
		const app = makeApp(files);
		const task = makeTask(line);
		const ganttTask = TaskDataAdapter.toGanttChartTask(task, 'startDate', 'dueDate')!;

		const handler = new TaskUpdateHandler(app, makePlugin());
		await handler.handleDateChange(ganttTask, new Date(2026, 8, 1), new Date(2026, 8, 1), 'startDate', 'dueDate', []);

		expect(files['notes/p.md']).toContain('🛫 2026-09-01');
		expect(files['notes/p.md']).toContain('📅 2026-09-01');
		expect(files['notes/p.md']).not.toMatch(/🛫 \d{4}-\d{2}-\d{2} \d{2}:\d{2}/u);
	});
});
