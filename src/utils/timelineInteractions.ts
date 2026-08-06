/**
 * 时间轴交互工具函数
 *
 * 提供日视图和周视图共享的拖放和快速创建逻辑
 */

import { setIcon, Notice } from 'obsidian';
import type { App } from 'obsidian';
import type { GCTask, IPluginContext } from '../types';
import { updateTaskDateField } from '../tasks/taskUpdater';
import { CreateTaskModal } from '../modals/CreateTaskModal';
import { Logger } from './logger';
import { i18n } from '../i18n/i18n';

/**
 * 拖放接受事件上下文
 */
export interface DragDropAcceptedContext {
	taskId: string;
	sourceTask: GCTask;
	slot: HTMLElement;
	hour: number;
	targetDate: Date;
	app: App;
	plugin: IPluginContext;
}

/**
 * 拖放配置
 */
export interface DragDropConfig {
	/** 高亮目标元素（可以是单个元素或多个元素） */
	targets: HTMLElement[];
	/** 高亮类名 */
	highlightClass: string;
	/** 日志标签 */
	logTag: string;
	/**
	 * 可选：drop 被接受、源任务已解析后、异步写入文件之前同步调用。
	 * 用于执行乐观 DOM 更新（立即把卡片移动到目标格）并登记"抑制一次后续自动全量刷新"。
	 * 可返回一个回滚函数：当后续文件写入失败时自动调用，撤销乐观 DOM 变更。
	 */
	onDropAccepted?: (ctx: DragDropAcceptedContext) => (() => void) | void;
}

/**
 * 拖放状态管理器
 */
export class DragDropManager {
	private activeTargets: HTMLElement[] | null = null;
	private config: DragDropConfig;

	constructor(config: DragDropConfig) {
		this.config = config;
	}

	/**
	 * 为时间格设置拖放功能
	 */
	setupForSlot(
		slot: HTMLElement,
		hour: number,
		targetDate: Date,
		app: App,
		plugin: IPluginContext
	): void {
		slot.addEventListener('dragover', (e: DragEvent) => {
			e.preventDefault();
			if (e.dataTransfer) {
				e.dataTransfer.dropEffect = 'move';
			}
			// 切换高亮：先清除旧的，再设置新的
			if (this.activeTargets !== this.config.targets) {
				this.clearHighlight();
				this.config.targets.forEach(el => el.addClass(this.config.highlightClass));
				this.activeTargets = this.config.targets;
			}
		});

		slot.addEventListener('dragleave', (e: DragEvent) => {
			const related = e.relatedTarget as HTMLElement | null;
			if (related && !slot.contains(related)) {
				this.clearHighlight();
			}
		});

		slot.addEventListener('drop', (e: DragEvent) => {
			e.preventDefault();
			this.clearHighlight();
			void (async () => {
				const taskId = e.dataTransfer?.getData('taskId');
				if (!taskId) return;

				const [filePath, lineNum] = taskId.split(':');
			const lineNumber = parseInt(lineNum, 10);

			// 查找源任务
			const allTasks = plugin.taskCache.getAllTasks();
			const sourceTask = allTasks.find((t: GCTask) => t.filePath === filePath && t.lineNumber === lineNumber);
			if (!sourceTask) {
				Logger.error(this.config.logTag, 'Source task not found:', taskId);
				return;
			}

		const dateFieldName = plugin.settings.dateFilterField || 'dueDate';

			let revertOptimisticMove: (() => void) | undefined;
			if (this.config.onDropAccepted) {
				try {
					const result = this.config.onDropAccepted({
						taskId,
						sourceTask,
						slot,
						hour,
						targetDate,
						app,
						plugin,
					});
					if (typeof result === 'function') {
						revertOptimisticMove = result;
					}
				} catch (hookError) {
					Logger.error(this.config.logTag, 'onDropAccepted hook error:', hookError);
				}
			}

			try {
					// 构建新的日期时间：保持目标日期 + 新的小时
					const newDate = new Date(targetDate);
					newDate.setHours(hour, 0, 0, 0);

					// 更新 datePrecision 为 time（拖拽到时间格表示设定了时间）
					sourceTask.datePrecision = { ...sourceTask.datePrecision, [dateFieldName]: 'time' };

					// 更新任务的日期字段（带时间）
					await updateTaskDateField(
						app,
						sourceTask,
						dateFieldName,
						newDate,
						plugin.settings.enabledTaskFormats
					);

					Logger.debug(this.config.logTag, 'Task time updated via drag-drop', { taskId, hour });
				} catch (error) {
					revertOptimisticMove?.();
					Logger.error(this.config.logTag, 'Error updating task time:', error);
					new Notice(i18n.t('views.dayView.updateTimeFailed'));
				}
			})();
		});
	}

	/**
	 * 清除高亮
	 */
	private clearHighlight(): void {
		if (this.activeTargets) {
			this.activeTargets.forEach(el => el.removeClass(this.config.highlightClass));
			this.activeTargets = null;
		}
	}
}

/**
 * 快速创建配置
 */
export interface QuickCreateConfig {
	/** 创建按钮的类名 */
	createElClass: string;
}

/**
 * 为空时间格设置快速创建功能
 */
export function setupQuickCreateForSlot(
	slot: HTMLElement,
	hour: number,
	targetDate: Date,
	app: App,
	plugin: IPluginContext,
	config: QuickCreateConfig
): void {
	const createEl = slot.createDiv(config.createElClass);
	createEl.addEventListener('mouseenter', () => {
		createEl.empty();
		setIcon(createEl, 'plus');
	});
	createEl.addEventListener('mouseleave', () => {
		createEl.empty();
	});
	createEl.addEventListener('click', (e) => {
		e.stopPropagation();
		const modal = new CreateTaskModal({
			app,
			plugin,
			targetDate,
			targetHour: hour,
			onSuccess: () => {
				// vault modify event triggers incremental update automatically
			},
		});
		modal.open();
	});
}

/**
 * 在指定根节点内查找 data-task-id 匹配的任务卡片元素
 * （手动遍历属性匹配，避免对含特殊字符的 taskId 构造属性选择器）
 * @param root 查找范围（通常为当前视图容器）
 * @param taskId 任务 ID（filePath:lineNumber）
 * @returns 匹配的卡片元素，未找到返回 null
 */
export function findTaskCard(root: ParentNode | null | undefined, taskId: string): HTMLElement | null {
	if (!root || typeof root.querySelectorAll !== 'function') return null;
	const cards = root.querySelectorAll('[data-task-id]');
	for (let i = 0; i < cards.length; i++) {
		const el = cards[i] as HTMLElement;
		if (el.dataset && el.dataset.taskId === taskId) return el;
	}
	return null;
}
