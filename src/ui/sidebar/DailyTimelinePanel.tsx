import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { Notice } from 'obsidian';
import type { GCTask } from '../../types';
import type { DateFieldType } from '../../settings/types';
import { i18n } from '../../i18n/i18n';
import { SidebarClasses } from '../../utils/bem';
import { buildSidebarConfig } from '../../components/TaskCard';
import { getTodayInTimezone, isTodayInTimezone } from '../../dateUtils/timezone';
import { formatDate } from '../../dateUtils/dateUtilsIndex';
import { openFileInExistingLeaf } from '../../utils/fileOpener';
import { updateTaskDateField } from '../../tasks/taskUpdater';
import { openCreateTaskModal } from '../modals/TaskFormModal';
import { Logger } from '../../utils/logger';
import { usePlugin, useApp } from '../pluginContext';
import { useCalendarStore } from '../store/calendarStore';
import { useDropTarget } from '../utils/useDragAndDrop';
import { getTaskTimeWindow, windowCoversDay, computeDaySegment, type TimedTaskSegment } from '../utils/taskTimeline';
import { TaskCard } from '../components/TaskCard';
import { Icon } from '../components/Icon';

const TIMELINE_SLOT_CLASS = SidebarClasses.elements.timelineTimeSlot;
const TIMELINE_CURRENT_TIME_CLASS = SidebarClasses.elements.timelineCurrentTime;

/**
 * 侧边�?�?今日时间�?Tab（React 版）
 * 全天区域 + 24 小时格，支持拖放改期/改时间、空槽点击创建任�?
 */
