import { useEffect, useMemo, useRef, type CSSProperties, type JSX } from 'react';
import type { GCTask } from '../../types';
import type { TaskCardConfig } from '../../components/TaskCard/TaskCardConfig';
import { TaskCardClasses, TimeBadgeClasses, setCssProps } from '../../utils/bem';
import { isVirtualTask, getVirtualMetadata } from '../../tasks/virtualTaskGenerator';
import { getStatusColor, DEFAULT_TASK_STATUSES, getCurrentThemeMode } from '../../tasks/taskStatus';
import { formatDate } from '../../dateUtils/dateUtilsIndex';
import { toISOStringLocal } from '../../dateUtils/timezone';
import { usePlugin, useApp } from '../pluginContext';
import { DescriptionWithLinks } from './DescriptionWithLinks';
import { TagPillSpan } from './TagPillSpan';
import { TooltipManager } from '../../utils/tooltipManager';
import { registerTaskContextMenu } from '../../contextMenu/contextMenuIndex';
import { openFileInExistingLeaf } from '../../utils/fileOpener';
import { updateTaskCompletion } from '../../tasks/taskUpdater';
import { completeRecurringTask } from '../../tasks/recurringTaskCompleter';
import { i18n } from '../../i18n/i18n';
import { Logger } from '../../utils/logger';

export interface ReactTaskCardProps {
	task: GCTask;
	config: TaskCardConfig;
	targetDate?: Date;
	onClick?: (task: GCTask) => void;
	onRefresh?: () => void;
}

const PRIORITY_ICONS: Record<string, string> = {
	highest: '🔺',
	high: '⏫',
	medium: '🔼',
	low: '🔽',
	lowest: '⏬',
};

const PRIORITY_CLASSES: Record<string, string> = {
	highest: 'priority-highest',
	high: 'priority-high',
	medium: 'priority-medium',
	low: 'priority-low',
	lowest: 'priority-lowest',
};

function formatDateForDisplay(date: Date, precision?: 'day' | 'time'): string {
	if (precision === 'time') {
		return formatDate(date, 'yyyy-MM-dd HH:mm');
	}
	return formatDate(date, 'yyyy-MM-dd');
}

/**
 * React 任务卡片组件
 * 输出与原 TaskCardComponent 完全一致的 DOM 结构与 BEM 类名
 */
