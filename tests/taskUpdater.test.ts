/**
 * taskUpdater 写回层回归测试：
 * - 行号漂移校验与重定位（P0）
 * - 同文件并发写串行化（P0）
 * - 混合格式未识别字段保留（P0）
 */
import { TFile } from 'obsidian';
import { updateTaskProperties } from '../src/tasks/taskUpdater';
import { parseSingleTaskLine } from '../src/tasks/taskParser/main';
import type { GCTask } from '../src/types';

// ==================== 最小 vault mock ====================

function makeApp(files: Record<string, string>, writes: string[] = []) {
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
				writes.push(content);
			},
		},
		plugins: { getPlugin: () => null },
	} as unknown as Parameters<typeof updateTaskProperties>[0];
}

function makeTask(line: string, filePath = 'notes/p.md', lineNumber = 1): GCTask {
	const task = parseSingleTaskLine(line, filePath, 'p.md', lineNumber)!;
	if (!task) throw new Error(`fixture line is not a task: ${line}`);
	return task;
}

describe('updateTaskProperties - 写回安全', () => {
	it('正常更新：勾选任务并写入完成日期', async () => {
		const files = { 'notes/p.md': '- [ ] 开发任务 🛫 2026-08-20 📅 2026-08-25' };
		const app = makeApp(files);
		const task = makeTask('- [ ] 开发任务 🛫 2026-08-20 📅 2026-08-25');

		await updateTaskProperties(app, task, { completed: true, status: 'done', completionDate: new Date(2026, 7, 27) }, ['tasks', 'dataview']);

		const line = files['notes/p.md'];
		expect(line).toMatch(/^- \[x\]/);
		expect(line).toContain('✅ 2026-08-27');
		expect(line).toContain('🛫 2026-08-20');
	});

	it('行号漂移：上方插入行后仍能定位正确任务行', async () => {
		const original = '- [ ] 目标任务 📅 2026-08-25';
		const files = { 'notes/p.md': `# 标题\n- [ ] 别的任务 📅 2026-08-30\n${original}` };
		const app = makeApp(files);
		// 任务解析时在第 1 行，现在实际在第 3 行
		const task = makeTask(original, 'notes/p.md', 1);

		await updateTaskProperties(app, task, { dueDate: new Date(2026, 8, 1) }, ['tasks', 'dataview']);

		const lines = files['notes/p.md'].split('\n');
		expect(lines[0]).toBe('# 标题');
		expect(lines[1]).toContain('📅 2026-08-30'); // 别的任务未被破坏
		expect(lines[2]).toContain('📅 2026-09-01'); // 目标任务被正确更新
	});

	it('行号漂移且任务已被删除：抛错而非覆写错误行', async () => {
		const files = { 'notes/p.md': '- [ ] 完全不同的任务 📅 2026-08-30' };
		const app = makeApp(files);
		const task = makeTask('- [ ] 已被删除的任务 📅 2026-08-25');

		await expect(
			updateTaskProperties(app, task, { dueDate: new Date(2026, 8, 1) }, ['tasks', 'dataview'])
		).rejects.toThrow(/Task not found in file/);
		// 文件内容未被改动
		expect(files['notes/p.md']).toBe('- [ ] 完全不同的任务 📅 2026-08-30');
	});

	it('混合格式：未识别的 dataview 字段在更新后保留', async () => {
		const line = '- [ ] 混合格式任务 ⏫ [due:: 2026-08-25] [project:: 重构]';
		const files = { 'notes/p.md': line };
		const app = makeApp(files);
		const task = makeTask(line);

		await updateTaskProperties(app, task, { completed: true, status: 'done', completionDate: new Date(2026, 7, 27) }, ['tasks', 'dataview']);

		const result = files['notes/p.md'];
		expect(result).toContain('[project:: 重构]'); // 未识别字段未丢失
		expect(result).toContain('✅ 2026-08-27');
	});

	it('非结构化 %%注释%% 在更新后保留', async () => {
		const line = '- [ ] 带注释任务 %%临时备注%% 📅 2026-08-25';
		const files = { 'notes/p.md': line };
		const app = makeApp(files);
		const task = makeTask(line);

		await updateTaskProperties(app, task, { dueDate: new Date(2026, 8, 2) }, ['tasks', 'dataview']);

		expect(files['notes/p.md']).toContain('%%临时备注%%');
		expect(files['notes/p.md']).toContain('📅 2026-09-02');
	});

	it('并发写：同文件两次快速更新均生效（不丢更新）', async () => {
		const files = {
			'notes/p.md': '- [ ] 任务A 📅 2026-08-25\n- [ ] 任务B 📅 2026-08-25',
		};
		const app = makeApp(files);
		const [taskA, taskB] = [
			makeTask('- [ ] 任务A 📅 2026-08-25', 'notes/p.md', 1),
			makeTask('- [ ] 任务B 📅 2026-08-25', 'notes/p.md', 2),
		];

		// 同时发起，不 await 第一个
		const p1 = updateTaskProperties(app, taskA, { dueDate: new Date(2026, 8, 1) }, ['tasks', 'dataview']);
		const p2 = updateTaskProperties(app, taskB, { dueDate: new Date(2026, 8, 2) }, ['tasks', 'dataview']);
		await Promise.all([p1, p2]);

		const content = files['notes/p.md'];
		expect(content).toContain('任务A 📅 2026-09-01');
		expect(content).toContain('任务B 📅 2026-09-02');
	});

	it('只有创建+截止的任务：拖拽回退起点时补写开始日期而非改创建时间', async () => {
		// 场景：任务无 🛫，甘特条以 ➕ 创建时间充当起点
		const line = '- [ ] 无开始日期任务 ➕ 2026-08-10 📅 2026-08-20';
		const files = { 'notes/p.md': line };
		const app = makeApp(files);
		const task = makeTask(line);

		// 甘特拖拽把起点向后拖到 08-15：handler 应写 startDate（新字段），创建时间不动
		await updateTaskProperties(app, task, {
			startDate: new Date(2026, 7, 15),
			dueDate: new Date(2026, 7, 25),
		}, ['tasks', 'dataview']);

		const result = files['notes/p.md'];
		expect(result).toContain('➕ 2026-08-10'); // 创建时间未被修改
		expect(result).toContain('🛫 2026-08-15'); // 开始日期被新增
		expect(result).toContain('📅 2026-08-25');
	});

	it('+ 与数字列表标记的任务可以更新（此前直接抛错）', async () => {
		const files = { 'notes/p.md': '+ [ ] 加号任务 📅 2026-08-25' };
		const app = makeApp(files);
		const task = makeTask('+ [ ] 加号任务 📅 2026-08-25');

		await updateTaskProperties(app, task, { dueDate: new Date(2026, 8, 3) }, ['tasks', 'dataview']);

		expect(files['notes/p.md']).toMatch(/^\+ \[ \]/);
		expect(files['notes/p.md']).toContain('📅 2026-09-03');
	});
});
