import { useEffect, useRef, type JSX, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ModalClasses } from '../../utils/bem';
import { Icon } from './Icon';
import { MOTION, modalVariants, overlayVariants, easeOutTransition } from '../motion';

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
	/** 退出动画完成后触发（用于从宿主安全移除） */
	onExited?: () => void;
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
	onExited,
}: ModalProps): JSX.Element | null {
	const panelRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (!open) return;
		// 焦点管理：打开时记录来源并聚焦面板（键盘用户可直接 Tab 操作），
		// 关闭后把焦点归还触发元素。
		// 只依赖 open——若依赖 onClose（父组件每次渲染重建的回调），
		// 受控输入每次按键都会触发本 effect 重跑，焦点被抢回面板
		const previouslyFocused = document.activeElement as HTMLElement | null;
		panelRef.current?.focus();
		return () => {
			previouslyFocused?.focus?.();
		};
	}, [open]);

	useEffect(() => {
		if (!open) return;
		const handleKeydown = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && closeOnEsc) onClose();
		};
		document.addEventListener('keydown', handleKeydown);
		return () => {
			document.removeEventListener('keydown', handleKeydown);
		};
	}, [open, closeOnEsc, onClose]);

	const classes = [ModalClasses.overlay, className].filter(Boolean).join(' ');

	return createPortal(
		<AnimatePresence onExitComplete={onExited}>
			{open ? (
				<motion.div
					className={classes}
					variants={overlayVariants}
					initial="initial"
					animate="animate"
					exit="exit"
					transition={easeOutTransition(MOTION.dur.normal)}
					onMouseDown={(e) => {
						if (closeOnClickOutside && e.target === e.currentTarget) onClose();
					}}
				>
					<motion.div
						ref={panelRef}
						tabIndex={-1}
						className={ModalClasses.panel}
						style={width ? { width: `${width}px`, maxWidth: '90vw' } : undefined}
						variants={modalVariants}
						transition={easeOutTransition(MOTION.dur.normal)}
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
					</motion.div>
				</motion.div>
			) : null}
		</AnimatePresence>,
		document.body
	);
}