import { useCallback, useEffect, useRef, useState, type JSX, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ContextMenuClasses } from '../../utils/bem';
import { Icon } from './Icon';

export interface ContextMenuItemDef {
	key: string;
	title: ReactNode;
	icon?: string;
	disabled?: boolean;
	onClick?: () => void;
}

export interface ContextMenuSection {
	items: ContextMenuItemDef[];
}

export interface ContextMenuTriggerProps {
	/** 触发右键菜单的目标内容 */
	children: ReactNode;
	/** 菜单内容：数组内每个元素为一段（段之间显示分隔线） */
	sections: ContextMenuSection[];
	/** 打开前回调 */
	onOpen?: () => void;
	/** 菜单类名 */
	className?: string;
}

interface MenuState {
	x: number;
	y: number;
}

/**
 * 声明式右键菜单：替换 registerTaskContextMenu + new Menu()
 * 在 contextmenu 事件位置弹出，点击外部 / Escape 关闭
 */
export function ContextMenuTrigger({
	children,
	sections,
	onOpen,
	className,
}: ContextMenuTriggerProps): JSX.Element {
	const [state, setState] = useState<MenuState | null>(null);
	const menuRef = useRef<HTMLDivElement | null>(null);

	const handleContextMenu = useCallback((e: ReactMouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		onOpen?.();
		setState({ x: e.clientX, y: e.clientY });
	}, [onOpen]);

	const close = useCallback(() => setState(null), []);

	useEffect(() => {
		if (!state) return;
		const handleClickOutside = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) close();
		};
		const handleKeydown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') close();
		};
		document.addEventListener('mousedown', handleClickOutside);
		document.addEventListener('keydown', handleKeydown);
		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
			document.removeEventListener('keydown', handleKeydown);
		};
	}, [state, close]);

	return (
		<div
			className={className}
			style={{ display: 'contents' }}
			onContextMenu={handleContextMenu}
		>
			{children}
			{state
				? createPortal(
						<div
							ref={menuRef}
							className={ContextMenuClasses.container}
							style={{ position: 'fixed', left: state.x, top: state.y }}
						>
							{sections.map((section, si) => (
								<div key={si} className={ContextMenuClasses.section}>
									{section.items.map((item) => (
										<button
											key={item.key}
											className={`${ContextMenuClasses.item}${item.disabled ? ` ${ContextMenuClasses.itemDisabled}` : ''}`}
											disabled={item.disabled}
											onClick={() => {
												if (item.disabled) return;
												close();
												item.onClick?.();
											}}
										>
											{item.icon ? <Icon icon={item.icon} className={ContextMenuClasses.itemIcon} /> : null}
											<span className={ContextMenuClasses.itemLabel}>{item.title}</span>
										</button>
									))}
								</div>
							))}
						</div>,
						document.body
					)
				: null}
		</div>
	);
}