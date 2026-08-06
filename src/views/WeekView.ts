import { Notice, App } from 'obsidian';
import { BaseViewRenderer } from './BaseViewRenderer';
import { getWeekOfDate } from '../dateUtils/dateUtilsIndex';
import { updateTaskDateField } from '../tasks/taskUpdater';
import type { IPluginContext,  GCTask, CalendarDay } from '../types';
import { getTaskDateField } from '../types';
import type { DateFieldType } from '../settings/types';
import { sortTasks } from '../tasks/taskSorter';
import { TaskCardComponent, WeekViewConfig, type TaskCardConfig } from '../components/TaskCard';
import { Logger } from '../utils/logger';
import { TooltipManager } from '../utils/tooltipManager';
import { WeekViewClasses, TaskCardClasses, setCssProps } from '../utils/bem';
import { toISOStringLocal, createDate } from '../dateUtils/timezone';
import { generateVirtualInstances } from '../tasks/virtualTaskGenerator';
import { renderCurrentTimeLine } from '../utils/currentTimeLine';
import { i18n } from '../i18n/i18n';
import { DragDropManager, setupQuickCreateForSlot, findTaskCard, type QuickCreateConfig } from '../utils/timelineInteractions';

/**
 * 时间轴模式下单日任务容器引用
 */
interface TimelineDaySlots {
	hourTasks: HTMLElement[];
	alldayTasks: HTMLElement;
}

/** 拖拽抑制记录有效期（毫秒），超时后不再抑制刷新 */
const SUPPRESSION_TTL_MS = 2000;

	/**
	 * 周视图渲染器
	 */
export class WeekViewRenderer extends BaseViewRenderer {
	// 时间轴模式持久化标志（一旦激活，会话内保持）
	private timelineActive: boolean = false;

	// 当前渲染日期（供 refreshTasks 使用）
	private currentDate: Date = new Date();

	// 当前拖拽悬停行的行元素数组（用于清除上一行的高亮）
	private dragOverRowEls: HTMLElement[] | null = null;

	// 拖拽乐观更新抑制表：filePath → 拖拽发生时间戳。
	// drop 时已完成乐观 DOM 移动，随后文件写入触发的刷新应被抑制，避免全量重建导致画面跳动/滚动条复位
	private dragSuppression: Map<string, number> = new Map();

	// 时间轴模式下每个日期的任务容器引用（key: 本地日期字符串），用于按日增量刷新
	private timelineDaySlots: Map<string, TimelineDaySlots> = new Map();

	// 时间轴专用配置（启用拖拽）
	private timelineTaskConfig: TaskCardConfig = {
		...WeekViewConfig,
		enableDrag: true,
	};

	constructor(app: App, plugin: IPluginContext) {
		super(app, plugin);
		this.settingsPrefix = 'weekView';
		this.initializeFilterStates(this.settingsPrefix);
		this.initializeSortState({ field: 'priority', order: 'desc' });
	}

	/**
	 * 检测周内是否有带时间精度的任务
	 */
	private hasTimedTasks(tasks: GCTask[], weekStart: Date, weekEnd: Date): boolean {
		const dateField = this.plugin.settings.dateFilterField || 'dueDate';
		for (const task of tasks) {
			const precision = task.datePrecision?.[dateField];
			if (precision === 'time') {
				const dateValue = getTaskDateField(task, dateField);
				if (dateValue) {
					const taskDate = new Date(dateValue);
					if (!isNaN(taskDate.getTime())) {
						taskDate.setHours(0, 0, 0, 0);
						if (taskDate.getTime() >= weekStart.getTime() && taskDate.getTime() <= weekEnd.getTime()) {
							return true;
						}
					}
				}
			}
		}
		return false;
	}

	render(container: HTMLElement, currentDate: Date): void {
		const weekData = getWeekOfDate(currentDate, currentDate.getFullYear(), !!(this.plugin?.settings?.startOnMonday));
		const dayNames = i18n.t('views.weekView.weekdays') as unknown as string[];

		// 清空容器
		container.empty();

		const weekContainer = container.createDiv('gc-view gc-view--week');
		const weekGrid = weekContainer.createDiv(WeekViewClasses.elements.grid);

		const dateField = this.plugin.settings.dateFilterField || 'dueDate';
		const weekStart = new Date(weekData.days[0].date);
		weekStart.setHours(0, 0, 0, 0);
		const weekEnd = new Date(weekData.days[6].date);
		weekEnd.setHours(0, 0, 0, 0);

		// 预先检测是否需要时间轴模式
		const allRealTasks = this.getFilteredRealTasks();
		const hasTimed = this.hasTimedTasks(allRealTasks, weekStart, weekEnd);
		if (hasTimed) this.timelineActive = true;
		const useTimeline = this.timelineActive;

		// 保存当前渲染日期
		this.currentDate = new Date(currentDate);

		// 全量渲染会重建 DOM：容器引用失效，拖拽抑制记录清空
		this.timelineDaySlots.clear();
		this.dragSuppression.clear();

		// 预生成整周的虚拟周期实例
		const allVirtualInstances = generateVirtualInstances(
			allRealTasks, weekStart, weekEnd, dateField, this.plugin.settings.recurringTaskDisplayLimit ?? 5
		);

		if (useTimeline) {
			weekContainer.addClass(WeekViewClasses.modifiers.timeline);
			this.renderTimelineMode(weekGrid, weekData, dayNames, allRealTasks, allVirtualInstances, dateField);
		} else {
			this.renderFlatMode(weekGrid, weekData, dayNames, allVirtualInstances);
		}
	}