export function DailyTimelinePanel(): JSX.Element {
	const plugin = usePlugin();
	const app = useApp();
	const tasks = useCalendarStore((s) => s.tasks);

	const today = useMemo(() => getTodayInTimezone(), []);
	const allTasks = tasks;
	const config = useMemo(() => buildSidebarConfig(plugin.settings), [plugin.settings]);
	const dateField: DateFieldType = plugin.settings.dateFilterField || 'dueDate';

	// 今天的时间窗口任务（未取�?+ [开�? 截止] 覆盖今日�?
	const todayTasks = useMemo(
		() => allTasks.filter(t => {
			if (t.cancelled) return false;
			const win = getTaskTimeWindow(t, dateField);
			return !!win && windowCoversDay(win, today);
		}),
		[allTasks, dateField, today]
	);

	// 全天任务 + 按当日裁剪出的分钟级贴片
	const timelineData = useMemo(() => {
		const allDay: GCTask[] = [];
		const segments: TimedTaskSegment[] = [];
		for (const task of todayTasks) {
			const win = getTaskTimeWindow(task, dateField);
			if (!win || !windowCoversDay(win, today)) continue;
			if (win.isAllday) {
				allDay.push(task);
				continue;
			}
			const seg = computeDaySegment(win, today);
			if (seg) segments.push({ task, seg });
		}
		segments.sort((a, b) => a.seg.topMinutes - b.seg.topMinutes);
		const hourGroups = new Map<number, TimedTaskSegment[]>();
		for (const item of segments) {
			const list = hourGroups.get(item.seg.slotHour);
			if (list) list.push(item);
			else hourGroups.set(item.seg.slotHour, [item]);
		}
		return { allDayTasks: allDay, segments, hourGroups };
	}, [todayTasks, dateField, today]);

	// ===== 拖放：时间格 =====
	const handleSlotDrop = (hour: number, taskId: string): void => {
		const [filePath, lineNum] = taskId.split(':');
		const lineNumber = parseInt(lineNum, 10);
		const sourceTask = allTasks.find(t => t.filePath === filePath && t.lineNumber === lineNumber);
		if (!sourceTask) {
			Logger.error('DailyTimelinePanel', 'Source task not found:', taskId);
			return;
		}

		void (async () => {
			try {
				const newDate = new Date(today);
				newDate.setHours(hour, 0, 0, 0);
				sourceTask.datePrecision = { ...sourceTask.datePrecision, [dateField]: 'time' };
				await updateTaskDateField(app, sourceTask, dateField, newDate, plugin.settings.enabledTaskFormats);
				Logger.debug('DailyTimelinePanel', 'Task time updated via drag-drop', { taskId, hour });
			} catch (error) {
				Logger.error('DailyTimelinePanel', 'Error updating task time:', error);
				new Notice(i18n.t('views.dayView.updateTimeFailed'));
			}
		})();
	};

	// ===== 拖放：全天区�?=====
	const handleAllDayDrop = (taskId: string): void => {
		const [filePath, lineNum] = taskId.split(':');
		const lineNumber = parseInt(lineNum, 10);
		const sourceTask = allTasks.find(t => t.filePath === filePath && t.lineNumber === lineNumber);
		if (!sourceTask) return;

		void (async () => {
			try {
				sourceTask.datePrecision = { ...sourceTask.datePrecision, [dateField]: 'day' };
				await updateTaskDateField(app, sourceTask, dateField, today, plugin.settings.enabledTaskFormats);
				Logger.debug('DailyTimelinePanel', 'Task set to all-day via drag-drop', { taskId });
			} catch (error) {
				Logger.error('DailyTimelinePanel', 'Error setting task to all-day:', error);
				new Notice(i18n.t('views.dayView.updateTaskFailed'));
			}
		})();
	};

	// ===== 当前时间指示线（React 组件化替�?renderCurrentTimeLine�?=====
	const timelineRef = useRef<HTMLDivElement | null>(null);
	const [currentLineTop, setCurrentLineTop] = useState<number | null>(null);

	useEffect(() => {
		const update = () => {
			if (!timelineRef.current) return;
			const now = new Date();
			const currentHour = now.getHours();
			if (currentHour < 0 || currentHour >= 24) {
				setCurrentLineTop(null);
				return;
			}
			const slots = timelineRef.current.querySelectorAll(`.${TIMELINE_SLOT_CLASS}`);
			const slot = slots[currentHour] as HTMLElement | undefined;
			if (!slot) {
				setCurrentLineTop(null);
				return;
			}
			const minuteOffset = (now.getMinutes() / 60) * slot.offsetHeight;
			setCurrentLineTop(slot.offsetTop + minuteOffset);
		};
		update();
		const interval = window.setInterval(update, 60000);
		return () => window.clearInterval(interval);
	}, [timelineRef, timelineData]);

	// ===== 渲染 =====
	const weekdayNames = i18n.t('sidebar.dailyTimeline.weekdays') as unknown as string[];

	return (
		<>
			<div className={SidebarClasses.elements.timelineHeader}>
				{`${formatDate(today, 'MM/dd')} ${weekdayNames[today.getDay()]}`}
			</div>

			{timelineData.allDayTasks.length === 0 && timelineData.segments.length === 0 ? (
				<div className={SidebarClasses.elements.emptyState}>
					{i18n.t('sidebar.dailyTimeline.noTasks')}
				</div>
			) : null}

			{/* 全天区域（始终渲染为拖放目标�?*/}
			<AllDayDropZone
				onDropTask={handleAllDayDrop}
				renderTasks={(onCardClick) => (
					<>
						{timelineData.allDayTasks.map((task) => (
							<TaskCard
								key={`${task.filePath}:${task.lineNumber}`}
								task={task}
								config={config}
								onClick={onCardClick}
							/>
						))}
					</>
				)}
				openFile={(task) => void openFileInExistingLeaf(app, task.filePath, task.lineNumber)}
			/>

			{/* 时段时间�?*/}
			<div ref={timelineRef} className={SidebarClasses.elements.timeline} style={{ position: 'relative' }}>
				{Array.from({ length: 24 }, (_, hour) => {
					const hourTasks = timelineData.hourGroups.get(hour) || [];
					// 本格是否被其他贴片纵向覆盖（覆盖时隐藏快速创建按钮）
					const coveredBySegment = timelineData.segments.some((s) =>
						s.seg.slotHour !== hour &&
						s.seg.topMinutes < (hour + 1) * 60 &&
						s.seg.bottomMinutes > hour * 60
					);
					const now = new Date();
					const isCurrentHour = now.getHours() === hour && isTodayInTimezone(today);
					return (
						<TimeSlot
							key={hour}
							hour={hour}
							isCurrentHour={isCurrentHour}
							segments={hourTasks}
							showCreate={hourTasks.length === 0 && !coveredBySegment}
							config={config}
							onDropTask={(taskId) => handleSlotDrop(hour, taskId)}
							onCreateTask={() => {
								openCreateTaskModal({
									app,
									plugin,
									targetDate: today,
									targetHour: hour,
									onSuccess: () => {
										// vault modify event triggers incremental update automatically
									},
								});
							}}
							openFile={(task) => void openFileInExistingLeaf(app, task.filePath, task.lineNumber)}
						/>
					);
				})}
				{currentLineTop !== null ? (
					<div className={TIMELINE_CURRENT_TIME_CLASS} style={{ top: currentLineTop }} />
				) : null}
			</div>
		</>
	);
}

