import { useEffect, useRef, type JSX, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ModalClasses } from '../../utils/bem';
import { Icon } from './Icon';

export interface ModalProps {
	open: boolean;
	onClose: () => void;
	title?: ReactNode;
	children: ReactNode;
	className?: string;
	/** 面板宽度（px），默认自适应 */
	width?: number;
	/** 点击遮罩关闭，默认 true */
	closeOnClickOutside?: boolean;
	/** Esc 关闭，默认 true */
	closeOnEsc?: boolean;
}

/**
 * 声明式模态框：portal 渲染到 body
 * 受控组件：open 由父组件状态控制，onClose 负责关闭
 */
export function Modal({
	open,
	onClose,
	title,
	children,
	className,
	width,
	closeOnClickOutside = true,
	closeOnEsc = true,
}: ModalProps): JSX.Element | null {
	const panelRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (!open) return;
		const handleKeydown = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && closeOnEsc) onClose();
		};
		document.addEventListener('keydown', handleKeydown);
		return () => document.removeEventListener('keydown', handleKeydown);
	}, [open, closeOnEsc, onClose]);

	if (!open) return null;

	const classes = [ModalClasses.overlay, className].filter(Boolean).join(' ');

	return createPortal(
		<div
			className={classes}
			onMouseDown={(e) => {
				if (closeOnClickOutside && e.target === e.currentTarget) onClose();
			}}
		>
			<div
				ref={panelRef}
				className={ModalClasses.panel}
				style={width ? { width: `${width}px`, maxWidth: '90vw' } : undefined}
			>
				{title !== undefined ? (
					<div className={ModalClasses.header}>
						<h2 className={ModalClasses.title}>{title}</h2>
						<button className={ModalClasses.closeBtn} aria-label="Close" onClick={onClose}>
							<Icon icon="x" />
						</button>
					</div>
				) : null}
				<div className={ModalClasses.content}>{children}</div>
			</div>
		</div>,
		document.body
	);
}