	/**
	 * 渲染时间轴模式：header、时间标尺、任务格全部放在同一个 grid 中
	 */
	private renderTimelineMode(
		weekGrid: HTMLElement,
		weekData: { days: CalendarDay[] },
		dayNames: string[],
		allRealTasks: GCTask[],
		allVirtualInstances: GCTask[],
		dateField: string
	): void {
		const W = WeekViewClasses;

		// 所有内容放在同一个 tasksGrid 中（单一 grid 保证对齐）
		const tasksGrid = weekGrid.createDiv(W.elements.tasksGrid);

		// === 第一行：header（sticky） ===
		const spacer = tasksGrid.createDiv(W.elements.headerSpacer);
			setCssProps(spacer, { gridColumn: '1', gridRow: '1' });

		weekData.days.forEach((day, dayIdx) => {
			const dayHeader = tasksGrid.createDiv(W.elements.headerCell);
			setCssProps(dayHeader, { gridColumn: `${dayIdx + 2}`, gridRow: '1' });
			dayHeader.createEl('div', { text: dayNames[day.weekday], cls: W.elements.dayName });
			dayHeader.createEl('div', { text: day.day.toString(), cls: W.elements.dayNumber });
			if (day.lunarText && this.plugin.settings.showLunar) {
				dayHeader.createEl('div', { text: day.lunarText, cls: W.elements.lunarText });
			}
			if (day.isToday) {
				dayHeader.addClass(W.modifiers.today);
			}
		});

		// === 第 2-25 行：时间标尺 + 七列时间格 ===
		// 保存每列每小时的任务容器引用
		const slotContainers: HTMLElement[][] = [];
		// 保存每行所有元素的引用（用于整行高亮）
		const rowElements: HTMLElement[][] = [];

		// === 第 2 行：全天任务行 ===
		const alldayGutter = tasksGrid.createDiv(W.elements.alldayGutter);
		setCssProps(alldayGutter, { gridColumn: '1', gridRow: '2' });
		alldayGutter.setText(i18n.t('views.weekView.allDay'));

		const alldaySlotContainers: HTMLElement[] = [];
		const alldayRowElements: HTMLElement[] = [alldayGutter];

		weekData.days.forEach((day, dayIdx) => {
			const alldaySlot = tasksGrid.createDiv(W.elements.alldaySlot);
			setCssProps(alldaySlot, { gridColumn: `${dayIdx + 2}`, gridRow: '2' });
			if (day.isToday) {
				alldaySlot.addClass(W.modifiers.alldaySlotToday);
			}
			const alldayTasksEl = alldaySlot.createDiv(W.elements.alldayTasks);
			alldaySlotContainers[dayIdx] = alldayTasksEl;
			alldayRowElements.push(alldaySlot);
			this.setupDragDropForAlldaySlot(alldaySlot, day.date, alldayRowElements);
		});

		// 时间标尺（第 1 列，第 3-26 行）
		for (let h = 0; h <= 23; h++) {
			const gutterSlot = tasksGrid.createDiv(W.elements.timeGutterSlot);
			setCssProps(gutterSlot, { gridColumn: '1', gridRow: `${h + 3}` });
			gutterSlot.createDiv(W.elements.timeGutterLabel)
				.setText(`${String(h).padStart(2, '0')}:00`);
			rowElements[h] = [gutterSlot];
		}

		// 七列时间格（第 2-8 列）
		weekData.days.forEach((day, dayIdx) => {
			slotContainers[dayIdx] = [];
			for (let h = 0; h <= 23; h++) {
				const slot = tasksGrid.createDiv(W.elements.timeSlot);
				setCssProps(slot, { gridColumn: `${dayIdx + 2}`, gridRow: `${h + 3}` });
				if (day.isToday) {
					slot.addClass(W.modifiers.timeSlotToday);
				}
				const tasksEl = slot.createDiv(W.elements.timeTasks);
				slotContainers[dayIdx][h] = tasksEl;
				rowElements[h].push(slot);

				this.setupDragDropForTimeSlot(slot, h, day.date, rowElements[h]);
			}
		});

		// 记录每个日期的任务容器引用（按日增量刷新使用）
		weekData.days.forEach((day, dayIdx) => {
			this.timelineDaySlots.set(toISOStringLocal(day.date), {
				hourTasks: slotContainers[dayIdx],
				alldayTasks: alldaySlotContainers[dayIdx],
			});
		});

		// 填充任务到对应时间格
		weekData.days.forEach((day, dayIdx) => {
			this.populateTimelineSlots(
				slotContainers[dayIdx], alldaySlotContainers[dayIdx], day.date, allRealTasks, allVirtualInstances, dateField
			);
		});

		// 空时间格添加 "+" 快速创建
		weekData.days.forEach((day, dayIdx) => {
			for (let h = 0; h <= 23; h++) {
				const tasksEl = slotContainers[dayIdx][h];
				if (tasksEl.children.length === 0) {
					const slot = tasksEl.parentElement as HTMLElement;
					this.setupQuickCreateForSlot(slot, h, day.date);
				}
			}
		});

		// 当前时间指示线
		if (weekData.days.some(day => day.isToday)) {
			renderCurrentTimeLine(tasksGrid, `.${W.elements.timeSlot}`, W.elements.currentTimeLine);
		}
	}

