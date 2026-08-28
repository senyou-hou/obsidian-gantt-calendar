import { useState, type JSX } from 'react';
import type { App } from 'obsidian';
import { i18n } from '../../i18n/i18n';
import { bem, BLOCKS } from '../../utils/bem';
import { Modal } from '../components/Modal';
import { openReactModal } from './modalHost';

export interface ConfirmDialogOptions {
	confirmText?: string;
	cancelText?: string;
	isDestructive?: boolean;
}

export interface ConfirmDialogProps {
	title: string;
	message: string;
	options?: ConfirmDialogOptions;
	onResult: (value: boolean) => void;
}

/**
 * 确认对话框（React）
 */
export function ConfirmDialog({ title, message, options, onResult }: ConfirmDialogProps): JSX.Element {
	const [open, setOpen] = useState(true);

	const settle = (value: boolean) => {
		setOpen(false);
		onResult(value);
	};

	return (
		<Modal open={open} onClose={() => settle(false)} title={title}>
			<p className={bem(BLOCKS.CONFIRM_MODAL, 'message')}>{message}</p>
			<div className={bem(BLOCKS.CONFIRM_MODAL, 'actions')}>
				<button
					className={[bem(BLOCKS.CONFIRM_MODAL, 'button'), bem(BLOCKS.CONFIRM_MODAL, 'button', 'ghost')].join(' ')}
					onClick={() => settle(false)}
				>
					{options?.cancelText ?? i18n.t('modals.confirm.cancel')}
				</button>
				<button
					className={[
						bem(BLOCKS.CONFIRM_MODAL, 'button'),
						bem(BLOCKS.CONFIRM_MODAL, 'button', 'filled'),
						...(options?.isDestructive ? [bem(BLOCKS.CONFIRM_MODAL, 'button', 'destructive')] : []),
					].join(' ')}
					onClick={() => settle(true)}
				>
					{options?.confirmText ?? i18n.t('modals.confirm.confirm')}
				</button>
			</div>
		</Modal>
	);
}

/**
 * 命令式确认对话框（兼容旧 API，内部走全局 React Modal 宿主）
 */
export function showConfirmDialog(
	_app: App,
	title: string,
	message: string,
	options?: ConfirmDialogOptions
): Promise<boolean> {
	return new Promise((resolve) => {
		const close = openReactModal(
			<ConfirmDialog
				title={title}
				message={message}
				options={options}
				onResult={(value) => {
					close();
					resolve(value);
				}}
			/>
		);
	});
}