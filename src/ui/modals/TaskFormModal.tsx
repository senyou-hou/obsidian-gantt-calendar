import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { Notice } from 'obsidian';
import type { App } from 'obsidian';
import type { GCTask, IPluginContext } from '../../types';
import type { CreateTaskData } from '../../utils/dailyNoteHelper';
import { createTaskInDailyNote } from '../../utils/dailyNoteHelper';
import type { TaskUpdates } from '../../tasks/taskSerializer';
import { updateTaskProperties } from '../../tasks/taskUpdater';
import { Logger } from '../../utils/logger';
import { i18n } from '../../i18n/i18n';
import { EditTaskModalClasses } from '../../utils/bem';
import { Modal } from '../components/Modal';
import { TagSelector } from './TagSelector';
import { RepeatSection } from './RepeatSection';
import { useFlatpickr, getFlatpickrInstance } from './useFlatpickr';
import { openReactModal } from './modalHost';

/**
 * 优先级选项
 */
export interface PriorityOption {
	value: 'highest' | 'high' | 'medium' | 'normal' | 'low' | 'lowest';
	label: string;
	icon: string;
}

export interface TaskFormModalProps {
	/** 创建或编辑模式 */
	mode: 'create' | 'edit';
	app: App;
	/** 创建模式需要：插件上下文 */
	plugin?: IPluginContext;
	/** 创建模式：目标日期/小时 */
	targetDate?: Date;
	targetHour?: number;
	/** 编辑模式需要：任务对象 */
	task?: GCTask;
	enabledFormats?: string[];
	allowEditContent?: boolean;
	onSuccess: () => void;
	/** 宿主关闭函数（真正卸载元素） */
	onClose: () => void;
}

const PRIORITY_OPTIONS: PriorityOption[] = [
	{ value: 'highest', label: i18n.t('common.priority.highest'), icon: '🔺' },
	{ value: 'high', label: i18n.t('common.priority.high'), icon: '⏫' },
	{ value: 'medium', label: i18n.t('common.priority.medium'), icon: '🔼' },
	{ value: 'normal', label: i18n.t('common.priority.normal'), icon: '◽' },
	{ value: 'low', label: i18n.t('common.priority.low'), icon: '🔽' },
	{ value: 'lowest', label: i18n.t('common.priority.lowest'), icon: '⏬' },
];

/** 日期字段定义 */
interface DateFieldDef {
	key: string;
	label: string;
}

const DATE_FIELDS: DateFieldDef[] = [
	{ key: 'createdDate', label: i18n.t('modals.createTask.dateFields.created') },
	{ key: 'startDate', label: i18n.t('modals.createTask.dateFields.start') },
	{ key: 'scheduledDate', label: i18n.t('modals.createTask.dateFields.scheduled') },
	{ key: 'dueDate', label: i18n.t('modals.createTask.dateFields.due') },
	{ key: 'completionDate', label: i18n.t('modals.createTask.dateFields.completion') },
	{ key: 'cancelledDate', label: i18n.t('modals.createTask.dateFields.cancelled') },
];