	/**
	 * 渲染扁平列表模式（无定时任务时使用）
	 */
	private renderFlatMode(
		weekGrid: HTMLElement,
		weekData: { days: CalendarDay[] },
		dayNames: string[],
		allVirtualInstances: GCTask[]
	): void {
		const W = WeekViewClasses;

		// 标题行
		const headerRow = weekGrid.createDiv(W.elements.headerRow);
		weekData.days.forEach((day) => {
			const dayHeader = headerRow.createDiv(W.elements.headerCell);
			dayHeader.createEl('div', { text: dayNames[day.weekday], cls: W.elements.dayName });
			dayHeader.createEl('div', { text: day.day.toString(), cls: W.elements.dayNumber });
			if (day.lunarText && this.plugin.settings.showLunar) {
				dayHeader.createEl('div', { text: day.lunarText, cls: W.elements.lunarText });
			}
			if (day.isToday) {
				dayHeader.addClass(W.modifiers.today);
			}
		});

		// 任务网格
		const tasksGrid = weekGrid.createDiv(W.elements.tasksGrid);
		weekData.days.forEach((day) => {
			const dayTasksColumn = tasksGrid.createDiv(W.elements.tasksColumn);
			dayTasksColumn.dataset.date = toISOStringLocal(day.date);
			if (day.isToday) {
				dayTasksColumn.addClass(W.modifiers.tasksColumnToday);
			}

			void this.loadWeekViewTasks(dayTasksColumn, day.date, allVirtualInstances);
			this.setupDragDropForColumn(dayTasksColumn, day.date);
		});
	}

	/**
	 * 填充时间轴任务到指定列的时间格
	 */
	private populateTimelineSlots(
		slotContainers: HTMLElement[],
		alldayContainer: HTMLElement,
		targetDate: Date,
		allRealTasks: GCTask[],
		allVirtualInstances: GCTask[],
		dateField: string
	): void {
		const normalizedTarget = new Date(targetDate);
		normalizedTarget.setHours(0, 0, 0, 0);

		// 筛选当天任务
		let currentDayTasks = allRealTasks.filter(task => {
			const dateValue = getTaskDateField(task, dateField as DateFieldType);
			if (!dateValue) return false;
			const taskDate = new Date(dateValue);
			if (isNaN(taskDate.getTime())) return false;
			taskDate.setHours(0, 0, 0, 0);
			return taskDate.getTime() === normalizedTarget.getTime();
		});

		const virtualForDay = allVirtualInstances.filter(task => {
			const dateValue = getTaskDateField(task, dateField as DateFieldType);
			if (!dateValue) return false;
			const taskDate = new Date(dateValue);
			if (isNaN(taskDate.getTime())) return false;
			taskDate.setHours(0, 0, 0, 0);
			return taskDate.getTime() === normalizedTarget.getTime();
		});

		currentDayTasks = [...currentDayTasks, ...virtualForDay];
		currentDayTasks = sortTasks(currentDayTasks, this.sortState);

		// 分离全天任务和有时段任务
		const allDayTasks: GCTask[] = [];
		const tasksByHour: Map<number, GCTask[]> = new Map();
		for (const task of currentDayTasks) {
			const precision = task.datePrecision?.[dateField as keyof NonNullable<typeof task.datePrecision>];
			if (precision === 'time') {
				const dateValue = getTaskDateField(task, dateField as DateFieldType);
				let hour = 0;
				if (dateValue instanceof Date) {
					hour = dateValue.getHours();
				} else if (dateValue) {
					hour = new Date(dateValue).getHours();
				}
				if (!tasksByHour.has(hour)) tasksByHour.set(hour, []);
				tasksByHour.get(hour)!.push(task);
			} else {
				allDayTasks.push(task);
			}
		}

		// 渲染全天任务
		for (const task of allDayTasks) {
			this.renderTimelineTaskItem(task, alldayContainer, targetDate);
		}

		// 填充到对应容器
		for (let h = 0; h <= 23; h++) {
			const container = slotContainers[h];
			if (!container) continue;
			const hourTasks = tasksByHour.get(h) || [];
			hourTasks.forEach(task => {
				this.renderTimelineTaskItem(task, container, targetDate);
			});
		}
	}

	/**
	 * 渲染时间轴任务项（启用拖拽）
	 */
	private renderTimelineTaskItem(task: GCTask, container: HTMLElement, targetDate: Date): void {
		new TaskCardComponent({
			task,
			config: this.buildTimelineCardConfig(),
			container,
			app: this.app,
			plugin: this.plugin,
			targetDate,
			onClick: (task) => {
				const tooltipManager = TooltipManager.getInstance(this.plugin);
				tooltipManager.hide();
				this.refreshTasks(task.filePath);
			},
		}).render();
	}

