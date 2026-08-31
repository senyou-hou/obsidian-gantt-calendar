/**
 * 周视图时间轴贴片纯函数回归测试：
 * - bug1：定时任务贴片应从开始时间延伸到截止时间（跨多个小时行），分钟级粒度
 * - bug2：任务应显示在 [开始, 截止] 区间覆盖到的每一天，而不是只显示锚点字段当天
 */
import { getTaskTimeWindow, windowCoversDay, computeDaySegment } from '../src/ui/utils/taskTimeline';
import { parseSingleTaskLine } from '../src/tasks/taskParser/main';
import type { GCTask } from '../src/types';
import type { DateFieldType } from '../src/settings/types';

function makeTask(line: string): GCTask {
	const task = parseSingleTaskLine(line, 'notes/p.md', 'p.md', 1);
	if (!task) throw new Error(`fixture line is not a task: ${line}`);
	return task;
}

/** 本地日零点 */
function day(y: number, m: number, d: number): Date {
	return new Date(y, m - 1, d, 0, 0, 0, 0);
}

describe('getTaskTimeWindow - 任务时间窗口', () => {
	it('同日定时任务：窗口为开始 09:00 → 截止 12:00', () => {
		const task = makeTask('- [ ] 任务 🛫 2026-08-31 09:00 📅 2026-08-31 12:00');
		const win = getTaskTimeWindow(task, 'dueDate' as DateFieldType);
		expect(win).not.toBeNull();
		expect(win!.start).toEqual(new Date(2026, 7, 31, 9, 0));
		expect(win!.end).toEqual(new Date(2026, 7, 31, 12, 0));
		expect(win!.isAllday).toBe(false);
	});

	it('跨日定时任务：窗口跨三天', () => {
		const task = makeTask('- [ ] 跨周任务 🛫 2026-08-31 09:00 📅 2026-09-02 12:00');
		const win = getTaskTimeWindow(task, 'dueDate' as DateFieldType);
		expect(win!.start).toEqual(new Date(2026, 7, 31, 9, 0));
		expect(win!.end).toEqual(new Date(2026, 8, 2, 12, 0));
		expect(win!.isAllday).toBe(false);
	});

	it('仅截止带时间：窗口锚定在截止时刻（零长度默认延伸 60 分钟）', () => {
		const task = makeTask('- [ ] 截止任务 📅 2026-08-31 10:15');
		const win = getTaskTimeWindow(task, 'dueDate' as DateFieldType);
		expect(win!.start).toEqual(new Date(2026, 7, 31, 10, 15));
		expect(win!.end).toEqual(new Date(2026, 7, 31, 11, 15));
		expect(win!.isAllday).toBe(false);
	});

	it('开始与截止均为全天精度：isAllday 为 true', () => {
		const task = makeTask('- [ ] 全天任务 🛫 2026-08-31 📅 2026-09-02');
		const win = getTaskTimeWindow(task, 'dueDate' as DateFieldType);
		expect(win!.isAllday).toBe(true);
	});

	it('锚点字段为 scheduledDate 时按计划时间计算', () => {
		const task = makeTask('- [ ] 计划任务 ⏳ 2026-08-31 08:00');
		const win = getTaskTimeWindow(task, 'scheduledDate' as DateFieldType);
		expect(win!.start).toEqual(new Date(2026, 7, 31, 8, 0));
		expect(win!.isAllday).toBe(false);
	});

	it('仅开始带时间且无截止：窗口锚定在开始时刻', () => {
		const task = makeTask('- [ ] 无截止任务 🛫 2026-08-31 22:30');
		const win = getTaskTimeWindow(task, 'dueDate' as DateFieldType);
		expect(win!.start).toEqual(new Date(2026, 7, 31, 22, 30));
		expect(win!.isAllday).toBe(false);
	});

	it('无任何日期的任务返回 null', () => {
		const task = makeTask('- [ ] 无日期任务');
		expect(getTaskTimeWindow(task, 'dueDate' as DateFieldType)).toBeNull();
	});
});