/** 弹窗内联样式（原 BaseTaskModal.addStyles 的内容） */
const MODAL_STYLES = `
	.${EditTaskModalClasses.block} {
		width: 100%;
	}
	.${EditTaskModalClasses.elements.scrollContainer} {
		max-height: 65vh;
		overflow-y: auto;
		overflow-x: hidden;
		margin-right: -12px;
		padding-right: 12px;
	}
	.${EditTaskModalClasses.elements.scrollContainer}::-webkit-scrollbar {
		width: 12px;
	}
	.${EditTaskModalClasses.elements.scrollContainer}::-webkit-scrollbar-track {
		background: transparent;
	}
	.${EditTaskModalClasses.elements.scrollContainer}::-webkit-scrollbar-thumb {
		background: var(--background-modifier-border);
		border-radius: 6px;
		border: 2px solid transparent;
		background-clip: content-box;
	}
	.${EditTaskModalClasses.elements.title} {
		font-size: var(--font-ui-medium);
		font-weight: 600;
		margin-bottom: 12px;
		color: var(--text-normal);
	}
	.${EditTaskModalClasses.elements.section} {
		margin-bottom: 20px;
	}
	.${EditTaskModalClasses.elements.sectionLabel} {
		display: block;
		font-weight: 600;
		margin-bottom: 8px;
		font-size: var(--font-ui-small);
		color: var(--text-normal);
	}
	.${EditTaskModalClasses.elements.sectionHint} {
		font-size: var(--font-ui-smaller);
		color: var(--text-muted);
		margin-bottom: 8px;
	}
	.${EditTaskModalClasses.elements.descTextarea} {
		width: 100%;
		min-height: 60px;
		max-height: 60px;
		padding: 8px;
		border: 1px solid var(--background-modifier-border);
		border-radius: 4px;
		background: var(--background-secondary);
		color: var(--text-normal);
		resize: none;
		overflow: auto;
		font-family: var(--font-interface);
		font-size: var(--font-ui-small);
	}
	.${EditTaskModalClasses.elements.descTextarea}:focus {
		border-color: var(--interactive-accent);
	}
	.${EditTaskModalClasses.elements.priorityGrid} {
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		gap: 6px;
		margin-top: 8px;
	}
	.${EditTaskModalClasses.elements.priorityBtn} {
		padding: 4px 2px;
		border: 1px solid var(--background-modifier-border);
		border-radius: 4px;
		background: var(--background-secondary);
		color: var(--text-normal);
		cursor: pointer;
		font-size: 11px;
		transition: all 0.15s ease;
		white-space: nowrap;
		text-align: center;
	}
	.${EditTaskModalClasses.elements.priorityBtn}:hover {
		background: var(--background-modifier-hover);
	}
	.${EditTaskModalClasses.elements.priorityBtnSelected} {
		background: var(--background-modifier-hover) !important;
		color: var(--text-normal) !important;
		border-color: transparent !important;
		border-left: 3px solid var(--interactive-accent) !important;
	}
	.${EditTaskModalClasses.elements.datesGrid} {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 10px;
	}
	.${EditTaskModalClasses.elements.dateItem} {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.${EditTaskModalClasses.elements.dateLabel} {
		font-size: var(--font-ui-smaller);
		color: var(--text-muted);
		font-weight: 500;
	}
	.${EditTaskModalClasses.elements.dateInputContainer} {
		display: flex;
		gap: 4px;
		align-items: center;
	}
	.${EditTaskModalClasses.elements.dateInput} {
		width: auto;
		padding: 4px 6px;
		border: 1px solid var(--background-modifier-border);
		border-radius: 4px;
		background: var(--background-secondary);
		color: var(--text-normal);
		font-size: var(--font-ui-smaller);
		cursor: pointer;
	}
	.${EditTaskModalClasses.elements.dateClear} {
		width: 22px;
		height: 22px;
		padding: 0;
		border: none;
		border-radius: 50%;
		background: transparent;
		color: var(--text-faint);
		cursor: pointer;
		font-size: 11px;
		line-height: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		opacity: 0.6;
		transition: opacity 0.15s;
	}
	.${EditTaskModalClasses.elements.dateClear}:hover {
		background: var(--background-modifier-hover);
		color: var(--text-normal);
	}
	.flatpickr-calendar {
		background: var(--background-primary) !important;
		border: 1px solid var(--background-modifier-border) !important;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
		border-radius: 6px !important;
		z-index: 99999 !important;
	}
	.flatpickr-day {
		color: var(--text-normal) !important;
		border-radius: 4px !important;
	}
	.flatpickr-day:hover {
		background: var(--background-modifier-hover) !important;
		border-color: var(--background-modifier-hover) !important;
	}
	.flatpickr-day.selected,
	.flatpickr-day.selected:hover {
		background: var(--interactive-accent) !important;
		border-color: var(--interactive-accent) !important;
		color: var(--text-on-accent) !important;
	}
	.flatpickr-day.today {
		border-color: var(--interactive-accent) !important;
	}
	.flatpickr-months .flatpickr-month {
		color: var(--text-normal) !important;
		fill: var(--text-normal) !important;
	}
	.flatpickr-current-month .flatpickr-monthDropdown-months {
		background: var(--background-secondary) !important;
		color: var(--text-normal) !important;
	}
	.flatpickr-weekday {
		color: var(--text-muted) !important;
	}
	.flatpickr-months .flatpickr-prev-month,
	.flatpickr-months .flatpickr-next-month {
		color: var(--text-muted) !important;
		fill: var(--text-faint) !important;
	}
	.flatpickr-time input {
		color: var(--text-normal) !important;
		background: var(--background-secondary) !important;
	}
	.flatpickr-time .flatpickr-time-separator,
	.flatpickr-time .flatpickr-am-pm {
		color: var(--text-normal) !important;
	}
	.flatpickr-time .numInputWrapper span.arrowUp::after {
		border-bottom-color: var(--text-muted) !important;
	}
	.flatpickr-time .numInputWrapper span.arrowDown::after {
		border-top-color: var(--text-muted) !important;
	}
	.${EditTaskModalClasses.elements.tagsSection} {
		margin-top: 8px;
	}
	.gc-tag-selector-label {
		display: block;
		font-weight: 600;
		margin-bottom: 8px;
		font-size: var(--font-ui-small);
		color: var(--text-normal);
	}
	.gc-tag-selector-recommended-section,
	.gc-tag-selector-selected-section {
		margin-bottom: 12px;
	}
	.gc-tag-selector-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 6px;
	}
	.gc-tag-selector-new-section {
		display: flex;
		gap: 6px;
		margin-top: 8px;
	}
	.gc-tag-selector-new-input {
		flex: 1;
		padding: 6px 10px;
		border: 1px solid var(--background-modifier-border);
		border-radius: 4px;
		background: var(--background-secondary);
		color: var(--text-normal);
		font-size: var(--font-ui-small);
	}
	.gc-tag-selector-new-input:focus {
		outline: 2px solid var(--interactive-accent);
		border-color: var(--interactive-accent);
	}
	.gc-tag-selector-new-button {
		padding: 6px 12px;
		border: 1px solid var(--background-modifier-border);
		border-radius: 4px;
		background: var(--background-secondary);
		color: var(--text-normal);
		cursor: pointer;
		font-size: var(--font-ui-small);
	}
	.gc-tag-selector-new-button:hover {
		background: var(--background-modifier-hover);
	}
	.${EditTaskModalClasses.elements.buttons} {
		display: flex;
		gap: 8px;
		justify-content: flex-end;
		margin-top: 20px;
	}
	.${EditTaskModalClasses.elements.buttons} button {
		padding: 8px 16px;
		border: none;
		border-radius: 4px;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		font-size: var(--font-ui-small);
	}
	.${EditTaskModalClasses.elements.buttons} button:hover {
		background: var(--background-modifier-hover);
	}
	.${EditTaskModalClasses.elements.buttons} button.mod-cta {
		background: var(--interactive-accent);
		color: var(--text-on-accent);
		border-color: var(--interactive-accent);
	}
	.${EditTaskModalClasses.elements.buttons} button.mod-cta:hover {
		background: var(--interactive-accent-hover);
	}
`;