	/**
	 * 设置全天任务行的拖放功能
	 */
	private setupDragDropForAlldaySlot(slot: HTMLElement, targetDate: Date, alldayRowEls: HTMLElement[]): void {
		slot.addEventListener('dragover', (e: DragEvent) => {
			e.preventDefault();
			if (e.dataTransfer) {
				e.dataTransfer.dropEffect = 'move';
			}
			alldayRowEls.forEach(el => el.addClass(WeekViewClasses.modifiers.alldayDragOver));
		});

		slot.addEventListener('dragleave', (e: DragEvent) => {
			const related = e.relatedTarget as HTMLElement | null;
			if (related && !slot.contains(related)) {
				alldayRowEls.forEach(el => el.removeClass(WeekViewClasses.modifiers.alldayDragOver));
			}
		});

		slot.addEventListener('drop', (e: DragEvent) => {
			e.preventDefault();
			alldayRowEls.forEach(el => el.removeClass(WeekViewClasses.modifiers.alldayDragOver));

			const taskId = e.dataTransfer?.getData('taskId');
			if (!taskId) return;

			const [filePath, lineNum] = taskId.split(':');
			const lineNumber = parseInt(lineNum, 10);

			const allTasks = this.plugin.taskCache.getAllTasks();
			const sourceTask = allTasks.find((t: GCTask) => t.filePath === filePath && t.lineNumber === lineNumber);
			if (!sourceTask) {
				Logger.error('WeekView', 'Source task not found:', taskId);
				return;
			}

			const dateFieldName = this.plugin.settings.dateFilterField || 'dueDate';

			const alldayTasks = slot.querySelector(`.${WeekViewClasses.elements.alldayTasks}`) as HTMLElement;
			let revertOptimisticMove: (() => void) | null = null;
			if (alldayTasks) {
				revertOptimisticMove = this.optimisticMoveTo(taskId, sourceTask.filePath, alldayTasks, targetDate);
			}

			void (async () => {
				try {
					this.clearTaskTooltips();

					const newDate = new Date(targetDate);
					newDate.setHours(0, 0, 0, 0);

					// 设置为全天任务
					sourceTask.datePrecision = { ...sourceTask.datePrecision, [dateFieldName]: 'day' };

					await updateTaskDateField(
						this.app,
						sourceTask,
						dateFieldName,
						newDate,
						this.plugin.settings.enabledTaskFormats
					);

					Logger.debug('WeekView', 'Task set to all-day via drag-drop', { taskId, targetDate });
				} catch (error) {
					revertOptimisticMove?.();
					Logger.error('WeekView', 'Error updating task to all-day:', error);
					new Notice(i18n.t('views.dayView.updateTaskFailed'));
				}
			})();
		});
	}

	/**
	 * 设置时间格的拖放功能
	 */
	private setupDragDropForTimeSlot(slot: HTMLElement, hour: number, targetDate: Date, rowEls: HTMLElement[]): void {
		const dragDropManager = new DragDropManager({
			targets: rowEls,
			highlightClass: WeekViewClasses.modifiers.dragOver,
			logTag: 'WeekView',
			onDropAccepted: ({ taskId, sourceTask }) => {
				const tasksEl = slot.querySelector(`.${WeekViewClasses.elements.timeTasks}`) as HTMLElement;
				if (tasksEl) {
					return this.optimisticMoveTo(taskId, sourceTask.filePath, tasksEl, targetDate) ?? undefined;
				}
			},
		});
		dragDropManager.setupForSlot(slot, hour, targetDate, this.app, this.plugin);
	}

	/**
	 * 空时间格：hover 显示 "+"，点击创建任务
	 */
	private setupQuickCreateForSlot(slot: HTMLElement, hour: number, targetDate: Date): void {
		const config: QuickCreateConfig = {
			createElClass: WeekViewClasses.elements.slotCreate,
		};
		setupQuickCreateForSlot(slot, hour, targetDate, this.app, this.plugin, config);
	}

	/**
	 * 增量刷新
	 * @param filePath 触发本次刷新的变更文件路径（可选）
	 */
	public refreshTasks(filePath?: string): void {
		const container = activeDocument.querySelector('.gc-view.gc-view--week') as HTMLElement;
		if (!container) return;

		this.pruneSuppression();
		const isTimeline = container.classList.contains(WeekViewClasses.modifiers.timeline);

		Logger.debug('WeekView', `refreshTasks ENTER filePath=${filePath ?? '(none)'} isTimeline=${isTimeline} suppressionKeys=[${Array.from(this.dragSuppression.keys()).join(', ')}]`);

		// 拖拽乐观 DOM 移动已完成：文件写入触发的这次刷新无需重渲染，
		// 但被保留的卡片 DOM 闭包中仍是旧任务对象（悬浮窗/右键菜单数据源），需用最新数据重建绑定
		if (this.consumeSuppression(filePath)) {
			Logger.debug('WeekView', 'refreshTasks SUPPRESSED (drag optimistic move already applied)');
			if (filePath) {
				this.refreshDraggedCards(filePath, container, isTimeline);
			}
			return;
		}

		if (isTimeline) {
			// 优先按日增量刷新，避免重建整个时间轴网格
			if (filePath && this.refreshTimelineTargeted(filePath)) {
				Logger.debug('WeekView', 'refreshTasks -> refreshTimelineTargeted (incremental)');
				return;
			}
			Logger.debug('WeekView', 'refreshTasks -> fullRenderWithScrollPreservation (timeline)');
			this.fullRenderWithScrollPreservation(container);
			return;
		}

		// 扁平列表模式：若出现了定时任务则激活时间轴模式
		const { weekStart, weekEnd } = this.getCurrentWeekRange();
		if (this.hasTimedTasks(this.getFilteredRealTasks(), weekStart, weekEnd)) {
			this.timelineActive = true;
			Logger.debug('WeekView', 'refreshTasks -> fullRenderWithScrollPreservation (flat->timeline switch)');
			this.fullRenderWithScrollPreservation(container);
			return;
		}

		Logger.debug('WeekView', 'refreshTasks -> refreshFlatColumns (incremental)');
		this.refreshFlatColumns(container, filePath);
	}

