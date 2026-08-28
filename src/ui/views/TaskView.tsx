import { useCallback, useMemo, type JSX } from 'react';
import { taskKey } from '../utils/taskKey';
import type { GCTask } from '../../types';
import { getTaskDateField } from '../../types';
import { TaskViewConfig } from '../../components/TaskCard';
import { TaskViewClasses, ViewClasses } from '../../utils/bem';
import { usePlugin } from '../pluginContext';
import { useCalendarStore, selectViewFilter } from '../store/calendarStore';
import { applyStatusFilter, applyTagFilter, applySort } from '../utils/taskFilters';
import { TaskCard } from '../components/TaskCard';
import { i18n } from '../../i18n/i18n';
import { Logger } from '../../utils/logger';

export function TaskView(): JSX.Element {
	const plugin = usePlugin();
	const tasks = useCalendarStore((s) => s.tasks);
	const filter = useCalendarStore((s) => selectViewFilter(s, 'task'));
	const refreshTasks = useCalendarStore((s) => s.refreshTasks);
	// 稳定回调：TaskCard 已 memo，内联箭头函数会使 memo 失效
	const handleCardRefresh = useCallback(() => refreshTasks(), [refreshTasks]);

	const timeFieldFilter = plugin.settings.taskViewTimeFieldFilter || 'dueDate';
	const dateRangeMode = plugin.settings.taskViewDateRangeMode || 'week';

	const config = useMemo(() => ({
		...TaskViewConfig,
	}), [plugin.settings]);

	const viewData = useMemo(() => {
		try {
			let scoped = applyStatusFilter(tasks, filter.status);
			if (dateRangeMode !== 'all') {
				const ref = new Date();
				let rangeStart: Date;
				let rangeEnd: Date;
				if (dateRangeMode === 'day' || dateRangeMode === 'custom') {
					rangeStart = startOfDay(ref);
					rangeEnd = endOfDay(ref);
				} else if (dateRangeMode === 'week') {
					rangeStart = startOfWeek(ref);
					rangeEnd = endOfWeek(ref);
				} else {
					rangeStart = startOfMonth(ref);
					rangeEnd = endOfMonth(ref);
				}
				scoped = scoped.filter((task) => {
					const dateValue = getTaskDateField(task, timeFieldFilter);
					if (!dateValue) return false;
					const taskDate = new Date(dateValue);
					if (isNaN(taskDate.getTime())) return false;
					return taskDate >= rangeStart && taskDate <= rangeEnd;
				});
			}
			scoped = applyTagFilter(scoped, filter.tag);
			scoped = applySort(scoped, filter.sort);
			return scoped;
		} catch (error) {
			Logger.error('TaskView', 'Error rendering task view', error);
			return null;
		}
	}, [tasks, filter, dateRangeMode, timeFieldFilter]);

	if (viewData === null) {
		return (
			<div className={`${ViewClasses.block} ${ViewClasses.modifiers.task}`}>
				<div className={TaskViewClasses.elements.empty}>{i18n.t('views.taskView.loadError')}</div>
			</div>
		);
	}

	if (viewData.length === 0) {
		return (
			<div className={`${ViewClasses.block} ${ViewClasses.modifiers.task}`}>
				<div className={TaskViewClasses.elements.empty}>{i18n.t('views.taskView.noTasks')}</div>
			</div>
		);
	}

	return (
		<div className={`${ViewClasses.block} ${ViewClasses.modifiers.task}`}>
			{viewData.map((task) => (
				<TaskCard
					key={taskKey(task)}
					task={task}
					config={config}
					onRefresh={handleCardRefresh}
				/>
			))}
		</div>
	);
}


function startOfDay(d: Date): Date {
	const x = new Date(d);
	x.setHours(0, 0, 0, 0);
	return x;
}

function endOfDay(d: Date): Date {
	const x = new Date(d);
	x.setHours(23, 59, 59, 999);
	return x;
}

function startOfWeek(d: Date): Date {
	const x = startOfDay(d);
	const day = x.getDay();
	const diff = (day + 6) % 7;
	x.setDate(x.getDate() - diff);
	return x;
}

function endOfWeek(d: Date): Date {
	const s = startOfWeek(d);
	const e = new Date(s);
	e.setDate(s.getDate() + 6);
	e.setHours(23, 59, 59, 999);
	return e;
}

function startOfMonth(d: Date): Date {
	const x = startOfDay(d);
	x.setDate(1);
	return x;
}

function endOfMonth(d: Date): Date {
	const x = startOfDay(d);
	x.setMonth(x.getMonth() + 1, 0);
	x.setHours(23, 59, 59, 999);
	return x;
}