/**
 * 任务创建/编辑弹窗（React，合并原 BaseTaskModal/CreateTaskModal/EditTaskModal）
 */
/**
 * 任务创建/编辑弹窗（React，合并原 BaseTaskModal/CreateTaskModal/EditTaskModal）
 */
export function TaskFormModal({
	mode,
	app,
	plugin,
	targetDate,
	targetHour,
	task,
	enabledFormats,
	allowEditContent,
	onSuccess,
	onClose,
}: TaskFormModalProps): JSX.Element {
	const [open, setOpen] = useState(true);

	// ========== 表单状态 ==========
	const [priority, setPriority] = useState<PriorityOption['value']>(
		mode === 'edit'
			? ((task?.priority as PriorityOption['value']) || 'normal')
			: (plugin?.settings.defaultTaskPriority || 'normal')
	);
	const [repeat, setRepeat] = useState<string | null>(mode === 'edit' ? (task?.repeat || null) : null);

	// 日期状态：{ key: Date | null }
	const initialDates = useMemo(() => {
		const d: Record<string, Date | null> = {};
		if (mode === 'edit' && task) {
			d.createdDate = task.createdDate || null;
			d.startDate = task.startDate || null;
			d.scheduledDate = task.scheduledDate || null;
			d.dueDate = task.dueDate || null;
			d.completionDate = task.completionDate || null;
			d.cancelledDate = task.cancelledDate || null;
		} else {
			const base = targetDate || new Date();
			const dayStart = new Date(base);
			dayStart.setHours(0, 0, 0, 0);
			d.createdDate = new Date(dayStart);
			d.dueDate = new Date(dayStart);
			d.startDate = null;
			d.scheduledDate = null;
			d.cancelledDate = null;
			d.completionDate = null;
			if (targetHour !== undefined) {
				d.dueDate = new Date(dayStart);
				d.dueDate.setHours(targetHour, 0, 0, 0);
			}
		}
		return d;
	}, [mode, task, targetDate, targetHour]);

	const [dates, setDates] = useState<Record<string, Date | null>>(initialDates);
	const [datePrecision, setDatePrecision] = useState<Record<string, 'day' | 'time'>>(
		mode === 'edit' ? (task?.datePrecision ? { ...task.datePrecision } : {}) : (targetHour !== undefined ? { dueDate: 'time' } : {})
	);
	const [selectedTags, setSelectedTags] = useState<string[]>(mode === 'edit' ? (task?.tags || []) : []);
	const [description, setDescription] = useState(mode === 'edit' ? (task?.description || '') : '');
	const descriptionRef = useRef<HTMLTextAreaElement | null>(null);

	// 编辑模式：变更跟踪
	const [priorityChanged, setPriorityChanged] = useState(false);
	const [repeatChanged, setRepeatChanged] = useState(false);
	const [datesChanged, setDatesChanged] = useState(false);
	const [contentChanged, setContentChanged] = useState(false);
	const [tagsChanged, setTagsChanged] = useState(false);

	// ========== 样式注入 ==========
	useEffect(() => {
		const styleEl = activeDocument.createElement('style');
		styleEl.textContent = MODAL_STYLES;
		activeDocument.head.appendChild(styleEl);
		return () => {
			styleEl.remove();
		};
	}, []);

	// 创建模式自动聚焦描述框
	useEffect(() => {
		if (mode === 'create') {
			const t = window.setTimeout(() => descriptionRef.current?.focus(), 100);
			return () => window.clearTimeout(t);
		}
	}, [mode]);

	const handleClose = () => {
		setOpen(false);
		onClose();
	};

	const isEdit = mode === 'edit';
	const title = isEdit ? i18n.t('modals.editTask.title') : i18n.t('modals.createTask.title');
	const saveText = isEdit ? i18n.t('common.save') : i18n.t('common.add');

	// ========== 保存逻辑 ==========
	const saveTask = async () => {
		if (mode === 'create') {
			if (!plugin) return;
			const desc = description.trim().replace(/[\r\n]+/g, ' ');
			if (!desc) {
				new Notice(i18n.t('modals.createTask.errorEmptyDescription'));
				descriptionRef.current?.focus();
				return;
			}
			if (dates.createdDate && dates.dueDate && dates.createdDate > dates.dueDate) {
				new Notice(i18n.t('modals.createTask.errorDateOrder'));
				return;
			}
			try {
				const taskData: CreateTaskData = {
					description: desc,
					priority: priority === 'normal' ? undefined : priority,
					repeat: repeat || undefined,
					createdDate: dates.createdDate!,
					startDate: dates.startDate,
					scheduledDate: dates.scheduledDate,
					dueDate: dates.dueDate!,
					completionDate: dates.completionDate,
					cancelledDate: dates.cancelledDate,
					tags: selectedTags.length > 0 ? selectedTags : undefined,
					datePrecision: Object.keys(datePrecision).length > 0 ? datePrecision : undefined,
				};
				await createTaskInDailyNote(app, taskData, plugin.settings, plugin.dailyNoteIndex);
				new Notice(i18n.t('modals.createTask.success'));
				onSuccess();
				handleClose();
			} catch (error) {
				Logger.error('CreateTaskModal', 'Error creating task:', error);
				new Notice(i18n.t('modals.createTask.error', { error: (error as Error).message }));
			}
			return;
		}

		// 编辑模式
		if (!task) return;
		try {
			const updates: TaskUpdates = {};
			if (priorityChanged) updates.priority = priority;
			if (repeatChanged) updates.repeat = repeat;
			if (datesChanged) {
				updates.createdDate = dates.createdDate;
				updates.startDate = dates.startDate;
				updates.scheduledDate = dates.scheduledDate;
				updates.dueDate = dates.dueDate;
				updates.completionDate = dates.completionDate;
				updates.cancelledDate = dates.cancelledDate;
			}
			if (contentChanged) updates.content = description;
			if (tagsChanged) updates.tags = selectedTags;

			if (Object.keys(updates).length === 0) {
				handleClose();
				return;
			}
			if (datesChanged) {
				task.datePrecision = { ...datePrecision };
			}
			await updateTaskProperties(app, task, updates, enabledFormats || []);
			onSuccess();
			handleClose();
			new Notice(i18n.t('modals.editTask.success'));
		} catch (err) {
			Logger.error('editTask', 'Failed to update task', err);
			new Notice(i18n.t('modals.editTask.error'));
		}
	};

	// 编辑模式的标签推荐：通过 Obsidian 内部 API 获取所有任务
	const allTasksForTags = useMemo(() => {
		if (mode === 'create') {
			return plugin?.taskCache.getAllTasks() || [];
		}
		const internal = (app as unknown as Record<string, Record<string, Record<string, unknown>>>).plugins
			?.plugins?.['gantt-calendar'] as { taskCache?: { getAllTasks: () => GCTask[] } } | undefined;
		return internal?.taskCache?.getAllTasks() || [];
	}, [mode, plugin, app]);

	return (
		<Modal open={open} onClose={handleClose} title={title} width={560}>
			<div className={EditTaskModalClasses.block}>
				{/* 滚动容器 */}
				<div className={EditTaskModalClasses.elements.scrollContainer}>
					{/* 1. 任务描述板块（编辑模式仅在允许时显示） */}
					{!isEdit || allowEditContent ? (
						<div className={EditTaskModalClasses.elements.section}>
							<div className={EditTaskModalClasses.elements.descContainer}>
								<label className={EditTaskModalClasses.elements.sectionLabel}>
									{isEdit ? i18n.t('modals.editTask.descriptionLabel') : i18n.t('modals.createTask.descriptionLabel')}
								</label>
								<div className={EditTaskModalClasses.elements.sectionHint}>
									{isEdit ? i18n.t('modals.editTask.submitHint') : i18n.t('modals.createTask.submitHint')}
								</div>
								<textarea
									ref={descriptionRef}
									className={EditTaskModalClasses.elements.descTextarea}
									placeholder={isEdit ? undefined : i18n.t('modals.createTask.descriptionPlaceholder')}
									value={description}
									onChange={(e) => {
										const v = e.target.value.replace(/[\r\n]+/g, ' ');
										setDescription(v);
										if (isEdit) setContentChanged(true);
									}}
									onKeyDown={(e) => {
										if (e.key === 'Enter') {
											e.preventDefault();
											void saveTask();
										}
									}}
								/>
							</div>
						</div>
					) : null}

					{/* 2. 优先级板块 */}
					<div className={EditTaskModalClasses.elements.section}>
						<div className={EditTaskModalClasses.elements.priorityContainer}>
							<label className={EditTaskModalClasses.elements.sectionLabel}>
								{i18n.t('modals.editTask.priorityLabel')}
							</label>
							<div className={EditTaskModalClasses.elements.priorityGrid}>
								{PRIORITY_OPTIONS.map(option => (
									<button
										key={option.value}
										className={[
											EditTaskModalClasses.elements.priorityBtn,
											...(option.value === priority ? [EditTaskModalClasses.elements.priorityBtnSelected] : []),
										].join(' ')}
										data-value={option.value}
										onClick={() => {
											setPriority(option.value);
											if (isEdit) setPriorityChanged(true);
										}}
									>
										{`${option.icon} ${option.label}`}
									</button>
								))}
							</div>
						</div>
					</div>

					{/* 3. 时间设置板块 */}
					<div className={EditTaskModalClasses.elements.section}>
						<div className={EditTaskModalClasses.elements.datesContainer}>
							<label className={EditTaskModalClasses.elements.sectionLabel}>
								{i18n.t('modals.editTask.datesLabel')}
							</label>
							<div className={EditTaskModalClasses.elements.datesGrid}>
								{DATE_FIELDS.map(field => (
									<DateField
										key={field.key}
										label={field.label}
										current={dates[field.key] ?? null}
										onChange={(d) => {
											setDates((prev) => ({ ...prev, [field.key]: d }));
											if (isEdit) setDatesChanged(true);
										}}
										onPrecisionChange={(precision) => {
											setDatePrecision((prev) => ({ ...prev, [field.key]: precision }));
										}}
									/>
								))}
							</div>
						</div>
					</div>

					{/* 3.5. 周期设置板块 */}
					<div className={EditTaskModalClasses.elements.section} style={{ marginBottom: '20px' }}>
						<RepeatSection
							value={repeat}
							onChange={(rule) => {
								setRepeat(rule);
								if (isEdit) setRepeatChanged(true);
							}}
							prefix={isEdit ? 'editTask' : 'createTask'}
						/>
					</div>

					{/* 4. 标签选择器 */}
					<div className={EditTaskModalClasses.elements.section} style={{ marginBottom: '20px' }}>
						<div className={EditTaskModalClasses.elements.tagsSection}>
							<TagSelector
								allTasks={allTasksForTags}
								initialTags={selectedTags}
								onChange={(tags) => {
									setSelectedTags(tags);
									if (isEdit) setTagsChanged(true);
								}}
							/>
						</div>
					</div>
				</div>

				{/* 操作按钮 */}
				<div className={EditTaskModalClasses.elements.buttons}>
					<button onClick={handleClose}>{i18n.t('common.cancel')}</button>
					<button className="mod-cta" onClick={() => void saveTask()}>
						{saveText}
					</button>
				</div>
			</div>
		</Modal>
	);
}