	/**
	 * 获取当前过滤条件下的真实任务（不含虚拟实例）
	 */
	private getFilteredRealTasks(): GCTask[] {
		return this.applyTagFilter(
			this.applyStatusFilter(this.plugin.taskCache.getAllTasks())
		);
	}

	/**
	 * 拖拽刷新被抑制后，用最新任务数据重建被拖动卡片的 DOM 绑定。
	 * 周期性任务会波及虚拟实例，需按日/按列重建以重新生成实例，而非单卡替换。
	 */
	private refreshDraggedCards(filePath: string, container: HTMLElement, isTimeline: boolean): void {
		const hasRecurring = this.plugin.taskCache.getAllTasks().some(
			t => t.filePath === filePath && !!t.repeat
		);

		if (hasRecurring) {
			if (isTimeline) {
				this.refreshTimelineTargeted(filePath);
			} else {
				this.refreshFlatColumns(container, filePath);
			}
			return;
		}

		const weekRoot = this.findWeekContainer();
		if (!weekRoot) return;

		const freshTasks = this.plugin.taskCache.getAllTasks();
		const cards = weekRoot.querySelectorAll('[data-task-id]');
		for (let i = 0; i < cards.length; i++) {
			const cardEl = cards[i] as HTMLElement;
			const taskId = cardEl.dataset.taskId || '';
			if (!taskId.startsWith(filePath + ':')) continue;

			const lineNumber = parseInt(taskId.slice(taskId.lastIndexOf(':') + 1), 10);
			const freshTask = freshTasks.find(t => t.filePath === filePath && t.lineNumber === lineNumber);
			if (!freshTask) continue;

			this.replaceCardInPlace(cardEl, freshTask);
		}
	}

	/**
	 * 原位替换单张卡片：新元素继承旧元素位置，绑定最新任务对象
	 * （悬浮窗、右键菜单、复选框等闭包数据随之更新）
	 */
	private replaceCardInPlace(oldCard: HTMLElement, task: GCTask): void {
		const parent = oldCard.parentElement;
		if (!parent) return;

		const isTimelineCard = parent.classList.contains(WeekViewClasses.elements.timeTasks)
			|| parent.classList.contains(WeekViewClasses.elements.alldayTasks);

		const result = new TaskCardComponent({
			task,
			config: isTimelineCard ? this.buildTimelineCardConfig() : this.buildFlatCardConfig(),
			container: parent,
			app: this.app,
			plugin: this.plugin,
			targetDate: this.resolveCardTargetDate(oldCard, task),
			onClick: (clickedTask) => {
				const tooltipManager = TooltipManager.getInstance(this.plugin);
				tooltipManager.hide();
				this.refreshTasks(clickedTask.filePath);
			},
		}).render();

		oldCard.replaceWith(result.element);
	}

	/**
	 * 解析卡片的目标日期：优先取乐观移动时写入的 data-target-date，
	 * 其次取任务自身的日期字段值
	 */
	private resolveCardTargetDate(cardEl: HTMLElement, task: GCTask): Date {
		const attr = cardEl.dataset.targetDate;
		if (attr) {
			const parsed = createDate(attr);
			if (!isNaN(parsed.getTime())) return parsed;
		}
		const dateField = this.plugin.settings.dateFilterField || 'dueDate';
		const dateValue = getTaskDateField(task, dateField);
		if (dateValue) {
			const parsed = new Date(dateValue);
			if (!isNaN(parsed.getTime())) return parsed;
		}
		return new Date();
	}

	/**
	 * 时间轴模式卡片配置
	 */
	private buildTimelineCardConfig(): TaskCardConfig {
		return {
			...WeekViewConfig,
			enableDrag: true,
			showCheckbox: this.plugin.settings.weekViewShowCheckbox,
			showTags: this.plugin.settings.weekViewShowTags,
			showPriority: this.plugin.settings.weekViewShowPriority,
			showTicktick: this.plugin.settings.weekViewShowTicktick,
		};
	}

	/**
	 * 扁平列表模式卡片配置
	 */
	private buildFlatCardConfig(): TaskCardConfig {
		return {
			...WeekViewConfig,
			showCheckbox: this.plugin.settings.weekViewShowCheckbox,
			showTags: this.plugin.settings.weekViewShowTags,
			showPriority: this.plugin.settings.weekViewShowPriority,
			showTicktick: this.plugin.settings.weekViewShowTicktick,
		};
	}

	/**
	 * 当前显示周的起止日期
	 */
	private getCurrentWeekRange(): { weekStart: Date; weekEnd: Date } {
		const weekData = getWeekOfDate(this.currentDate, this.currentDate.getFullYear(), !!(this.plugin?.settings?.startOnMonday));
		const weekStart = new Date(weekData.days[0].date);
		weekStart.setHours(0, 0, 0, 0);
		const weekEnd = new Date(weekData.days[6].date);
		weekEnd.setHours(0, 0, 0, 0);
		return { weekStart, weekEnd };
	}

	/**
	 * 当前显示周包含的日期字符串集合（用于判断任务是否落在本周）
	 */
	private getCurrentWeekDateStrings(): Set<string> {
		const weekData = getWeekOfDate(this.currentDate, this.currentDate.getFullYear(), !!(this.plugin?.settings?.startOnMonday));
		return new Set(weekData.days.map(d => toISOStringLocal(d.date)));
	}

	/**
	 * 登记拖拽抑制：该文件下一次由事件链触发的刷新将被跳过
	 */
	private suppressRefreshFor(filePath: string): void {
		this.dragSuppression.set(filePath, Date.now());
	}

