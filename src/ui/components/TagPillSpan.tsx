import type { CSSProperties, JSX } from 'react';
import { TagClasses } from '../../utils/bem';
import { TagPill } from '../../components/tagPill';

export interface ReactTagPillProps {
	label: string;
	showHash?: boolean;
	colorIndex?: number;
	className?: string;
	style?: CSSProperties;
	title?: string;
}

/**
 * React 标签胶囊组件
 * 复用原 TagPill 的 hash 颜色分配逻辑，输出相同的 BEM 类名
 */
export function TagPillSpan({
	label,
	showHash = true,
	colorIndex,
	className,
	style,
	title,
}: ReactTagPillProps): JSX.Element {
	const index = colorIndex ?? TagPill.getColorIndex(label);
	const classes = [TagClasses.block, TagClasses.colors[index]];
	if (className) classes.push(className);

	return (
		<span className={classes.join(' ')} data-tag={label} style={style} title={title}>
			<span className={TagClasses.elements.label}>{showHash ? `#${label}` : label}</span>
		</span>
	);
}