export function TaskCard({ task, config, targetDate, onClick, onRefresh }: ReactTaskCardProps): JSX.Element {
	const plugin = usePlugin();
	const app = useApp();
	const rootRef = useRef<HTMLDivElement | null>(null);
	const virtual = isVirtualTask(task);
	const tooltipManager = TooltipManager.getInstance(plugin);

	// ===== 类名组装 =====
	const classes = useMemo(() => {
		const list = [TaskCardClasses.block];
		const viewKey = `${config.viewModifier}View` as keyof typeof TaskCardClasses.modifiers;
		const mod = TaskCardClasses.modifiers[viewKey];
		if (mod) list.push(mod);
		if (config.compact) list.push('gc-task-card--compact');
		if (virtual) list.push(TaskCardClasses.modifiers.virtual);
		else if (task.repeat) list.push(TaskCardClasses.modifiers.recurring);
		list.push(task.completed ? TaskCardClasses.modifiers.completed : TaskCardClasses.modifiers.pending);
		return list;
	}, [config.viewModifier, config.compact, virtual, task.repeat, task.completed]);

	// ===== 状态颜色 =====
	const style = useMemo<CSSProperties | undefined>(() => {
		if (!task.status) return undefined;
		const statuses = plugin.settings?.taskStatuses || DEFAULT_TASK_STATUSES;
		const colors = getStatusColor(task.status, statuses, getCurrentThemeMode());
		if (!colors) return undefined;
		return {
			'--task-bg-color': colors.bg,
			'--task-text-color': colors.text,
		} as CSSProperties;
	}, [task.status, plugin.settings, task.completed]);

	// ===== 富文本描述 =====
	const description = useMemo(() => {
		if (!config.showDescription) return null;
		const gf = (plugin.settings.globalTaskFilter || '').trim();
		const textCls = [TaskCardClasses.elements.text];
		if (config.maxLines) textCls.push(TaskCardClasses.modifiers.textLimited);
		const style: CSSProperties | undefined = config.maxLines
			? ({ ['--max-lines']: String(config.maxLines) } as CSSProperties)
			: undefined;
		return (
			<div className={textCls.join(' ')} style={style}>
				{plugin.settings.showGlobalFilterInTaskText && gf ? `${gf} ` : ''}
				<DescriptionWithLinks text={task.description} app={app} />
			</div>
		);
	}, [config.showDescription, config.maxLines, plugin.settings, task.description, app]);

	// ===== 右键菜单（挂载原生监听，复用 registerTaskContextMenu） =====
	useEffect(() => {
		if (virtual || !rootRef.current) return;
		const el = rootRef.current;
		const enabledFormats = plugin.settings.enabledTaskFormats || ['tasks'];
		const taskNotePath = plugin.settings.taskNotePath || 'Tasks';
		registerTaskContextMenu(el, task, app, enabledFormats, taskNotePath, onRefresh || (() => {}));
	}, [task, app, plugin.settings.enabledTaskFormats, plugin.settings.taskNotePath]);

	// ===== 交互事件 =====
	const handleClick = () => {
		if (virtual) {
			void (async () => {
				const meta = getVirtualMetadata(task);
				if (meta?.sourceTaskId) {
					const [filePath, lineStr] = meta.sourceTaskId.split(':');
					await openFileInExistingLeaf(app, filePath, parseInt(lineStr));
				}
				onClick?.(task);
			})();
			return;
		}
		if (config.clickable) {
			void (async () => {
				await openFileInExistingLeaf(app, task.filePath, task.lineNumber);
				onClick?.(task);
			})();
		}
	};

	const handleCheckboxChange = (checked: boolean) => {
		void (async () => {
			try {
				if (checked && task.repeat && !virtual) {
					const dateField = plugin.settings.dateFilterField || 'dueDate';
					await completeRecurringTask(app, task, plugin.settings.enabledTaskFormats, dateField);
				} else if (!virtual) {
					await updateTaskCompletion(app, task, checked, plugin.settings.enabledTaskFormats);
				}
				onRefresh?.();
			} catch (error) {
				Logger.error('TaskCard', 'Error updating task:', error);
			}
		})();
	};

	// ===== 子元素 =====
	const metadataBlock = task.metadataFields && task.metadataFields.length > 0 ? (
		<div className={TaskCardClasses.elements.metadata}>
			{task.metadataFields.map((f, idx) => (
				<div key={idx} className={TaskCardClasses.elements.metadataItem}>
					<span className={TaskCardClasses.elements.metadataKey}>{f.key}:</span>
					<span className={TaskCardClasses.elements.metadataValue}>{f.value || '(空)'}</span>
				</div>
			))}
		</div>
	) : null;

	const timeBadges = (() => {
		if (!config.showTimes || !config.timeFields) return null;
		const tc = config.timeFields;
		if (!tc.showCreated && !tc.showStart && !tc.showScheduled && !tc.showDue && !tc.showCancelled && !tc.showCompletion) {
			return null;
		}
		const dp = task.datePrecision || {};
		const isOverdue = !!tc.showOverdueIndicator && !!task.dueDate && task.dueDate < new Date() && !task.completed;
		const badges: Array<{ key: keyof typeof dp; label: string; date?: Date; cls: string; overdue?: boolean; show: boolean }> = [
			{ key: 'createdDate', label: i18n.t('taskCard.created'), date: task.createdDate, cls: TimeBadgeClasses.created, show: !!tc.showCreated },
			{ key: 'startDate', label: i18n.t('taskCard.start'), date: task.startDate, cls: TimeBadgeClasses.start, show: !!tc.showStart },
			{ key: 'scheduledDate', label: i18n.t('taskCard.scheduled'), date: task.scheduledDate, cls: TimeBadgeClasses.scheduled, show: !!tc.showScheduled },
			{ key: 'dueDate', label: i18n.t('taskCard.due'), date: task.dueDate, cls: TimeBadgeClasses.due, overdue: isOverdue, show: !!tc.showDue },
			{ key: 'cancelledDate', label: i18n.t('taskCard.cancelled'), date: task.cancelledDate, cls: TimeBadgeClasses.cancelled, show: !!tc.showCancelled },
			{ key: 'completionDate', label: i18n.t('taskCard.done'), date: task.completionDate, cls: TimeBadgeClasses.completion, show: !!tc.showCompletion },
		];
		return (
			<div className={TaskCardClasses.elements.times}>
				{badges.map((b) => {
					if (!b.show || !b.date) return null;
					return (
						<span key={b.key} className={`${TaskCardClasses.elements.timeBadge} ${b.cls}${b.overdue ? ` ${TimeBadgeClasses.overdue}` : ''}`}>
							{b.label}:{formatDateForDisplay(b.date, dp[b.key])}
						</span>
					);
				})}
			</div>
		);
	})();

	const tags = config.showTags && task.tags && task.tags.length > 0 ? (
		<div className={TaskCardClasses.elements.tags}>
			{task.tags.map((t) => (
				<TagPillSpan key={t} label={t} showHash />
			))}
		</div>
	) : null;

	const priority = config.showPriority && task.priority && PRIORITY_ICONS[task.priority] ? (
		<div className={TaskCardClasses.elements.priority}>
			<span className={`${TaskCardClasses.elements.priorityBadge} ${PRIORITY_CLASSES[task.priority]}`}>
				{PRIORITY_ICONS[task.priority]}
			</span>
		</div>
	) : null;

	const fileLocation = config.showFileLocation ? (
		<span className={TaskCardClasses.elements.file}>{`${task.fileName}:${task.lineNumber}`}</span>
	) : null;

	const warning = config.showWarning && task.warning ? (
		<span className={TaskCardClasses.elements.warning} title={task.warning}>
			⚠️
		</span>
	) : null;

	// ===== 组装 =====
	return (
		<div
			ref={rootRef}
			className={classes.join(' ')}
			style={style}
			draggable={config.enableDrag && !virtual}
			data-task-id={config.enableDrag ? `${task.filePath}:${task.lineNumber}` : undefined}
			data-target-date={config.enableDrag && targetDate ? toISOStringLocal(targetDate) : undefined}
			onClick={(e) => {
				// 点击复选框不触发打开任务文件
				if ((e.target as HTMLElement).tagName === 'INPUT' && (e.target as HTMLInputElement).type === 'checkbox') {
					return;
				}
				handleClick();
			}}
			onDragStart={(e) => {
				if (!config.enableDrag || virtual) return;
				e.dataTransfer.effectAllowed = 'move';
				e.dataTransfer.setData('taskId', `${task.filePath}:${task.lineNumber}`);
				setCssProps(e.currentTarget, { opacity: '0.6' });
				tooltipManager.cancel();
			}}
			onDragEnd={(e) => {
				setCssProps(e.currentTarget, { opacity: '1' });
			}}
			onMouseEnter={(e) => {
				if (config.enableTooltip) tooltipManager.show(task, e.currentTarget);
			}}
			onMouseLeave={() => tooltipManager.hide()}
			onContextMenu={() => tooltipManager.cancel()}
		>
			{config.showCheckbox ? (
				<input
					type="checkbox"
					className={TaskCardClasses.elements.checkbox}
					checked={task.completed}
					onChange={(e) => {
						e.stopPropagation();
						if (virtual) {
							void (async () => {
								const meta = getVirtualMetadata(task);
								if (meta?.sourceTaskId) {
									const [filePath, lineStr] = meta.sourceTaskId.split(':');
									await openFileInExistingLeaf(app, filePath, parseInt(lineStr));
								}
							})();
							return;
						}
						handleCheckboxChange(e.target.checked);
					}}
					onClick={(e) => e.stopPropagation()}
				/>
			) : null}
			{description}
			{config.showTicktick ? (
				<>
					{task.ticktick ? <div className={TaskCardClasses.elements.ticktick}>{task.ticktick}</div> : null}
					{metadataBlock}
				</>
			) : null}
			{task.repeat ? <span className={TaskCardClasses.elements.repeatIndicator}>🔁</span> : null}
			{tags}
			{priority}
			{timeBadges}
			{fileLocation}
			{warning}
		</div>
	);
}

