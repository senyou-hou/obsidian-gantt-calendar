import { TaskDataAdapter } from '../src/gantt/adapters/taskDataAdapter';
import type { GCTask } from '../src/types';
import type { DateFieldType } from '../src/gantt/types';

function makeTask(overrides: Partial<GCTask>): GCTask {
	return {
		filePath: 'notes/project.md',
		fileName: 'project.md',
		lineNumber: 10,
		content: '- [ ] task',
		description: 'task',
		completed: false,
		priority: 'normal',
		startDate: new Date(2026, 0, 10),
		dueDate: new Date(2026, 0, 15),
		...overrides,
	};
}

const startField: DateFieldType = 'startDate';
const endField: DateFieldType = 'dueDate';

describe('TaskDataAdapter.toGanttChartTasks - stable IDs', () => {
	it('keeps existing task IDs unchanged when a task is inserted before them', () => {
		const taskA = makeTask({ lineNumber: 10 });
		const taskB = makeTask({ lineNumber: 20 });

		const before = TaskDataAdapter.toGanttChartTasks([taskA, taskB], startField, endField);
		// Insert a new task at the head of the list (e.g. new sort order / filter change)
		const taskNew = makeTask({ lineNumber: 5, startDate: new Date(2026, 0, 1) });
		const after = TaskDataAdapter.toGanttChartTasks([taskNew, taskA, taskB], startField, endField);

		const idOf = (list: { id: string }[], line: number) =>
			list.find(t => t.id.includes(`-${line}-`) || t.id.endsWith(`-${line}`))?.id;

		expect(idOf(after, 10)).toBe(idOf(before, 10));
		expect(idOf(after, 20)).toBe(idOf(before, 20));
	});

	it('produces the same ID for the same task regardless of its position in the list', () => {
		const taskA = makeTask({ lineNumber: 10 });
		const taskB = makeTask({ lineNumber: 20 });

		const list1 = TaskDataAdapter.toGanttChartTasks([taskA, taskB], startField, endField);
		const list2 = TaskDataAdapter.toGanttChartTasks([taskB, taskA], startField, endField);

		const idA1 = list1.find(t => t.lineNumber === 10)?.id;
		const idA2 = list2.find(t => t.lineNumber === 10)?.id;
		expect(idA1).toBe(idA2);
	});

	it('gives duplicate source tasks distinct IDs (e.g. recurring virtual instances)', () => {
		const taskA = makeTask({ lineNumber: 10 });
		const taskACopy = makeTask({ lineNumber: 10, dueDate: new Date(2026, 0, 20) });

		const list = TaskDataAdapter.toGanttChartTasks([taskA, taskACopy], startField, endField);

		expect(list).toHaveLength(2);
		expect(list[0].id).not.toBe(list[1].id);
	});

	it('still produces unique IDs across different files with the same name and line', () => {
		const taskA = makeTask({ filePath: 'a/project.md', fileName: 'project.md', lineNumber: 10 });
		const taskB = makeTask({ filePath: 'b/project.md', fileName: 'project.md', lineNumber: 10 });

		const list = TaskDataAdapter.toGanttChartTasks([taskA, taskB], startField, endField);

		expect(list).toHaveLength(2);
		expect(list[0].id).not.toBe(list[1].id);
	});

	it('filters out tasks missing the configured date fields', () => {
		const ok = makeTask({ lineNumber: 10 });
		const noDates = makeTask({ lineNumber: 20, startDate: undefined, dueDate: undefined });

		const list = TaskDataAdapter.toGanttChartTasks([ok, noDates], startField, endField);

		expect(list).toHaveLength(1);
		expect(list[0].lineNumber).toBe(10);
	});
});

describe('TaskDataAdapter.toGanttChartTasks - start field fallback', () => {
	it('renders tasks with createdDate + dueDate when startDate is missing', () => {
		const task = makeTask({ lineNumber: 30, startDate: undefined, createdDate: new Date(2026, 0, 5) });
		const list = TaskDataAdapter.toGanttChartTasks([task], startField, endField);

		expect(list).toHaveLength(1);
		expect(list[0].start).toBe('2026-01-05');
		expect(list[0].end).toBe('2026-01-15');
		expect(list[0].startSourceField).toBe('createdDate');
		expect(list[0].leadStart).toBeUndefined();
	});

	it('uses startDate as start source when both start and created exist', () => {
		const task = makeTask({ lineNumber: 30, createdDate: new Date(2026, 0, 5) });
		const list = TaskDataAdapter.toGanttChartTasks([task], startField, endField);

		expect(list).toHaveLength(1);
		expect(list[0].start).toBe('2026-01-10');
		expect(list[0].startSourceField).toBe('startDate');
	});

	it('adds a lead segment when createdDate precedes startDate', () => {
		const task = makeTask({ lineNumber: 30, createdDate: new Date(2026, 0, 5) });
		const list = TaskDataAdapter.toGanttChartTasks([task], startField, endField);

		expect(list[0].leadStart).toBe('2026-01-05');
	});

	it('omits the lead segment when createdDate is not before startDate', () => {
		const task = makeTask({ lineNumber: 30, createdDate: new Date(2026, 0, 12) });
		const list = TaskDataAdapter.toGanttChartTasks([task], startField, endField);

		expect(list[0].leadStart).toBeUndefined();
	});

	it('still filters tasks with no start candidate at all', () => {
		const task = makeTask({ lineNumber: 30, startDate: undefined, createdDate: undefined });
		const list = TaskDataAdapter.toGanttChartTasks([task], startField, endField);

		expect(list).toHaveLength(0);
	});

	it('passes datePrecision through for write-back time preservation', () => {
		const task = makeTask({
			lineNumber: 30,
			startDate: new Date(2026, 0, 10, 9, 30),
			dueDate: new Date(2026, 0, 15, 18, 0),
			datePrecision: { startDate: 'time', dueDate: 'time' },
		});
		const list = TaskDataAdapter.toGanttChartTasks([task], startField, endField);

		expect(list[0].datePrecision).toEqual({ startDate: 'time', dueDate: 'time' });
	});
});