interface TimeSlotProps {
	hour: number;
	isCurrentHour: boolean;
	segments: TimedTaskSegment[];
	showCreate: boolean;
	config: ReturnType<typeof buildSidebarConfig>;
	onDropTask: (taskId: string) => void;
	onCreateTask: () => void;
	openFile: (task: GCTask) => void;
}

function TimeSlot({ hour, isCurrentHour, segments, showCreate, config, onDropTask, onCreateTask, openFile }: TimeSlotProps): JSX.Element {
	const dropProps = useDropTarget({
		onDrop: (taskId) => onDropTask(taskId),
		activeClass: 'gc-sidebar__time-slot--drag-over',
	});

	const className = [
		TIMELINE_SLOT_CLASS,
		isCurrentHour ? 'is-current-hour' : '',
	].filter(Boolean).join(' ');

	return (
		<div className={className} {...dropProps}>
			<div className={SidebarClasses.elements.timelineTimeLabel}>
				{`${String(hour).padStart(2, '0')}:00`}
			</div>
			{segments.length > 0 ? (
				<div className={SidebarClasses.elements.timelineTimeTasks}>
					{segments.map(({ task, seg }) => (
						<div
							key={`${task.filePath}:${task.lineNumber}`}
							className={SidebarClasses.elements.timelineTimeSpan}
							style={{
								marginTop: `calc(var(--gc-tl-slot-h) * ${(seg.offsetMinutes / 60).toFixed(4)})`,
								height: `calc(var(--gc-tl-slot-h) * ${(seg.durationMinutes / 60).toFixed(4)})`,
							}}
						>
							<TaskCard
								task={task}
								config={config}
								onClick={openFile}
							/>
						</div>
					))}
				</div>
			) : showCreate ? (
				<SlotCreateButton onCreateTask={onCreateTask} />
			) : null}
		</div>
	);
}

function SlotCreateButton({ onCreateTask }: { onCreateTask: () => void }): JSX.Element {
	const [hover, setHover] = useState(false);
	return (
		<div
			className={SidebarClasses.elements.timelineSlotCreate}
			onMouseEnter={() => setHover(true)}
			onMouseLeave={() => setHover(false)}
			onClick={(e) => {
				e.stopPropagation();
				onCreateTask();
			}}
		>
			{hover ? <Icon icon="plus" /> : null}
		</div>
	);
}

interface AllDayDropZoneProps {
	onDropTask: (taskId: string) => void;
	renderTasks: (openFile: (task: GCTask) => void) => JSX.Element;
	openFile: (task: GCTask) => void;
}

function AllDayDropZone({ onDropTask, renderTasks, openFile }: AllDayDropZoneProps): JSX.Element {
	const dropProps = useDropTarget({
		onDrop: (taskId) => onDropTask(taskId),
		activeClass: 'gc-sidebar__all-day--drag-over',
	});

	return (
		<div className={SidebarClasses.elements.timelineAllDay} {...dropProps}>
			<div className={SidebarClasses.elements.timelineAllDayLabel}>
				{i18n.t('sidebar.dailyTimeline.allDay')}
			</div>
			{renderTasks(openFile)}
		</div>
	);
}