	/**
	 * 消费一次拖拽抑制
	 */
	private consumeSuppression(filePath?: string): boolean {
		if (!filePath) return false;
		const ts = this.dragSuppression.get(filePath);
		if (ts === undefined) return false;
		this.dragSuppression.delete(filePath);
		return Date.now() - ts <= SUPPRESSION_TTL_MS;
	}

	/**
	 * 清理过期的拖拽抑制记录
	 */
	private pruneSuppression(): void {
		const now = Date.now();
		for (const [path, ts] of this.dragSuppression) {
			if (now - ts > SUPPRESSION_TTL_MS) {
				this.dragSuppression.delete(path);
			}
		}
	}

	/**
	 * 当前周视图根容器
	 */
	private findWeekContainer(): HTMLElement | null {
		const container = activeDocument.querySelector('.gc-view.gc-view--week');
		return container instanceof HTMLElement ? container : null;
	}

	/**
	 * 乐观 DOM 移动：drop 时同步把被拖拽卡片移动到目标容器，
	 * 并登记抑制随后由文件变更事件链触发的全量刷新。
	 * @returns 回滚函数（文件写入失败时调用）；移动未执行时返回 null
	 */
	private optimisticMoveTo(taskId: string, filePath: string, targetContainer: HTMLElement, targetDate: Date): (() => void) | null {
		const weekRoot = this.findWeekContainer();
		if (!weekRoot || !targetContainer.isConnected) {
			Logger.debug('WeekView', `optimisticMoveTo SKIP: weekRoot=${!!weekRoot} targetConnected=${targetContainer.isConnected}`);
			return null;
		}

		const card = findTaskCard(weekRoot, taskId);
		if (!card) {
			Logger.debug('WeekView', `optimisticMoveTo SKIP: card not found for taskId=${taskId}`);
			return null;
		}

		const sourceParent = card.parentElement;
		const sourceNextSibling = card.nextSibling;
		const oldTargetDateAttr = card.dataset.targetDate;
		const newTargetDateAttr = toISOStringLocal(targetDate);

		if (sourceParent !== targetContainer) {
			targetContainer.appendChild(card);
		}
		card.dataset.targetDate = newTargetDateAttr;
		this.suppressRefreshFor(filePath);
		Logger.debug('WeekView', `optimisticMoveTo OK taskId=${taskId} filePath=${filePath} moved=${sourceParent !== targetContainer}`);

		this.fixTargetPlaceholders(targetContainer);
		if (sourceParent && sourceParent !== targetContainer) {
			this.fixSourcePlaceholders(sourceParent, oldTargetDateAttr);
		}

		return () => {
			this.dragSuppression.delete(filePath);
			if (!card.isConnected) return;
			if (sourceParent && sourceParent.isConnected && card.parentElement !== sourceParent) {
				sourceParent.insertBefore(card, sourceNextSibling);
			}
			card.dataset.targetDate = oldTargetDateAttr;
			this.fixTargetPlaceholders(sourceParent ?? targetContainer);
			if (sourceParent !== targetContainer) {
				this.fixSourcePlaceholders(targetContainer, newTargetDateAttr);
			}
		};
	}

	/**
	 * 任务被移动进目标容器后，清理目标容器中不应保留的占位元素
	 */
	private fixTargetPlaceholders(targetContainer: HTMLElement): void {
		if (targetContainer.classList.contains(WeekViewClasses.elements.timeTasks)) {
			// “+” 快速创建按钮挂载在父级时间格上
			targetContainer.parentElement?.querySelector(`.${WeekViewClasses.elements.slotCreate}`)?.remove();
		} else if (targetContainer.classList.contains(WeekViewClasses.elements.tasksColumn)) {
			targetContainer.querySelector(`.${WeekViewClasses.elements.empty}`)?.remove();
		}
	}

	/**
	 * 任务被移出源容器后，按需恢复源容器占位（空时间格的 “+”、空列的 “无任务”）
	 */
	private fixSourcePlaceholders(sourceParent: HTMLElement, sourceDate?: string): void {
		if (sourceParent.classList.contains(WeekViewClasses.elements.timeTasks)) {
			if (sourceParent.querySelector(`.${TaskCardClasses.block}`)) return;
			const slot = sourceParent.parentElement;
			if (!slot || !slot.classList.contains(WeekViewClasses.elements.timeSlot)) return;
			if (slot.querySelector(`.${WeekViewClasses.elements.slotCreate}`)) return;
			const gridRow = parseInt(slot.style.gridRow, 10);
			if (!Number.isFinite(gridRow) || !sourceDate) return;
			this.setupQuickCreateForSlot(slot, gridRow - 3, createDate(sourceDate));
		} else if (sourceParent.classList.contains(WeekViewClasses.elements.tasksColumn)) {
			if (sourceParent.querySelector(`.${TaskCardClasses.block}`)) return;
			if (sourceParent.querySelector(`.${WeekViewClasses.elements.empty}`)) return;
			sourceParent.createEl('div', { text: i18n.t('common.noTasks'), cls: WeekViewClasses.elements.empty });
		}
	}

