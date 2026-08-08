import { useMemo, type JSX, type MouseEvent as ReactMouseEvent } from 'react';
import { Menu, setIcon } from 'obsidian';
import type { CalendarViewType } from '../../types';
import { ToolbarClasses, CreateTaskButtonClasses } from '../../utils/bem';
import { usePlugin } from '../pluginContext';
import { useCalendarStore, type ViewScope } from '../store/calendarStore';
import { i18n } from '../../i18n/i18n';
import { formatDate, getWeekOfDate } from '../../dateUtils/dateUtilsIndex';
import { CreateTaskModal } from '../../modals/CreateTaskModal';
import { syncFeishuTasks } from '../../commands/feishuCommands';
import type GanttCalendarPlugin from '../../../main';
import type { TaskStatus } from '../../tasks/taskStatus';
import { DEFAULT_TASK_STATUSES } from '../../tasks/taskStatus';

const VIEW_BUTTONS: Array<{ type: CalendarViewType; icon: string }> = [
	{ type: 'day', icon: 'sun' },
	{ type: 'week', icon: 'layout' },
	{ type: 'month', icon: 'grid' },
	{ type: 'year', icon: 'map' },
	{ type: 'task', icon: 'list-checks' },
	{ type: 'gantt', icon: 'chart-gantt' },
];

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getMenuEvent(e: ReactMouseEvent): MouseEvent {
	return e.nativeEvent;
}

/**
 * React 工具栏
 * 左侧 6 视图切换 | 中间标题 | 右侧：筛选 / 排序 / 导航 / 创建任务 / 设置 / 同步 / 刷新
 */