describe('windowCoversDay - 区间覆盖判断（bug2）', () => {
	it('同日定时任务只覆盖当天', () => {
		const win = getTaskTimeWindow(makeTask('- [ ] 任务 🛫 2026-08-31 09:00 📅 2026-08-31 12:00'), 'dueDate' as DateFieldType)!;
		expect(windowCoversDay(win, day(2026, 8, 31))).toBe(true);
		expect(windowCoversDay(win, day(2026, 8, 30))).toBe(false);
		expect(windowCoversDay(win, day(2026, 9, 1))).toBe(false);
	});

	it('跨日任务覆盖区间内的每一天（bug2 核心）', () => {
		const win = getTaskTimeWindow(makeTask('- [ ] 跨周任务 🛫 2026-08-31 09:00 📅 2026-09-02 12:00'), 'dueDate' as DateFieldType)!;
		expect(windowCoversDay(win, day(2026, 8, 31))).toBe(true);
		expect(windowCoversDay(win, day(2026, 9, 1))).toBe(true);
		expect(windowCoversDay(win, day(2026, 9, 2))).toBe(true);
		expect(windowCoversDay(win, day(2026, 8, 30))).toBe(false);
		expect(windowCoversDay(win, day(2026, 9, 3))).toBe(false);
	});

	it('全天跨日任务覆盖区间内的每一天', () => {
		const win = getTaskTimeWindow(makeTask('- [ ] 全天任务 🛫 2026-08-31 📅 2026-09-02'), 'dueDate' as DateFieldType)!;
		expect(windowCoversDay(win, day(2026, 8, 31))).toBe(true);
		expect(windowCoversDay(win, day(2026, 9, 1))).toBe(true);
		expect(windowCoversDay(win, day(2026, 9, 2))).toBe(true);
		expect(windowCoversDay(win, day(2026, 9, 3))).toBe(false);
	});

	it('截止为全天精度的跨日任务：截止日整天都被覆盖', () => {
		const win = getTaskTimeWindow(makeTask('- [ ] 混合精度 🛫 2026-08-31 09:00 📅 2026-09-01'), 'dueDate' as DateFieldType)!;
		expect(windowCoversDay(win, day(2026, 8, 31))).toBe(true);
		expect(windowCoversDay(win, day(2026, 9, 1))).toBe(true);
		expect(windowCoversDay(win, day(2026, 9, 2))).toBe(false);
	});
});