	/**
	 * 计算某文件变更所影响的日期集合（本地日期字符串）。
	 * 覆盖两类变化：旧 DOM 中该文件卡片所在的日期（卡片可能被移除/移走），
	 * 以及新数据中该文件任务落入本周的日期（任务可能新增/移入）。
	 * 周期性任务会波及整周（其虚拟实例分布在多天）。
	 */
	private computeAffectedDayDates(root: HTMLElement, filePath: string): Set<string> {
		const dates = new Set<string>();
		const weekDates = this.getCurrentWeekDateStrings();

		const cards = root.querySelectorAll('[data-task-id]');
		for (let i = 0; i < cards.length; i++) {
			const el = cards[i] as HTMLElement;
			const id = el.dataset.taskId || '';
			if (id.startsWith(filePath + ':') && el.dataset.targetDate) {
				dates.add(el.dataset.targetDate);
			}
		}

		const dateField = this.plugin.settings.dateFilterField || 'dueDate';
		for (const task of this.getFilteredRealTasks()) {
			if (task.filePath !== filePath) continue;
			if (task.repeat) {
				weekDates.forEach(d => dates.add(d));
				continue;
			}
			const dateValue = getTaskDateField(task, dateField);
			if (!dateValue) continue;
			const taskDate = new Date(dateValue);
			if (isNaN(taskDate.getTime())) continue;
			const key = toISOStringLocal(taskDate);
			if (weekDates.has(key)) {
				dates.add(key);
			}
		}
		return dates;
	}

	/**
	 * 时间轴模式按日增量刷新：只重建受影响日期的任务格，时间网格/header/滚动位置保持不变
	 * @returns 是否已完成处理（false 表示无法增量，需回退全量渲染）
	 */
	private refreshTimelineTargeted(filePath: string): boolean {
		if (this.timelineDaySlots.size === 0) return false;

		const weekRoot = this.findWeekContainer();
		if (!weekRoot) return false;

		const affectedDates = this.computeAffectedDayDates(weekRoot, filePath);
		if (affectedDates.size === 0) return true;

		const allRealTasks = this.getFilteredRealTasks();
		const dateField = this.plugin.settings.dateFilterField || 'dueDate';
		const { weekStart, weekEnd } = this.getCurrentWeekRange();
		const allVirtualInstances = generateVirtualInstances(
			allRealTasks, weekStart, weekEnd, dateField, this.plugin.settings.recurringTaskDisplayLimit ?? 5
		);

		for (const dateStr of affectedDates) {
			const daySlots = this.timelineDaySlots.get(dateStr);
			if (!daySlots) continue;

			const dayDate = createDate(dateStr);

			for (const tasksEl of daySlots.hourTasks) {
				tasksEl.parentElement?.querySelector(`.${WeekViewClasses.elements.slotCreate}`)?.remove();
				tasksEl.empty();
			}
			daySlots.alldayTasks.empty();

			this.populateTimelineSlots(daySlots.hourTasks, daySlots.alldayTasks, dayDate, allRealTasks, allVirtualInstances, dateField);

			daySlots.hourTasks.forEach(tasksEl => {
				if (tasksEl.children.length === 0) {
					const slot = tasksEl.parentElement;
					if (!slot) return;
					const gridRow = parseInt(slot.style.gridRow, 10);
					if (Number.isFinite(gridRow)) {
						this.setupQuickCreateForSlot(slot, gridRow - 3, dayDate);
					}
				}
			});
		}
		return true;
	}

	/**
	 * 扁平列表模式按列增量刷新：仅重建受影响的日期列
	 */
	private refreshFlatColumns(container: HTMLElement, filePath?: string): void {
		const affectedDates = filePath ? this.computeAffectedDayDates(container, filePath) : null;
		const taskColumns = container.querySelectorAll(`.${WeekViewClasses.elements.tasksColumn}`);
		taskColumns.forEach((column) => {
			const colEl = column as HTMLElement;
			const dateStr = colEl.dataset.date;
			if (!dateStr) return;
			if (affectedDates && !affectedDates.has(dateStr)) return;
			void this.loadWeekViewTasks(colEl, createDate(dateStr));
		});
	}