// ==================== 日期字段（flatpickr 封装） ====================

interface DateFieldProps {
	label: string;
	current: Date | null;
	onChange: (d: Date | null) => void;
	onPrecisionChange: (precision: 'day' | 'time') => void;
}

function DateField({ label, current, onChange, onPrecisionChange }: DateFieldProps): JSX.Element {
	const [clearOpacity, setClearOpacity] = useState(0.6);

	const inputRef = useFlatpickr<HTMLInputElement>({
		enableTime: true,
		dateFormat: 'Y-m-d H:i',
		time_24hr: true,
		allowInput: false,
		clickOpens: true,
		defaultDate: current || undefined,
		minuteIncrement: 1,
		onChange: (selectedDates: Date[]) => {
			if (selectedDates.length === 0) {
				onChange(null);
				onPrecisionChange('day');
			} else {
				const date = selectedDates[0];
				const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0;
				onPrecisionChange(hasTime ? 'time' : 'day');
				onChange(date);
			}
		},
		onOpen: () => {
			setClearOpacity(0);
			const ta = document.querySelector(`.${EditTaskModalClasses.elements.descTextarea}`);
			if (ta) ta.setAttribute('inert', '');
		},
		onClose: () => {
			setClearOpacity(0.6);
			const ta = document.querySelector(`.${EditTaskModalClasses.elements.descTextarea}`);
			if (ta) ta.removeAttribute('inert');
		},
	});

	return (
		<div className={EditTaskModalClasses.elements.dateItem}>
			<label className={EditTaskModalClasses.elements.dateLabel}>{label}</label>
			<div className={EditTaskModalClasses.elements.dateInputContainer}>
				<div className="gc-u-relative" style={{ position: 'relative' }}>
					<input
						ref={inputRef}
						type="text"
						readOnly
						className={[EditTaskModalClasses.elements.dateInput, 'gc-u-pointer'].join(' ')}
						placeholder={i18n.t('modals.editTask.datePlaceholder')}
					/>
					<button
						className={[EditTaskModalClasses.elements.dateClear, 'gc-u-clear-btn-pos'].join(' ')}
						style={{ opacity: clearOpacity }}
						onClick={(e) => {
							e.stopPropagation();
							getFlatpickrInstance(inputRef)?.clear();
							onChange(null);
							onPrecisionChange('day');
						}}
					>
						{'×'}
					</button>
				</div>
			</div>
		</div>
	);
}

