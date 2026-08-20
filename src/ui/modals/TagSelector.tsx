import { useMemo, useState, type JSX } from 'react';
import type { GCTask } from '../../types';
import { i18n } from '../../i18n/i18n';
import { TagPill } from '../../components/tagPill';
import { TagClasses } from '../../utils/bem';

export interface TagSelectorProps {
	/** 所有任务（用于计算推荐标签） */
	allTasks: GCTask[];
	/** 初始已选标签 */
	initialTags?: string[];
	/** 标签变化回调 */
	onChange: (tags: string[]) => void;
}

/**
 * 标签选择器（React）
 *
 * 提供统一的标签选择界面：
 * - 推荐标签（基于频率，取前 12 个）
 * - 已选标签管理
 * - 新建标签
 */
export function TagSelector({ allTasks, initialTags, onChange }: TagSelectorProps): JSX.Element {
	const [selectedTags, setSelectedTags] = useState<Set<string>>(() => new Set(initialTags || []));
	const [newTagInput, setNewTagInput] = useState('');

	const recommendedTags = useMemo(() => {
		const frequency = new Map<string, number>();
		allTasks.forEach(task => {
			task.tags?.forEach(tag => {
				frequency.set(tag, (frequency.get(tag) || 0) + 1);
			});
		});
		return Array.from(frequency.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, 12)
			.map(([tag]) => tag);
	}, [allTasks]);

	const toggleTag = (tag: string) => {
		const next = new Set(selectedTags);
		if (next.has(tag)) {
			next.delete(tag);
		} else {
			next.add(tag);
		}
		setSelectedTags(next);
		onChange(Array.from(next));
	};

	const addNewTag = () => {
		const newTag = newTagInput.trim().replace(/^#/, '');
		if (!newTag) return;
		if (selectedTags.has(newTag)) {
			setNewTagInput('');
			return;
		}
		const next = new Set(selectedTags);
		next.add(newTag);
		setSelectedTags(next);
		setNewTagInput('');
		onChange(Array.from(next));
	};

	return (
		<div>
			{/* 推荐标签区域 */}
			<div className="gc-tag-selector-recommended-section">
				<small className="gc-tag-selector-label">{i18n.t('modals.createTask.tags.recommendedLabel')}</small>
				<div className="gc-tag-selector-grid">
					{recommendedTags.length === 0 ? (
						<small style={{ opacity: 0.5 }}>{i18n.t('modals.createTask.tags.noRecommended')}</small>
					) : (
						recommendedTags.map(tag => (
							<SelectableTagPill
								key={tag}
								label={tag}
								selected={selectedTags.has(tag)}
								onClick={() => toggleTag(tag)}
							/>
						))
					)}
				</div>
			</div>

			{/* 已选标签区域 */}
			<div className="gc-tag-selector-selected-section">
				<small className="gc-tag-selector-label">{i18n.t('modals.createTask.tags.selectedLabel')}</small>
				<div className="gc-tag-selector-grid">
					{selectedTags.size === 0 ? (
						<small style={{ opacity: 0.5 }}>{i18n.t('modals.createTask.tags.noSelected')}</small>
					) : (
						Array.from(selectedTags).map(tag => (
							<SelectableTagPill
								key={tag}
								label={tag}
								selected
								suffix="×"
								onClick={() => toggleTag(tag)}
							/>
						))
					)}
				</div>
			</div>

			{/* 新建标签输入 */}
			<div className="gc-tag-selector-new-section">
				<input
					type="text"
					className="gc-tag-selector-new-input"
					placeholder={i18n.t('modals.createTask.tags.inputPlaceholder')}
					value={newTagInput}
					onChange={(e) => setNewTagInput(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === 'Enter') {
							e.preventDefault();
							addNewTag();
						}
					}}
				/>
				<button className="gc-tag-selector-new-button" onClick={addNewTag}>
					{i18n.t('common.add')}
				</button>
			</div>
		</div>
	);
}

interface SelectableTagPillProps {
	label: string;
	selected: boolean;
	suffix?: string;
	onClick: () => void;
}

/** 可选中标签胶囊（命令式 TagPill 的 React 等效） */
function SelectableTagPill({ label, selected, suffix, onClick }: SelectableTagPillProps): JSX.Element {
	const classes = [
		TagClasses.block,
		TagClasses.colors[TagPill.getColorIndex(label)],
		TagClasses.states.selectable,
		...(selected ? [TagClasses.states.selected] : []),
	].join(' ');

	return (
		<span
			className={classes}
			data-tag={label}
			data-selected={String(selected)}
			onClick={(e) => {
				e.preventDefault();
				e.stopPropagation();
				onClick();
			}}
		>
			<span className={TagClasses.elements.label}>{`#${label}`}</span>
			{suffix ? <span className={TagClasses.elements.suffix}>{suffix}</span> : null}
		</span>
	);
}