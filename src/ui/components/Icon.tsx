import { useEffect, useRef, type CSSProperties, type JSX } from 'react';
import { setIcon } from 'obsidian';

export interface IconProps {
	/** Obsidian Lucide 图标名，如 'sun'、'plus'、'settings' */
	icon: string;
	className?: string;
	style?: CSSProperties;
	'aria-label'?: string;
	title?: string;
}

/**
 * 声明式图标组件：封装 Obsidian setIcon
 * 渲染一个空 span，挂载后注入 SVG 图标（Obsidian 的 setIcon 会替换元素内容）
 */
export function Icon({ icon, className, style, 'aria-label': ariaLabel, title }: IconProps): JSX.Element {
	const ref = useRef<HTMLSpanElement | null>(null);

	useEffect(() => {
		if (ref.current) {
			setIcon(ref.current, icon);
		}
	}, [icon]);

	return <span ref={ref} className={className} style={style} aria-label={ariaLabel} title={title} />;
}