// ==================== 命令式 API（兼容旧调用方） ====================

/**
 * 打开创建任务弹窗（命令式，兼容旧 new CreateTaskModal().open()）
 */
export function openCreateTaskModal(options: {
	app: App;
	plugin: IPluginContext;
	targetDate?: Date;
	targetHour?: number;
	onSuccess: () => void;
}): void {
	const close = openReactModal(
		<TaskFormModal
			mode="create"
			app={options.app}
			plugin={options.plugin}
			targetDate={options.targetDate}
			targetHour={options.targetHour}
			onSuccess={options.onSuccess}
			onClose={() => close()}
		/>
	);
}

/**
 * 打开编辑任务弹窗（命令式，兼容旧 openEditTaskModal()）
 */
export function openEditTaskModal(
	app: App,
	task: GCTask,
	enabledFormats: string[],
	onSuccess: () => void,
	allowEditContent?: boolean
): void {
	const close = openReactModal(
		<TaskFormModal
			mode="edit"
			app={app}
			task={task}
			enabledFormats={enabledFormats}
			allowEditContent={allowEditContent}
			onSuccess={onSuccess}
			onClose={() => close()}
		/>
	);
}

/** 导出类型（兼容旧 re-export） */
export type { RepeatConfig } from '../../utils/repeatRules';