/**
 * 周视图时间轴贴片纯函数
 *
 * 任务在周视图中的显示窗口由开始（startDate，缺省回退到锚点字段）与
 * 截止（dueDate，缺省回退到锚点字段）构成：
 * - 覆盖判断（windowCoversDay）：窗口触及的每一天都应显示该任务
 * - 贴片定位（computeDaySegment）：把窗口映射到单日，得到分钟级的贴片位置
 *   （slotHour 起始小时格 / offsetMinutes 格内偏移 / durationMinutes 跨度），
 *   支持任意分钟粒度（含 5 分钟）
 * - 跨多天语义：双端均带时刻的任务每天重复相同时刻窗口（如每天 06:15-07:45）；
 *   任一端为日精度（或跨午夜任务）则连续覆盖（首日到午夜、中间全天、末日到截止）
 */
import type { GCTask } from '../../types';
import { getTaskDateField } from '../../types';
import type { DateFieldType } from '../../settings/types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MINUTES_PER_HOUR = 60;

/** 零长度定时窗口（开始==截止且带时间）的默认渲染时长，保证贴片可见 */
const DEFAULT_PATCH_MINUTES = 60;

export interface TaskTimeWindow {
	/** 窗口起点（含） */
	start: Date;
	/** 窗口终点（不含）。日精度的截止已折算为当日结束（次日零点） */
	end: Date;
	startTimed: boolean;
	endTimed: boolean;
	/** 开始与截止均为全天精度 */
	isAllday: boolean;
}

export interface DaySegment {
	/** 当日内贴片上沿（分钟，0~1440） */
	topMinutes: number;
	/** 当日内贴片下沿（分钟，0~1440） */
	bottomMinutes: number;
	/** 贴片起始小时格（渲染宿主） */
	slotHour: number;
	/** 起始小时格内的偏移分钟（0~59） */
	offsetMinutes: number;
	/** 贴片时长（分钟，至少 1） */
	durationMinutes: number;
	/** 是否跨出起始小时格 */
	isSpanning: boolean;
}

interface TimeAnchor {
	date: Date;
	timed: boolean;
}

function startOfDayMs(date: Date): number {
	const d = new Date(date);
	d.setHours(0, 0, 0, 0);
	return d.getTime();
}

export function getTaskTimeWindow(task: GCTask, dateField: DateFieldType): TaskTimeWindow | null {
	const primary = getTaskDateField(task, dateField);
	const primaryTimed = task.datePrecision?.[dateField] === 'time';

	const startDate = getTaskDateField(task, 'startDate');
	const start: TimeAnchor | undefined = startDate
		? { date: startDate, timed: task.datePrecision?.startDate === 'time' }
		: primary
			? { date: primary, timed: primaryTimed }
			: undefined;

	const dueDate = getTaskDateField(task, 'dueDate');
	const end: TimeAnchor | undefined = dueDate
		? { date: dueDate, timed: task.datePrecision?.dueDate === 'time' }
		: primary
			? { date: primary, timed: primaryTimed }
			: start;

	if (!start || !end) return null;
	if (isNaN(start.date.getTime()) || isNaN(end.date.getTime())) return null;

	const startMs = start.timed ? start.date.getTime() : startOfDayMs(start.date);
	let endMs = end.timed ? end.date.getTime() : startOfDayMs(end.date) + MS_PER_DAY;
	if (endMs < startMs) endMs = startMs;

	const isAllday = !start.timed && !end.timed;
	if (!isAllday && endMs === startMs) {
		endMs = startMs + DEFAULT_PATCH_MINUTES * 60 * 1000;
	}

	return {
		start: new Date(startMs),
		end: new Date(endMs),
		startTimed: start.timed,
		endTimed: end.timed,
		isAllday,
	};
}

/** 任务窗口是否触及某一天（日精度截止按“当日结束”覆盖） */
export function windowCoversDay(win: TaskTimeWindow, day: Date): boolean {
	const dayStart = startOfDayMs(day);
	const dayEnd = dayStart + MS_PER_DAY;
	return win.start.getTime() < dayEnd && win.end.getTime() > dayStart;
}

/** 把任务窗口裁剪到某一天得到贴片定位；全天任务或未覆盖当日返回 null */
export function computeDaySegment(win: TaskTimeWindow, day: Date): DaySegment | null {
	if (win.isAllday) return null;

	const dayStart = startOfDayMs(day);
	const dayEnd = dayStart + MS_PER_DAY;
	const startMs = win.start.getTime();
	const endMs = win.end.getTime();
	if (startMs >= dayEnd || endMs <= dayStart) return null;

	// 双端均带时刻的跨多天任务：每天重复相同时刻窗口（如 06:15-07:45），
	// 而非首日到午夜、中间全天的连续跨越
	if (win.startTimed && win.endTimed) {
		const startTOD = Math.round((startMs - startOfDayMs(win.start)) / 60000);
		const endTOD = Math.round((endMs - startOfDayMs(win.end)) / 60000);
		if (endTOD > startTOD) {
			return buildSegment(startTOD, endTOD);
		}
		// 结束时刻 <= 开始时刻（跨午夜任务）：退回连续覆盖语义
	}

	const topMinutes = Math.round((Math.max(startMs, dayStart) - dayStart) / 60000);
	const bottomMinutes = Math.round((Math.min(endMs, dayEnd) - dayStart) / 60000);
	return buildSegment(topMinutes, bottomMinutes);
}

function buildSegment(topMinutes: number, bottomMinutes: number): DaySegment {
	const slotHour = Math.floor(topMinutes / MINUTES_PER_HOUR);
	const offsetMinutes = topMinutes - slotHour * MINUTES_PER_HOUR;
	const durationMinutes = Math.max(bottomMinutes - topMinutes, 1);
	const isSpanning = bottomMinutes > (slotHour + 1) * MINUTES_PER_HOUR;
	return { topMinutes, bottomMinutes, slotHour, offsetMinutes, durationMinutes, isSpanning };
}

/** 视图渲染用的“任务 + 单日贴片”组合 */
export interface TimedTaskSegment {
	task: GCTask;
	seg: DaySegment;
}