	/**
	 * 从周视图容器出发，查找实际承担滚动的元素
	 * （时间轴优先检查 tasks-grid，否则向上查找最近的可滚动祖先）
	 */
	private findScrollContainer(container: HTMLElement): HTMLElement | null {
		const tasksGrid = container.querySelector(`.${WeekViewClasses.elements.tasksGrid}`) as HTMLElement;
		if (tasksGrid && tasksGrid.scrollHeight > tasksGrid.clientHeight + 1) {
			const overflowY = activeWindow.getComputedStyle(tasksGrid).overflowY;
			if (overflowY === 'auto' || overflowY === 'scroll') {
				return tasksGrid;
			}
		}
		let el: HTMLElement | null = container;
		while (el) {
			const style = activeWindow.getComputedStyle(el);
			if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1) {
				return el;
			}
			el = el.parentElement;
		}
		return null;
	}

	/**
	 * 必须全量重渲染时，保存并同步恢复真实滚动容器的位置（同步 + rAF 双保险）
	 */
	private fullRenderWithScrollPreservation(container: HTMLElement): void {
		const scrollEl = this.findScrollContainer(container);
		const savedScrollTop = scrollEl ? scrollEl.scrollTop : 0;
		Logger.debug('WeekView', `fullRender BEFORE savedScrollTop=${savedScrollTop} scrollEl=${scrollEl ? scrollEl.className : '(null)'}`);

		const viewContainer = container.parentElement;
		if (!viewContainer) return;

		this.render(viewContainer, this.currentDate);

		if (!scrollEl || savedScrollTop <= 0) return;

		const restore = () => {
			const newRoot = viewContainer.querySelector('.gc-view.gc-view--week') as HTMLElement;
			if (!newRoot) return;
			const target = this.findScrollContainer(newRoot);
			if (target) {
				target.scrollTop = savedScrollTop;
				Logger.debug('WeekView', `fullRender AFTER restored scrollTop=${target.scrollTop} target=${target.className}`);
			}
		};
		restore();
		window.requestAnimationFrame(restore);
	}

	/**
	 * 设置列的拖放功能（扁平列表模式）
	 */
	private setupDragDropForColumn(column: HTMLElement, targetDate: Date): void {
		column.addEventListener('dragover', (e: DragEvent) => {
			e.preventDefault();
			if (e.dataTransfer) {
				e.dataTransfer.dropEffect = 'move';
			}
			setCssProps(column, { backgroundColor: 'var(--background-modifier-hover)' });
		});

		column.addEventListener('dragleave', (e: DragEvent) => {
			if (e.target === column) {
				setCssProps(column, { backgroundColor: '' });
			}
		});

		column.addEventListener('drop', (e: DragEvent) => {
			e.preventDefault();
			setCssProps(column, { backgroundColor: '' });

			const taskId = e.dataTransfer?.getData('taskId');
			if (!taskId) return;

			const [filePath, lineNum] = taskId.split(':');
			const lineNumber = parseInt(lineNum, 10);

			const allTasks = this.plugin.taskCache.getAllTasks();
			const sourceTask = allTasks.find((t: GCTask) => t.filePath === filePath && t.lineNumber === lineNumber);
			if (!sourceTask) {
				Logger.error('WeekView', 'Source task not found:', taskId);
				return;
			}

			const dateFieldName = this.plugin.settings.dateFilterField || 'dueDate';

			const revertOptimisticMove = this.optimisticMoveTo(taskId, sourceTask.filePath, column, targetDate);

			void (async () => {
				try {
					this.clearTaskTooltips();
					await updateTaskDateField(
						this.app,
						sourceTask,
						dateFieldName,
						targetDate,
						this.plugin.settings.enabledTaskFormats
					);
					Logger.debug('WeekView', 'Task drag-drop update successful', { taskId, dateField: dateFieldName, targetDate });
				} catch (error) {
					revertOptimisticMove?.();
					Logger.error('WeekView', 'Error updating task date:', error);
					new Notice(i18n.t('views.dayView.updateDateFailed'));
				}
			})();
		});
	}

	/**
	 * 加载周视图任务（扁平列表模式）
	 */
	private async loadWeekViewTasks(
		columnContainer: HTMLElement,
		targetDate: Date,
		precomputedVirtualInstances?: GCTask[]
	): Promise<void> {
		columnContainer.empty();

		try {
			let tasks: GCTask[] = this.plugin.taskCache.getAllTasks();
			tasks = this.applyStatusFilter(tasks);
			tasks = this.applyTagFilter(tasks);
			const dateField = this.plugin.settings.dateFilterField || 'dueDate';

			const normalizedTarget = new Date(targetDate);
			normalizedTarget.setHours(0, 0, 0, 0);

			let currentDayTasks = tasks.filter(task => {
				const dateValue = getTaskDateField(task, dateField);
				if (!dateValue) return false;
				const taskDate = new Date(dateValue);
				if (isNaN(taskDate.getTime())) return false;
				taskDate.setHours(0, 0, 0, 0);
				return taskDate.getTime() === normalizedTarget.getTime();
			});

			let virtualForDay: GCTask[] = [];
			if (precomputedVirtualInstances) {
				virtualForDay = precomputedVirtualInstances.filter(task => {
					const dateValue = getTaskDateField(task, dateField);
					if (!dateValue) return false;
					const taskDate = new Date(dateValue);
					if (isNaN(taskDate.getTime())) return false;
					taskDate.setHours(0, 0, 0, 0);
					return taskDate.getTime() === normalizedTarget.getTime();
				});
			} else {
				const dayStart = new Date(normalizedTarget);
				const dayEnd = new Date(normalizedTarget);
				virtualForDay = generateVirtualInstances(tasks, dayStart, dayEnd, dateField, this.plugin.settings.recurringTaskDisplayLimit ?? 5);
			}

			currentDayTasks = [...currentDayTasks, ...virtualForDay];
			currentDayTasks = sortTasks(currentDayTasks, this.sortState);

			if (currentDayTasks.length === 0) {
				columnContainer.createEl('div', { text: i18n.t('common.noTasks'), cls: WeekViewClasses.elements.empty });
				return;
			}

			currentDayTasks.forEach(task => this.renderTaskItem(task, columnContainer, targetDate));
		} catch (error) {
			Logger.error('WeekView', 'Error loading week view tasks', error);
			columnContainer.createEl('div', { text: i18n.t('views.dayView.loadError'), cls: WeekViewClasses.elements.empty });
		}
	}

	/**
	 * 渲染周视图任务项（扁平列表模式，使用统一组件）
	 */
	private renderTaskItem(task: GCTask, container: HTMLElement, targetDate: Date): void {
		new TaskCardComponent({
			task,
			config: this.buildFlatCardConfig(),
			container,
			app: this.app,
			plugin: this.plugin,
			targetDate,
			onClick: (task) => {
				const tooltipManager = TooltipManager.getInstance(this.plugin);
				tooltipManager.hide();
				this.refreshTasks(task.filePath);
			},
		}).render();
	}
}