describe('computeDaySegment - 单日贴片定位（bug1）', () => {
	it('9:00→12:00 任务贴片占用 9/10/11 三个小时行（180 分钟）', () => {
		const win = getTaskTimeWindow(makeTask('- [ ] 任务 🛫 2026-08-31 09:00 📅 2026-08-31 12:00'), 'dueDate' as DateFieldType)!;
		const seg = computeDaySegment(win, day(2026, 8, 31));
		expect(seg).not.toBeNull();
		expect(seg!.slotHour).toBe(9);
		expect(seg!.offsetMinutes).toBe(0);
		expect(seg!.durationMinutes).toBe(180);
		expect(seg!.topMinutes).toBe(540);
		expect(seg!.bottomMinutes).toBe(720);
		expect(seg!.isSpanning).toBe(true);
	});

	it('分钟粒度：10:15 开始的贴片偏移 15 分钟（支持 5 分钟粒度）', () => {
		const win = getTaskTimeWindow(makeTask('- [ ] 截止任务 📅 2026-08-31 10:15'), 'dueDate' as DateFieldType)!;
		const seg = computeDaySegment(win, day(2026, 8, 31))!;
		expect(seg.slotHour).toBe(10);
		expect(seg.offsetMinutes).toBe(15);
		// 零长度窗口默认渲染 1 小时，保证可见（10:15→11:15 跨入 11 点格）
		expect(seg.durationMinutes).toBe(60);
		expect(seg.isSpanning).toBe(true);
	});

	it('跨日任务每天重复同时段窗口：首日 09:00→12:00', () => {
		const win = getTaskTimeWindow(makeTask('- [ ] 跨周任务 🛫 2026-08-31 09:00 📅 2026-09-02 12:00'), 'dueDate' as DateFieldType)!;
		const seg = computeDaySegment(win, day(2026, 8, 31))!;
		expect(seg.topMinutes).toBe(540);
		expect(seg.bottomMinutes).toBe(720);
		expect(seg.durationMinutes).toBe(180);
	});

	it('跨日任务中间日：重复同时段窗口而非整天', () => {
		const win = getTaskTimeWindow(makeTask('- [ ] 跨周任务 🛫 2026-08-31 09:00 📅 2026-09-02 12:00'), 'dueDate' as DateFieldType)!;
		const seg = computeDaySegment(win, day(2026, 9, 1))!;
		expect(seg.topMinutes).toBe(540);
		expect(seg.bottomMinutes).toBe(720);
	});

	it('跨日任务末日：重复同时段窗口 09:00→12:00', () => {
		const win = getTaskTimeWindow(makeTask('- [ ] 跨周任务 🛫 2026-08-31 09:00 📅 2026-09-02 12:00'), 'dueDate' as DateFieldType)!;
		const seg = computeDaySegment(win, day(2026, 9, 2))!;
		expect(seg.topMinutes).toBe(540);
		expect(seg.bottomMinutes).toBe(720);
	});

	it('用户场景：08-30 06:15 → 09-03 07:45，每天重复 06:15-07:45', () => {
		const win = getTaskTimeWindow(makeTask('- [ ] 跨天任务 🛫 2026-08-30 06:15 📅 2026-09-03 07:45'), 'dueDate' as DateFieldType)!;
		const coveredDays = [day(2026, 8, 30), day(2026, 8, 31), day(2026, 9, 1), day(2026, 9, 2), day(2026, 9, 3)];
		for (const d of coveredDays) {
			const seg = computeDaySegment(win, d)!;
			expect(seg.topMinutes).toBe(375);
			expect(seg.bottomMinutes).toBe(465);
			expect(seg.durationMinutes).toBe(90);
		}
		expect(computeDaySegment(win, day(2026, 8, 29))).toBeNull();
		expect(computeDaySegment(win, day(2026, 9, 4))).toBeNull();
	});

	it('截止为日精度的跨日任务：保留连续覆盖（首日 09:00 到午夜）', () => {
		const win = getTaskTimeWindow(makeTask('- [ ] 混合精度 🛫 2026-08-31 09:00 📅 2026-09-01'), 'dueDate' as DateFieldType)!;
		const seg = computeDaySegment(win, day(2026, 8, 31))!;
		expect(seg.topMinutes).toBe(540);
		expect(seg.bottomMinutes).toBe(1440);
		const lastDaySeg = computeDaySegment(win, day(2026, 9, 1))!;
		expect(lastDaySeg.topMinutes).toBe(0);
		expect(lastDaySeg.bottomMinutes).toBe(1440);
	});

	it('全天任务不产生定时贴片（走全天行）', () => {
		const win = getTaskTimeWindow(makeTask('- [ ] 全天任务 🛫 2026-08-31 📅 2026-09-02'), 'dueDate' as DateFieldType)!;
		expect(computeDaySegment(win, day(2026, 9, 1))).toBeNull();
	});

	it('未覆盖当日的窗口不产生贴片', () => {
		const win = getTaskTimeWindow(makeTask('- [ ] 任务 🛫 2026-08-31 09:00 📅 2026-08-31 12:00'), 'dueDate' as DateFieldType)!;
		expect(computeDaySegment(win, day(2026, 9, 1))).toBeNull();
	});
});