export function ToolbarBar(): JSX.Element {
	const plugin = usePlugin();
	const viewType = useCalendarStore((s) => s.viewType);
	const currentDate = useCalendarStore((s) => s.currentDate);
	const scope = viewType as ViewScope;
	const filter = useCalendarStore((s) => s.viewFilters[scope]);
	const setViewType = useCalendarStore((s) => s.setViewType);
	const setCurrentDate = useCalendarStore((s) => s.setCurrentDate);
	const setStatusFilter = useCalendarStore((s) => s.setStatusFilter);
	const setTagFilter = useCalendarStore((s) => s.setTagFilter);
	const setSort = useCalendarStore((s) => s.setSort);
	const setTasks = useCalendarStore((s) => s.setTasks);

	const showButtonText = plugin.settings.showViewNavButtonText ?? true;
	const startOnMonday = !!plugin.settings.startOnMonday;
	// 订阅设置版本号：设置变更（refreshSettings）时重新读取 plugin.settings
	useCalendarStore((s) => s.settingsVersion);

	// ===== 标题 =====
	const titleText = useMemo(() => {
		switch (viewType) {
			case 'year': return String(currentDate.getFullYear());
			case 'month': return MONTH_ABBR[currentDate.getMonth()];
			case 'week': {
				const week = getWeekOfDate(currentDate, undefined, startOnMonday);
				return `W${week.weekNumber}(${formatDate(week.startDate, 'MM/dd')}-${formatDate(week.endDate, 'MM/dd')})`;
			}
			case 'day': return formatDate(currentDate, 'MM/dd');
			case 'task': return i18n.t('views.taskView.title');
			case 'gantt': return i18n.t('views.ganttView.title');
		}
	}, [viewType, currentDate, startOnMonday]);

	// ===== 导航 =====
	const navigate = (dir: -1 | 1) => {
		const d = new Date(currentDate);
		switch (viewType) {
			case 'year': d.setFullYear(d.getFullYear() + dir); break;
			case 'month': d.setMonth(d.getMonth() + dir); break;
			case 'week': d.setDate(d.getDate() + 7 * dir); break;
			case 'day': d.setDate(d.getDate() + dir); break;
			default: return;
		}
		setCurrentDate(d);
	};

	const goToday = () => {
		if (viewType === 'task' || viewType === 'gantt') return;
		setCurrentDate(new Date());
	};

	// ===== 刷新 =====
	const handleRefresh = async () => {
		await plugin.taskCache.initialize(
			plugin.settings.globalTaskFilter,
			plugin.settings.enabledTaskFormats
		);
		setTasks(plugin.taskCache.getAllTasks());
	};

	// ===== 创建任务 / 设置 / 同步 =====
	const openCreateTask = () => {
		const modal = new CreateTaskModal({
			app: plugin.app,
			plugin,
			targetDate: currentDate,
			onSuccess: () => {},
		});
		modal.open();
	};

	const openSettings = () => {
		const a = plugin.app as unknown as { setting?: { open(): void; openTabById(id: string): void } };
		a.setting?.open();
		a.setting?.openTabById('gantt-calendar');
	};

	// ===== 下拉菜单 =====
	const showStatusMenu = (e: ReactMouseEvent, anchor: HTMLElement) => {
		const menu = new Menu();
		const statuses: TaskStatus[] = plugin.settings.taskStatuses || DEFAULT_TASK_STATUSES;
		const selected = filter?.status.selectedStatuses || [];
		if (!statuses.length) {
			menu.addItem((item) => item.setTitle(i18n.t('toolbar.statusFilter.empty')).setDisabled(true));
		}
		for (const st of statuses) {
			menu.addItem((item) => {
				item.setTitle(st.name);
				item.setChecked(selected.includes(st.key));
				item.onClick(() => {
					const next = selected.includes(st.key)
						? selected.filter((k) => k !== st.key)
						: [...selected, st.key];
					setStatusFilter(scope, { selectedStatuses: next });
				});
			});
		}
		menu.showAtMouseEvent(getMenuEvent(e));
	};

	const showSortMenu = (e: ReactMouseEvent) => {
		const menu = new Menu();
		const fields: Array<{ key: import('../../types').SortField; label: string; i18nKey: string }> = [
			{ key: 'dueDate', label: i18n.t('toolbar.sort.options.dueDate'), i18nKey: 'dueDate' },
			{ key: 'priority', label: i18n.t('toolbar.sort.options.priority'), i18nKey: 'priority' },
			{ key: 'description', label: i18n.t('toolbar.sort.options.description'), i18nKey: 'description' },
			{ key: 'createdDate', label: i18n.t('toolbar.sort.options.createdDate'), i18nKey: 'createdDate' },
			{ key: 'startDate', label: i18n.t('toolbar.sort.options.startDate'), i18nKey: 'startDate' },
			{ key: 'scheduledDate', label: i18n.t('toolbar.sort.options.scheduledDate'), i18nKey: 'scheduledDate' },
			{ key: 'completionDate', label: i18n.t('toolbar.sort.options.completionDate'), i18nKey: 'completionDate' },
		];
		for (const f of fields) {
			menu.addItem((item) => {
				item.setTitle(f.label);
				item.setChecked(filter?.sort.field === f.key);
				item.onClick(() => {
					const order = filter?.sort.order === 'desc' ? 'asc' : 'desc';
					setSort(scope, { field: f.key, order });
				});
			});
		}
		menu.showAtMouseEvent(getMenuEvent(e));
	};

	const showTagMenu = (e: ReactMouseEvent) => {
		const allTasks = plugin.taskCache.getAllTasks();
		const tagSet = new Set<string>();
		for (const t of allTasks) {
			for (const tag of t.tags || []) tagSet.add(tag);
		}
		const allTags = Array.from(tagSet).sort();
		const selected = filter?.tag.selectedTags || [];
		const operator = filter?.tag.operator || 'OR';

		const menu = new Menu();
		for (const op of ['AND', 'OR', 'NOT'] as const) {
			menu.addItem((item) => {
				item.setTitle(op);
				item.setChecked(operator === op);
				item.onClick(() => {
					setTagFilter(scope, { selectedTags: selected, operator: op });
				});
			});
		}
		menu.addSeparator();
		if (!allTags.length) {
			menu.addItem((item) => item.setTitle(i18n.t('toolbar.tagFilter.empty')).setDisabled(true));
		}
		for (const tag of allTags) {
			menu.addItem((item) => {
				item.setTitle(`#${tag}`);
				item.setChecked(selected.includes(tag));
				item.onClick(() => {
					const next = selected.includes(tag)
						? selected.filter((t) => t !== tag)
						: [...selected, tag];
					setTagFilter(scope, { selectedTags: next, operator });
				});
			});
		}
		menu.showAtMouseEvent(getMenuEvent(e));
	};

	// ===== 渲染 =====
	const isCalendar = viewType === 'year' || viewType === 'month' || viewType === 'week' || viewType === 'day';

	return (
		<div className={ToolbarClasses.block}>
			<div className={ToolbarClasses.elements.left}>
				<div className={`${ToolbarClasses.components.viewSelectorGroup.group}${showButtonText ? '' : ` ${ToolbarClasses.components.viewSelectorGroup.iconOnly}`}`}>
					{VIEW_BUTTONS.map((btn) => (
						<button
							key={btn.type}
							className={`${ToolbarClasses.components.viewSelectorGroup.btn}${viewType === btn.type ? ` ${ToolbarClasses.components.viewSelectorGroup.btnActive}` : ''}`}
							aria-label={i18n.t(`toolbar.leftButtons.${btn.type}.ariaLabel`)}
							onClick={() => setViewType(btn.type)}
						>
							<span className={ToolbarClasses.components.viewSelectorGroup.icon} ref={(el) => { if (el) setIcon(el, btn.icon); }} />
							{showButtonText ? (
								<span className={ToolbarClasses.components.viewSelectorGroup.label}>
									{i18n.t(`toolbar.leftButtons.${btn.type}.label`)}
								</span>
							) : null}
						</button>
					))}
				</div>
			</div>

			<div className={ToolbarClasses.elements.center}>
				<span className={ToolbarClasses.components.titleDisplay}>{titleText}</span>
			</div>

			<div className={ToolbarClasses.elements.right}>
				{isCalendar && (
					<>
						{(viewType === 'month' || viewType === 'week' || viewType === 'day') && (
							<ToolbarBtn
								icon="filter"
								label={i18n.t('toolbar.statusFilter.ariaLabel')}
								onClick={(e, el) => showStatusMenu(e, el)}
							/>
						)}
						{(viewType === 'month' || viewType === 'week' || viewType === 'day') && (
							<ToolbarBtn
								icon="arrow-down-up"
								label={i18n.t('toolbar.sort.ariaLabel')}
								onClick={(e) => showSortMenu(e)}
							/>
						)}
						<ToolbarBtn
							icon="tag"
							label={i18n.t('toolbar.tagFilter.ariaLabel')}
							onClick={(e) => showTagMenu(e)}
						/>

						<div className={ToolbarClasses.components.navButtons.group}>
							<ToolbarBtn
								icon="chevron-left"
								label={i18n.t('toolbar.nav.previous')}
								onClick={() => navigate(-1)}
							/>
							<ToolbarBtn
								text={i18n.t('toolbar.nav.today')}
								label={i18n.t('toolbar.nav.goToday')}
								onClick={goToday}
							/>
							<ToolbarBtn
								icon="chevron-right"
								label={i18n.t('toolbar.nav.next')}
								onClick={() => navigate(1)}
							/>
						</div>
					</>
				)}

				<div className={ToolbarClasses.priority.priority3}>
					<div className={ToolbarClasses.components.navButtons.group}>
						<ToolbarBtn
							icon="plus"
							label={i18n.t('toolbar.createTask.ariaLabel')}
							onClick={openCreateTask}
							extra={`${CreateTaskButtonClasses.block} ${CreateTaskButtonClasses.modifiers.toolbar}`}
						/>
					</div>
				</div>

				<div className={ToolbarClasses.components.navButtons.group}>
					<ToolbarBtn
						icon="settings"
						label={i18n.t('toolbar.settingsButton.ariaLabel')}
						onClick={openSettings}
					/>
				</div>

				<div className={ToolbarClasses.components.navButtons.group}>
					<ToolbarBtn
						icon="sync"
						label={i18n.t('toolbar.syncButton.defaultTitle')}
						onClick={() => {
							void syncFeishuTasks(plugin as GanttCalendarPlugin);
						}}
					/>
				</div>

				<div className={ToolbarClasses.components.navButtons.group}>
					<ToolbarBtn
						icon="refresh-cw"
						label={i18n.t('toolbar.refresh.refreshTask')}
						onClick={() => void handleRefresh()}
					/>
				</div>
			</div>
		</div>
	);
}

interface ToolbarBtnProps {
	icon?: string;
	text?: string;
	label: string;
	onClick: (e: ReactMouseEvent, anchor: HTMLElement) => void;
	extra?: string;
}

function ToolbarBtn({ icon, text, label, onClick, extra }: ToolbarBtnProps): JSX.Element {
	return (
		<button
			className={`${ToolbarClasses.components.navButtons.btn}${extra ? ` ${extra}` : ''}`}
			aria-label={label}
			onClick={(e) => onClick(e, e.currentTarget)}
		>
			{icon ? <span ref={(el) => { if (el) setIcon(el, icon); }} /> : text}
		</button>
	);
}